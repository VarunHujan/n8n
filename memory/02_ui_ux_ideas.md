# UI / UX Ideas Backlog

This document captures features, interactions, and design ideas for the visual canvas (Phase 5). Capturing them here ensures we don't forget them while we build the backend engine.

## Node Connection Interactions
- **The Problem:** Default small dots (handles) in React Flow are frustrating to click accurately.
- **Proposed Solution (The "Locked Box" approach):**
  - Trigger: Use a **Right-Click Custom Context Menu** on the node. When the user right-clicks, a sleek menu appears with a "Lock Node for Connection" option.
  - Visual Feedback: Once locked, the node's styling changes (e.g., a glowing border or a 'locked' icon appears) to indicate its state has changed.
  - Interaction: While locked, the entire surface area of the node becomes a connection source (a hidden, full-size React Flow `<Handle />`). 
  - Instead of hunting for the small dot, the user can click and drag from *anywhere* on that locked box to draw a connection edge.
  - Dropping that edge onto another node connects them seamlessly.
  - This provides a massive usability improvement for quickly wiring up complex flows.

## Right-Click Context Menu (Node Actions)
- **The Problem:** Immediately locking a node on right-click limits future functionality.
- **Proposed Solution:** Right-clicking a node should open a custom context menu overlay.
  - **Options:**
    - "Lock / Unlock Node" (toggles the giant handles for easy connecting)
    - "Linked Nodes" (highlights or lists all upstream/downstream dependencies)
    - "Delete Node"
    - "Duplicate Node"

## Edge Deletion & Management
- Currently, edges are deleted by clicking them (selection) and pressing `Backspace`/`Delete` on the keyboard (native React Flow behavior).
- In the future, we may want to add an explicit `x` button on the edge paths or an "Unlink" option in the context menus.
