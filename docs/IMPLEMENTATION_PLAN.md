# Plan: Harden, Fix, and Extend the Workflow Automation App

## Context

This repo (`apps/backend` = NestJS + Prisma/SQLite, `apps/frontend` = React 19 + Vite + `@xyflow/react`) is an n8n-style workflow builder: a DAG execution engine (`DagWalkerService`) runs node graphs (Gmail, Gemini, HTTP, CSV, conditionals, manual trigger, webhook) that users build on a React Flow canvas, with Google OAuth login.

A full exploration surfaced serious gaps across three areas, and you asked to address all of them plus explicitly requested: automatic triggers (so workflows don't need a human to click "Execute"), and loop support (both a safe loop-node primitive and literal cyclic edges on canvas). The plan below is organized so foundational fixes land before the features that depend on them — in particular, the DAG walker's correctness fix and the auth guard are prerequisites for almost everything else (loops need correct fan-in tracking; new nodes need the walker to be trustworthy; frontend needs to know the auth header scheme before wiring new fetches).

## Sequencing (why this order)

1. **Backend security fixes** (code-injection, secret leak) — standalone, zero dependencies, highest severity, do first.
2. **DAG walker correctness fix** (Kahn's-algorithm fan-in tracking) — everything else that touches the walker (loops, cycles, new trigger types) depends on this being correct first.
3. **Auth (JWT + guard)** — needed before frontend work locks in its API client, since the client must attach the right header from day one.
4. **Execution history + repo hygiene (dev.db)** — small, independent, do alongside auth.
5. **Frontend foundation** (API client, shared types, env config) — depends on knowing the auth scheme from step 3.
6. **Frontend decomposition** (break up `App.tsx`) — depends on step 5.
7. **New backend nodes/triggers** (schedule trigger, real webhook trigger, Calendar, Contacts) — depends on step 2 (walker correctness) for triggers that fire unattended.
8. **Loop node + cyclic edges** (backend walker changes + frontend UX) — depends on step 2, sequenced after other walker changes to avoid conflicting edits.
9. **Frontend UI completeness + new node UI + error/loading polish + tests** — depends on steps 5-8 being done so there's something to wire up.

---

## 1. Backend security fixes (do first, isolated)

**File: `apps/backend/src/engine/dag-walker.service.ts`** — `resolveParameters()` currently evaluates `{{ $node["id"].data.field }}`-style templates via `new Function('$node', 'return ' + expr)`, which is arbitrary JS execution reachable from the (currently unauthenticated) `POST /workflows/execute` with attacker-controlled workflow JSON.
- Replace with a restricted dot-path resolver `resolvePath(expr, nodeContext)`:
  - Regex-extract the node id from `^\$node\[(?:"([^"]+)"|'([^']+)')\]`.
  - Tokenize the remainder with `/\.([a-zA-Z_$][\w$]*)|\[(\d+)\]|\["([^"]*)"\]|\['([^']*)'\]/g` to support `.data.field`, `.data.items[0]`, `.data["key"]`.
  - Walk segments via `reduce`, short-circuiting to `undefined` on null/undefined intermediates (no throwing).
  - No `eval`/`Function`/operators supported — this intentionally narrows capability (only simple field access + string interpolation are actually used today per the frontend's config forms).
  - Keep `resolveParameters`'s public signature unchanged so callers need no changes.
- Add `apps/backend/src/engine/dag-walker.service.spec.ts` (new or extended) asserting: legitimate templates still resolve; an injection attempt (e.g. `{{ require('fs').readFileSync(...) }}`) resolves to `undefined`/literal text instead of executing; nested/array paths work.

**File: `apps/backend/src/engine/nodes/gmail.node.ts`** — delete the debug line that writes the live Google OAuth access token to `token_debug.log` on every send. Confirmed no `token_debug.log` currently exists in git/working tree, so no `git rm` needed — just delete the line. Add `token_debug.log` to `.gitignore` as defense-in-depth even though `*.log` already covers it.

---

## 2. DAG walker correctness fix (Kahn's algorithm)

**File: `apps/backend/src/engine/dag-walker.service.ts`**, `executeWorkflow()` — today's queue-based walker only checks for *failed* upstream deps, not *pending* ones, so a fan-in node (multiple incoming edges) can execute with partial/undefined `incomingData` if dequeued before all upstream branches finish.

Replace with real in-degree-counted scheduling:
- Build `inDegree: Map<nodeId, number>` (count of incoming edges per node) and seed the queue with in-degree-0 nodes (unchanged from today).
- After each node finishes (success/fail), decrement `inDegree` for each outgoing target and enqueue once it hits 0 — this guarantees a node only runs once every incoming edge's source has definitively resolved.
- Preserve `if_condition` branch-pruning semantics: track a `pruned: Set<nodeId>` for nodes reachable only via an untaken branch, so downstream in-degree still reaches zero correctly (a pruned edge decrements in-degree like a real one but doesn't contribute data) without wrongly cascading as a failure.
- Failed nodes must still propagate the decrement to their downstream children (so failure cascades correctly) rather than leaving those children stuck waiting forever.
- Add unit tests: linear chain, fan-in with branches of different lengths (regression test — assert `incomingData` is fully populated, not `[undefined, ...]`), `if_condition` with fan-in downstream of both branches.
- Note the SSE contract may need a `node-skipped`/pruned event type distinct from `node-error` so the frontend doesn't misreport pruned-but-fine branches as errors (frontend picks this up when it does SSE parsing work in step 5/9).

---

## 3. Auth: first-party JWT + guard

Pragmatic fit for this app's size: issue a backend-signed JWT at login (separate from the Google access token, which keeps flowing through `sysContext` for Gmail/Calendar/Contacts exactly as today).

- **Schema** (`apps/backend/prisma/schema.prisma`): add a `User` model (`id`, `googleId` unique, `email` unique, `name?`, `picture?`, `createdAt`) and a non-null `userId` FK on `Workflow`. Run `npx prisma migrate dev --name add_user_and_workflow_owner`.
- **`apps/backend/src/controllers/auth.controller.ts`**: after verifying the Google ID token, `prisma.user.upsert(...)` to get/create the local `User`. Sign a JWT (`jsonwebtoken`, new dependency; payload `{sub: user.id, email}`, ~7-day expiry to avoid a second refresh flow) with a new `JWT_SECRET` env var. Return it as a **new** field `app_token` alongside existing `access_token`/`refresh_token`/`user` (don't repurpose `access_token`, which the Gmail node depends on being the raw Google token).
- **New `apps/backend/src/auth/jwt-auth.guard.ts`**: reads `Authorization: Bearer <token>`, verifies with `JWT_SECRET`, attaches `request.user`, throws `UnauthorizedException` otherwise. Apply `@UseGuards(JwtAuthGuard)` at the `WorkflowsController` class level only (not `AuthController`, since login must stay open).
- **`apps/backend/src/workflows.service.ts`**: thread `userId` through every method; scope `findAll`/`findOne`/`delete`/`createOrUpdate` to the requesting user (`where: {userId}` / ownership check on update) so a user can no longer read/execute/delete another user's workflow by guessing an ID.
- **Cross-cutting dependency (critical)**: the frontend must persist the new `app_token` and attach `Authorization: Bearer <app_token>` to every `/workflows*` request the moment this guard ships — these two changes land together, not independently, or the app breaks with 401s.
- **Webhook exemption**: the new real inbound-webhook endpoint (step 7) must be excluded from this guard since external callers can't supply the app's JWT — it uses its own per-workflow secret instead (see step 7).

---

## 4. Execution history + repo hygiene

- **Schema**: make `ExecutionLog.endedAt` nullable (`DateTime?`) via migration — "in progress" runs have no end time yet.
- **New `apps/backend/src/execution-log.service.ts`**: `startExecution(workflowId)` creates a `running` row and returns its id; `finishExecution(id, status, data)` updates status/data/endedAt; `listExecutions(workflowId)` returns recent runs (cap `take: 50`, no pagination needed yet).
- **`apps/backend/src/controllers/workflows.controller.ts`**: wrap `execute`/`execute-stream` with start/finish calls; skip logging (don't fail the run) if `workflow.id` doesn't match a real saved `Workflow` row (the FK would reject it otherwise — e.g. the frontend's ad-hoc `demo_workflow` id). Add `GET /workflows/:id/executions`.
- **Repo hygiene**: add `apps/backend/dev.db` to `.gitignore`, `git rm --cached` it (keep the local file). Flag that old commits still contain historical copies — history-scrubbing is out of scope unless a real secret is suspected to have leaked via a saved workflow's plaintext Gemini API key.

---

## 5. Frontend foundation

- **`apps/frontend/.env.example`**: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_REQUIRE_LOGIN`.
- **New `apps/frontend/src/types.ts`**: mirror backend `NodeDefinition`/`EdgeDefinition`/`WorkflowDefinition` field-for-field, plus a `NodeType` union and one parameter interface per node type (existing + the new ones from step 7/8: `google_calendar`, `google_contacts`, `schedule_trigger`, `loop`).
- **New `apps/frontend/src/services/api.ts`**: single `BASE_URL` from `VITE_API_URL`; single `getAuthHeaders()` reading the stored `app_token` and returning the `Bearer` header (the one place that needed updating once step 3 landed — do it now); a small `apiFetch` wrapper that throws a typed `ApiError` instead of swallowing failures; exported `authApi`/`workflowsApi` covering every current + new endpoint (list/get/save/delete/executeStream/listExecutions). This replaces all 7 hardcoded `http://localhost:3000` occurrences (`Login.tsx:24`, `App.tsx` ×6).
- **New `apps/frontend/src/services/auth.ts`**: centralizes localStorage keys, `signOut()` that clears **all three** keys (fixes the confirmed bug where sign-out leaves `refresh_token` behind), `setSession()`, `silentRefresh()` (moved out of `executeWorkflow`).

---

## 6. Frontend decomposition

Break the 1595-line `App.tsx` into:
- `components/Sidebar/{NodePalette,SidebarBubble}.tsx`
- `components/PropertiesPanel/PropertiesPanel.tsx` + `sections/*Fields.tsx` (one small component per node type)
- `components/ContextMenus/{QuickAddMenu,NodeContextMenu,EdgeContextMenu}.tsx`
- `components/{ExecutionLogDrawer,WorkflowSelector,TopBar,UserProfileBadge}.tsx`
- `hooks/{useWorkflowApi,useExecutionStream,useTheme,useNodeMenus,useDraggableSidebar}.ts`
- `utils/{getConfigSummary,edgeColor,graph}.ts` (pure functions, easy to test)

`App.tsx` shrinks to a ~250-350 line composition root instantiating the hooks and rendering the components. Preserve the existing `window.dispatchEvent`/`addEventListener` bridge between `CustomNode.tsx` and the menu hooks — don't replace it with context/props drilling. Delete `App.css` (confirmed dead Vite-template leftover, unused).

Do this before UI completeness fixes (step 9) so those aren't done twice against the monolith and then again after decomposition.

---

## 7. New backend nodes: triggers, Calendar, Contacts

All new node types follow the existing pattern: new file in `src/engine/nodes/*.node.ts` implementing `INode`, registered in `DagWalkerService`'s constructor Map.

**Schedule trigger (`schedule_trigger`)** — biggest "no manual user" impact:
- Add `@nestjs/schedule` dependency; new `apps/backend/src/engine/schedule-registry.service.ts` using `SchedulerRegistry` for dynamic `CronJob`s keyed `wf-<workflowId>`.
- New Prisma model `ScheduledWorkflow` (cron expression, timezone, enabled, `googleRefreshToken?`, `lastRunAt`) — this is the persistence backstop so `onModuleInit()` can re-register jobs after a server restart (in-memory `SchedulerRegistry` alone loses everything on restart).
- On workflow save/delete, sync the `ScheduledWorkflow` row and the in-memory job.
- Unattended runs need a Google access token with no live browser session — store the refresh token at save time, exchange it server-side via `OAuth2Client.refreshAccessToken()` before building `sysContext` for a scheduled fire.
- Frontend: palette entry (`Clock` icon), properties panel with cron expression field + human-readable preview + enabled toggle.

**Real inbound webhook trigger**:
- New `apps/backend/src/controllers/webhooks.controller.ts`: `POST /webhooks/:workflowId/:secret`, looks up the workflow, confirms it starts with a `webhook` node, checks the secret against `parameters.webhookSecret`, executes with the HTTP body as `initialPayload`.
- `webhookSecret` generated once server-side (`crypto.randomBytes(24).toString('hex')`) when a workflow is first saved with a `webhook` start node — stored inside the existing `nodes` JSON, no schema change.
- Exempt `/webhooks/*` from the step-3 auth guard (external callers can't supply the app JWT) — the per-workflow secret in the URL is the actual authorization mechanism instead.
- Frontend: webhook properties panel gains a read-only generated URL + copy button (this is also where the existing "webhook can't be created via UI" gap gets fixed, see step 9).

**Google Calendar node (`google_calendar`)** and **Google Contacts node (`google_contacts`)**: mirror `gmail.node.ts`'s OAuth client setup exactly (`sysContext.googleAccessToken` → `google.auth.OAuth2` → versioned client). Calendar supports create/list/get actions against `google.calendar('v3')`; Contacts supports list/search against `google.people('v1')` (same endpoint the frontend's `EmailAutocomplete` already calls directly from the browser — now available server-side as workflow data). Calendar requires adding a calendar OAuth scope to `Login.tsx` (contacts scope is already requested). No new Prisma models; `googleapis` is already installed.

---

## 8. Loop node + cyclic edges

**Loop-over-items node (`loop` + `loop_end`)**: rather than teaching the whole walker generic subgraph scoping, the loop node is a deliberate special case in `dag-walker.service.ts`'s main loop: when a `loop`-type node is dequeued, the walker identifies its "loop body" subgraph (nodes between the loop node's `loop-body`-handled edge and a `loop_end` marker node), and recursively calls `executeWorkflow` on that sub-graph once per batch of the input array, aggregating results before continuing past the loop node's `done` edge. The main queue must exclude loop-body node IDs from its normal traversal (they're only ever run via the loop's recursive calls) — coordinate this exclusion with the step-2 in-degree bookkeeping so loop-body nodes aren't double-counted.

**Cyclic edges on canvas**: after step 2's correct in-degree tracking, an intentional cycle is supported by switching from a binary `executed` Set to a `visitCount` map for nodes flagged as cycle members (detected via save-time DFS/Tarjan's-SCC in `workflows.service.ts`), with a `maxIterations` cap (default e.g. 20) stored as a generic optional parameter on whichever node closes the loop (typically an `if_condition`). Hitting the cap only suppresses the loop-back edge for that node — other conditionally-chosen exit edges still fire normally, so "condition node routes outside the loop" works without special-casing.

Sequence this after step 2 and after other walker changes land, since both loop and cycle support touch the same core traversal code.

---

## 9. Frontend: new node UI, UI completeness, error/loading polish, tests

- **UI completeness fixes**: add `webhook` to both the palette and quick-add menu (confirmed it's fully implemented everywhere else but has no creation path today); reconcile the dead `bezier` `defaultEdgeOptions` vs. the `smoothstep` actually used everywhere (change the default to match); wire the sign-out fix via `services/auth.ts`.
- **New node type UI** for `google_calendar`, `google_contacts`, `schedule_trigger`, `loop`: icon + handle logic in `CustomNode.tsx` (loop needs two source handles like `if_condition`'s true/false — generalize the existing hardcoded handle-id logic into a small `getSourceHandleIds(type)` helper rather than adding more literal type checks), palette + quick-add entries, `getConfigSummary` cases, properties-panel section components.
- **Cyclic edge UX**: `utils/graph.ts` (`isBackEdge`, `isNodeInCycle`) computed at edge-creation time and stored on the edge's `data`; back-edges rendered with a dashed style; a generic `maxIterations` field shown in the properties panel whenever the selected node is detected to be part of a cycle (not per-node-type — one shared field).
- **Error/loading polish**: loading spinners for list/load/save/delete (state already tracked by `useWorkflowApi`); a lightweight toast system for failed API calls (currently only the execution-log drawer surfaces errors, and it isn't auto-opened for save/load/delete failures); inline JSON validation errors for `set_data`/`http_request` body fields instead of silently reverting the textarea.
- **Testing**: add Vitest + React Testing Library. Initial targets: `utils/graph.test.ts`, `utils/getConfigSummary.test.ts`, `hooks/useWorkflowApi.test.ts` (mocking `services/api.ts`), `CustomNode.test.tsx` (handle rendering per node type), one properties-panel field-validation test.
- **Execution history view** (nice-to-have, brief): a simple read-only panel listing runs from `GET /workflows/:id/executions`.

---

## Verification

- **Backend**: `cd apps/backend && npm run test` for the new `dag-walker.service.spec.ts` cases (injection blocked, fan-in data complete). Manually run the app (`npm run start:dev`), exercise: login → save a workflow with a fan-in (two branches joining) → execute → confirm both branches' data present; hit `POST /workflows` without an `Authorization` header and confirm 401 once the guard lands; trigger a saved webhook workflow via `curl POST /webhooks/:id/:secret` and confirm it runs; verify a `schedule_trigger` workflow fires on its cron without manual execution.
- **Frontend**: `cd apps/frontend && npm run dev`, exercise the golden path (create workflow, drag each node type including the newly-added ones, connect edges including a deliberate back-edge, save, reload, execute, watch the SSE log) and check for regressions in existing flows (Gmail send, Gemini generation, CSV input) after the decomposition. Run `npm run test` once Vitest is added.
- Confirm `git status` shows `dev.db` no longer tracked, and `token_debug.log` is not being written after a Gmail send.
