# AI Task Board: design direction

This document guides the local dashboard and Settings UI. It is a design specification, not a change to the event contract or implementation plan. The product requirements in [AI_Task_Tracker_PRD.md](AI_Task_Tracker_PRD.md), the task sequence in [docs/rebuild-plan.md](docs/rebuild-plan.md), and the constraints in [AGENTS.md](AGENTS.md) remain authoritative. The user has confirmed PRD section 6's proposed event rules as the v1 contract.

**Design read:** A local work monitor for people running several agents, with calm editorial typography, generous space, and precise operational detail. **ENERGY 1 / RHYTHM 2 / MOTION 1.** The visual reference is the restraint of OpenAI's interfaces: clear type, quiet surfaces, and few competing accents. The board must have its own identity and serve this product's task data.

## Product job

The first screen answers three questions in order:

1. What needs my attention now?
2. What are the agents doing, and when did they last report?
3. What happened to a task, and where did each update come from?

The board reports agent work. It does not start or control agents. A status is an event-derived fact; a stale warning is an alert about silence, not a new task status. Usage and cost are shown only when supported by reported data and configured prices.

## What the source material establishes

| Source                                                           | Design consequence                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD F1-F7                                                        | Five board states, live SSE updates, task detail, and agent-reported progress are the main interface.                                                                                                                                                                                                                   |
| PRD F8-F11, F16-F17                                              | Settings, filters, usage, event source, and stale signals need visible homes without crowding each card. Blocked work cannot be called stale.                                                                                                                                                                           |
| User-confirmed v1 event contract (PRD section 6)                 | Order by timestamp then sequence, group attempts by contract-provided attempt identity, and label token usage as cumulative per task with the latest report replacing the previous value. Surface token resets as flagged by the contract.                                                                              |
| User-confirmed integration scope                                 | Build and verify Codex as the only client now, using the stdio bridge as the initial transport. Keep generic MCP support extensible for a future client such as Claude or Antigravity; the second-client acceptance item remains open. The bridge reads the tracker URL and per-agent token from environment variables. |
| Development plan Phase 3                                         | Board, task detail, Settings, filters, and truthful unknown values are the first UI implementation targets.                                                                                                                                                                                                             |
| AGENTS.md and user direction                                     | Use Next.js App Router with React and TypeScript for a local-only dashboard. Store task metadata rather than prompts or responses; keep the API and SSE loopback-only.                                                                                                                                                  |
| [TaskTracker reference](https://github.com/yumiaura/TaskTracker) | Its README describes per-project boards, three columns, editable cards, and reconciliation of cards from different sources. Those are useful ideas to evaluate, not a feature or visual template to copy.                                                                                                               |

The App Router dashboard includes the live board, Settings, and a task history dialog backed by local Route Handlers. The screen specifications below remain the design reference. Model rates have no currency field, so the UI displays unit-neutral estimates. A browser visual pass has not been completed because this sandbox cannot reach the loopback server; the user waived the Phase 3 visual/interaction QA gate on October 13, 2026, without claiming those checks passed. See the active development plan in [docs/rebuild-plan.md](docs/rebuild-plan.md) and verification status in [docs/qa-plan.md](docs/qa-plan.md).

## Interface principles

- **Attention before totals.** Blocked, failed, and stale work should be easy to find. A row of generic metric cards would make the decision slower.
- **One task, one clear state.** Use the five contract states as the board structure. Show stale as a separate warning attached only to eligible ongoing tasks.
- **Evidence beside claims.** Put a timestamp and source in the task history; label cost as an estimate and usage as reported. Never make an absent value look like zero.
- **Dense only where useful.** The board supports scanning. The detail panel holds the complete plan and event timeline.
- **Quiet by default.** The interface earns attention with a real change of state, not decorative motion, gradients, or invented activity.

## Information architecture

1. **Board:** five status groups, project switcher, agent/model filters, a small attention count when relevant, and a visible live-connection state.
2. **Task detail:** title, agent, model when known, current state, current step, progress when reported, last report time, plan, ordered events, source labels, and available usage/cost.
3. **Usage:** totals by agent and model with a stated period and clear unknown values. Keep this separate from task triage.
4. **Settings:** agents and revocable credentials, connection instructions, model prices, and stale threshold. A credential reveal is a focused, one-time state with a clear copy action and warning that it will not be shown again.

Navigation should name only implemented destinations. The board is the default view; Settings and Usage are secondary. Task detail opens from a task card or list row and returns focus to its trigger when closed.

## Board composition

At wide desktop sizes, show Queued, Ongoing, Blocked, Done, and Failed as five aligned columns. Put each column's real task count next to its name. A compact project switcher filters to all projects, unassigned work, or one named project. Keep a move control on each task card so the user can change its project without opening task history. Project views and assignments are a browser-local presentation layer, not event metadata. A compact attention control filters to blocked, failed, and stale-flagged ongoing tasks when there are any. Its count comes from the current task data, never a sample number. Within a column, keep the most recently updated tasks easy to find; any alternate sort must be labeled.

At narrower widths, use status tabs or a status selector above a full-width task list. This preserves all five states without a clipped horizontal board. At phone widths, each row uses two readable lines before secondary metadata; the detail view fills the viewport. A filter remains accessible above the list. No control depends on drag and drop.

Each card presents, in reading order:

1. **Task title** and a textual state label, with a stale warning only when applicable.
2. **Agent** and model if reported.
3. **Current step** or a plain fallback such as "No step reported."
4. **Last report time** and reported progress if available.

Token counts and cost belong in the detail view unless space allows them without truncating the title or step. Do not show a progress bar when no progress was reported. Duration uses the documented task timing rule once the contract is settled; until then, prefer "last reported" over a possibly misleading running clock.

**Reason for this layout:** the board's main decision is which task to inspect. A readable title, state, and recent activity beat a card packed with every metric.

## Task detail

Use a single detail panel with a fixed heading and scrollable content. The top summarizes the task's current state and latest known step. The plan follows only if an agent reported one. The event history is a chronological list with time, event name, source (`mcp`, `rest`, or a verified adapter), and the short metadata that changed. Group events by the finalized attempt identity. Preserve unknown event types in history with a neutral "Unrecognized event" label and their safe metadata, while leaving task state alone.

Keep the modal centered within the viewport with a maximum height and a separately scrolling body. The title may wrap, but the close action keeps its intrinsic label width and stays visible at every supported screen size. The backdrop must visually separate the dialog from the board behind it.

Token figures are labeled "reported tokens" and describe cumulative usage per task; the latest report replaces the previous one. Make a contract-reported reset visible in task detail. Cost reads "estimated cost" and links to the model price in Settings. A task with no usage says **Tokens unavailable**. A model without a configured price says **No price**. An unavailable value never enters a displayed total as if it were zero.

**Reason for this layout:** the event sequence is the evidence behind the card; the plan explains intent, while the history explains what actually arrived.

## Settings and connection flow

The first-run path is: create an agent, reveal and copy its credential once, choose the verified Codex connection instructions, connect it, then confirm a real task event appears. Use stdio as the initial MCP bridge transport. The bridge takes its tracker URL and per-agent token from environment variables. Instructions use copyable variable names and client-specific examples. Codex is the only client in the current build-and-verify scope. Keep generic MCP support extensible; Claude and Antigravity are future candidates, and neither is currently a supported or verified client. Instructions for a second client become supported only after its selection and connection test are confirmed. Instructions do not write to user-level configuration files. If setup cannot be verified automatically, label the final step "Check for your first task" rather than claiming a successful connection.

Keep model prices in a plain editable table with units visible. Show whether an estimate is unavailable because usage is missing or because a price is missing. Place the stale threshold near the stale explanation: it applies to ongoing work only and does not move a task to another column.

**Reason for this flow:** the product succeeds when a user sees a real first task quickly. Each step should remove one source of uncertainty without exposing the credential again.

## Visual system

| Decision   | Direction                                                                                                        | Reason                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Surface    | Warm off-white `#F7F7F4`, white `#FFFFFF`, fine divider `#D8DCD7`                                                | Separates groups without making every card look raised.                          |
| Main text  | Ink `#1B1F1C`; secondary text `#4F5952`                                                                          | Keeps task titles dominant and supporting facts readable.                        |
| Accent     | Deep green `#146B50`, reserved for the active selection and primary action                                       | Gives the board one recognizable cue that does not compete with status.          |
| Dark theme | Base `#151A17`, surface `#202622`, main text `#F5F7F4`, secondary `#BAC5BC`, divider `#424C44`, accent `#84D7B1` | Supports long-running monitoring in either theme without changing the hierarchy. |
| Status     | Text labels first; restrained semantic color only for blocked, failed, and stale warnings                        | Meaning remains legible without color and warnings keep their urgency.           |
| Type       | Local system sans stack, 16 px body, 14 px secondary, 24-28 px page title, 18 px panel title                     | Avoids remote font requests and gives small metadata a clear hierarchy.          |
| Spacing    | 4, 8, 12, 16, 24, 32 px scale; more space between groups than within a card                                      | Makes relationships visible through space instead of decoration.                 |
| Shape      | 8 px card radius, 6 px controls, square dividers; shadows only for the open detail panel or menu                 | Keeps the board flat and reserves elevation for temporary layers.                |
| Icons      | Use only when text alone is less clear, such as connection state or a disclosure control                         | Avoids generic symbols that carry no task meaning.                               |
| Motion     | Short transitions for hover, focus, panel opening, and newly changed values; honor reduced-motion settings       | Updates are noticeable without an always-moving dashboard.                       |

Light and dark modes must both be usable. The listed base pairs calculate above 4.5:1 for normal text: light main 16.68:1, light secondary 6.79:1, white on the light accent 6.46:1, dark main 14.31:1, and dark secondary 8.67:1. Verify the final UI's status colors, focus ring, and non-color cues in both themes during implementation.

The board's identity is its **time-and-source trail**: compact timestamps and source labels recur in cards and history. This is a real property of agent work, so it is stronger than a decorative AI mark or stock illustration.

## UI copy and states

- First run: "No tasks yet. Connect an agent in Settings, then run a task."
- Empty filter: "No tasks match these filters." Offer a clear reset action.
- Loading: "Loading tasks..." with the board structure held steady.
- Stream disconnected: "Live updates paused. Reconnecting..." Keep the last known tasks visible and show when they were last updated.
- API error: say what failed and offer a retry action. Never silently present stale data as live.
- Blocked task: show the short reason if reported. Keep it out of stale alerts.
- Unknown usage: "Tokens unavailable" or "No price", as appropriate.

Every action shown in the UI needs a real behavior. Card activation opens detail; filter controls change results; copy controls copy their displayed value and confirm success; a dialog closes with Escape and returns focus. Do not add decorative buttons, fake activity rows, or fictional metric values.

## Implementation-ready interaction guidance

This section translates the design direction into behavior for Phase 3. It clarifies presentation and interaction only; the PRD and confirmed event contract still define the data. If an API cannot provide a value described here, show the specified unknown state rather than infer it.

### Board

- Keep the five status names and order: Queued, Ongoing, Blocked, Done, Failed. Each heading includes its current result count; zero is a valid count. Do not hide a status because it has no tasks.
- On viewports wide enough for five readable columns (target: 1200 px and above), show the aligned board. At narrower widths, show one selected status at a time with a full-width list and an always-visible status selector. Never require horizontal page scrolling to discover a status.
- The status selector and agent/model filters are native, labeled controls. Changing filters preserves the selected status where possible. Provide a clear-all action only when a filter is active; its label and accessible name must be explicit.
- The attention filter is an optional derived view, not a sixth status. It includes blocked and failed tasks plus ongoing tasks marked stale by the server. Do not locally invent a stale threshold or classify blocked tasks as stale. If no matching task exists, do not show a misleading attention count.
- Order tasks by the API's current ordering. Do not locally reorder by title or arrival time. If the API does not define an ordering, preserve its returned order until that contract is clarified.
- A task card keeps its history action and project selector independently keyboard-operable. Give the selector a task-specific accessible name. Keep status, stale warning, and last-report text visible without relying on color or hover. Long titles wrap; they are not clipped or used as the only detail trigger.
- Open the Projects index first. Show one row per project with its latest task update and status counts; selecting a row opens that project's board, which shows only tasks assigned to it. Include an Unassigned row when unassigned tasks exist. A project board links back to the index, and card controls can move tasks between projects. Project definitions and assignments remain browser-local.
- Announce a changed task count or connection state politely to assistive technology without announcing every field of every SSE update. Keep the latest tasks visible while the stream reconnects.

### Task detail

- Open detail from a card into a side panel on wide screens and a full-screen view on narrow screens. Give the panel a task-specific heading, a visible close control, and Escape-to-close behavior. On close, restore focus to the card that opened it; if that card is gone after an update, return focus to the board heading.
- In the summary, show title, textual status, agent, model when reported, current step when reported, progress only when reported, last report time, and a blocked reason when available. Missing step, model, progress, token usage, and price remain distinguishable from empty or zero values.
- Render a reported plan as a list in the order returned. Use the contract's step status labels; do not derive completion from array position or progress percentage.
- Render event history as a chronological list with timestamp, event label, source label, and only the safe metadata fields already returned for that event. Preserve unknown event types with a neutral label. Use the v1 contract order: timestamp, then server-assigned sequence.
- Group attempts by the attempt identity in the finalized event contract, and label each group clearly. Do not infer retry boundaries from event names or timestamps.
- Label usage as cumulative reported tokens per task and cost as estimated cost. A missing value is text ("Tokens unavailable" / "No price"), never a zero, blank chart segment, or included total. Make a reported token reset visible. Keep the price reference available from the cost explanation without implying a live market price.

### Usage

- Keep the usage summary separate from the board's attention path. Label the aggregation period and grouping (agent or model) beside the figures; do not present an unlabeled all-time total as though it were a selected period.
- Distinguish reported token totals from estimated cost. If any records needed for a total have unavailable usage or pricing, expose that limitation in the summary and do not silently count those records as zero.
- With no usage data, show an explanatory empty state that points to task reporting or model prices as the relevant next step. Do not show placeholder bars, zero-valued charts, or an invented sample period.

### Settings and first connection

- Use labeled sections for Agents, Connection instructions, Model prices, and Stale threshold. Keep each section independently understandable; do not mix credential management into price editing.
- Agent rows identify the agent and its token state (available, revoked, or not configured) without displaying a token. Revocation has a direct, clearly named action and a confirmation that identifies the selected agent. After revocation, show a clear success or failure message.
- A newly issued credential appears in a focused reveal-once dialog with an explicit copy action. Explain that the credential cannot be shown again, never include it in logs or persistent UI state, and clear it from the dialog when closed. If copying fails, leave the credential visible until the user closes the dialog and explain how to select it manually.
- Show the verified Codex instructions using stdio as the initial bridge transport. Keep the UI ready for a future MCP-compatible client, but do not list Claude or Antigravity as supported or verified. The two-client acceptance item stays open until a second client is selected and passes its connection test. The MCP bridge reads the tracker URL and selected agent's token from environment variables. Use placeholders for values; never put a real token in a repository example or suggest replacing unrelated settings. If setup cannot be detected, say "Check for your first task" rather than "Connected".
- Model-price rows show model name, input/output units, and the configured rate. Save and validation errors are stated next to the edited row, preserve the user's unsaved input, and do not imply that estimates update retroactively unless the API confirms that behavior.
- Explain that stale threshold applies to ongoing tasks only, and that a stale alert does not change task status. Use the API's supported unit and range; do not invent values in the UI.

### Shared states and feedback

The dashboard reads its global task list, task history, and per-agent usage summaries from the loopback-only `/v1/dashboard/*` routes. These routes validate the local Host, require any supplied Origin to match it exactly, reject cross-site Fetch Metadata, and serve GET requests without agent credentials; event writes and the existing agent-scoped REST reads still require an agent token. Task history is addressed by both agent ID and task ID so duplicate task IDs remain distinct.

- Initial load: keep the board headings and filters in place and show "Loading tasks..." in the results area. Do not render empty-state copy before the first request resolves.
- No task data: show the first-run message and a direct Settings action. Distinguish this from an active filter with no matches; the latter offers a clear filter reset.
- Request failure: keep any last successful data visible, label it as not current, state what failed in plain language, and provide a retry action. Do not replace an error with a blank board or a false empty state.
- SSE disconnect: show "Live updates paused. Reconnecting..." independently from task-fetch errors and include the last successful update time when known. A reconnect restores the live label only after the stream is open.
- Successful saves, copies, filters, and revocations have concise visible feedback. Errors identify the affected action and next step. Color may reinforce these messages but never carries the meaning alone.
- Dates use the user's local time with an unambiguous tooltip or accessible full timestamp. Relative labels such as "2 minutes ago" update at a modest cadence and always retain an exact timestamp on detail.

### Responsive, theme, and accessibility behavior

- At 1200 px and wider, use the five-column board. Below 1200 px, switch to the status-selector/list pattern. At phone widths, keep controls above the list, allow titles and metadata to wrap, and make detail fill the viewport. At 200% zoom, the page must reflow without clipped text or a forced horizontal board scroll.
- Support light and dark themes with a visible theme control. Default to the operating-system preference until the user chooses a theme; retain that preference locally. Theme changes must not alter task meaning or status ordering.
- Preserve a visible `:focus-visible` indicator for every interactive control in both themes. Use logical tab order, semantic headings and lists, labels for inputs, and native buttons/selects where practical. All actions must work without pointer or drag-and-drop.
- Dialogs and panels expose an accessible name, keep keyboard focus within a modal dialog while open, close with Escape, and return focus to the opener. Do not trap focus in a non-modal side panel.
- Respect `prefers-reduced-motion`. Keep transitions short and optional; never animate the board continuously or use motion as the only signal that data changed.
- Verify normal text contrast at 4.5:1 and essential control boundaries/focus indicators at 3:1 in both themes. Status and alert meaning must remain clear in grayscale and forced-colors mode through text labels and shape or icon cues.

### Phase 3 delivery boundary

Required by the PRD and rebuild plan: five status columns/list states, task detail and source-labeled history, a project index that opens project-specific boards, task assignment, agent/model filters, Settings for agents/tokens/MCP setup/prices, stale-threshold presentation when supported, responsive layouts, and complete loading/empty/error states. The attention filter is a derived convenience already proposed in this design direction; task search, shared project identities, duplicate review, and any adapter-driven activity remain follow-up proposals and must not block the required board. No UI should imply the product starts, pauses, retries, or otherwise controls an agent unless those controls become an explicit product requirement.

## Helpful features to evaluate beyond the reference

These are proposals for product planning, not approved schema or API changes. They should be prioritized after the existing plan's contract and core board work.

| Proposal                                                                      | User benefit                                                                    | Dependency / boundary                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Attention view** combining blocked, failed, and stale-flagged ongoing tasks | Answers "what needs me?" across all five columns and agents                     | Can derive from F1, F11, and F17. It is a filter, not a new status.                                                                       |
| **Last report and connection clarity**                                        | Distinguishes an agent that is silent from a dashboard stream that disconnected | Derive task freshness from stored event times; show SSE connection separately. Do not claim an agent is online from a recent event alone. |
| **Task search by title or ID**                                                | Makes a large local history useful after the board grows                        | Add after filters. Keep the query local/private; decide API and performance approach against the 10,000-tasks-per-day target.             |
| **Shared project identities** inspired by the reference                       | Makes cross-project work easier to scan across browsers and agent clients        | Requires an explicit project identity and persistence contract. The current browser-local assignment stays out of task events.            |
| **Duplicate review** inspired by the reference                                | Helps when two sources describe the same work                                   | Only after identity and source rules are settled. Require human review before merging history; do not infer equality from similar titles. |

The reference also supports prompt-derived cards and automatic lifecycle mirroring. This product's metadata-only privacy rule and fixture requirement mean those are not assumed capabilities. A future adapter must first pass Phase 0 verification and use a documented supported signal.

## Implementation and review checkpoints

- **Phase 0:** document the confirmed v1 event semantics that affect visible attempts, ordering, progress, and cumulative usage labels. Verify Codex connection instructions and record the tested version. Keep second-client selection and verification open; do not claim support for Claude, Antigravity, or another client before that work is completed. Record any design changes caused by verification.
- **Phase 3:** build the Next.js/React board, detail, filters, Settings, and all empty/loading/error states from this guide. Use real API data, including late events and unknown values.
- **Phase 4:** check stale alerts, price estimates, and usage summaries against recorded events and configured prices.
- **Visual review:** normally inspect wide desktop, tablet, and phone widths in light and dark modes. The user waived this review for the current Phase 3 gate on October 13, 2026; it was not performed and must not be described as passed. Verify no horizontal overflow, readable long titles, keyboard-only navigation, focus return, and reduced motion if a later review is scheduled.
- **Behavior review:** exercise a complete task lifecycle through both documented inputs and confirm the UI reflects the same event history. A future source reconciliation or project feature needs its own contract decision and tests.

The design is complete when someone can locate a blocked or failed task quickly, explain its latest state from the history, and connect a second agent using Settings without guessing what the board has verified.
