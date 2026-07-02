# Architectural Decision Records (ADRs)

This file tracks important technical decisions made during the project to provide context for future developers or AI sessions.

## 1. Monorepo Setup (pnpm workspaces)
- **Decision:** Use pnpm workspaces to manage `apps/` and `packages/`.
- **Reasoning:** Easier code sharing between backend, frontend, and worker. Sets up a clean path for extracting a public SDK in Phase 8 without schema drift.

## 2. Tech Stack Choices
- **Frontend:** React + React Flow (Industry standard for node-based UIs).
- **Backend/Worker:** NestJS + TypeScript (Provides dependency injection, module isolation perfect for a pluggable node system).
- **Queue:** Redis + BullMQ (Handles retries and async execution reliably).
- **Database:** PostgreSQL (Relational structure fits workflow logs and definitions well).

## 3. UI vs Engine Decoupling
- **Decision:** Build the execution engine (Phase 1-4) completely independently of the visual canvas (Phase 5).
- **Reasoning:** A common pitfall in building visual builders is tightly coupling the UI state to the execution state. The engine must treat the UI simply as a "JSON generator". The backend should be able to run workflows entirely via API.
