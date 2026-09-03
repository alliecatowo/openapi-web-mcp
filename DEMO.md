# DEMO.md — video production playbook

Everything needed to record and cut the submission video. Follow it top to bottom; nothing here requires a decision.

## Targets

| | |
|---|---|
| Hard limit | **Under 3:00** (Devpost rule: "must be less than three (3) minutes") |
| Target runtime | **2:50** (storyboard timings below are guides; the script is the constraint) |
| Narration word count | **435 words** at ~155 wpm |
| Audio | Voiceover required. The rules require the *audio* to cover what was built — on-screen text does not count. |
| Aspect / resolution | 1920×1080, 30 fps |
| Music | None (rules forbid unlicensed music; narration is wall-to-wall anyway) |
| Upload | YouTube, **Public** (not Unlisted) |

The narration below explicitly covers all four required points: **what was built** (segment 1), **the problem and use case** (segment 1), **how WebMCP was implemented** (segment 2), and **why WebMCP matters** (segments 5–6).

## Exact starting application state

Set this up before *every* clip (see "Reset between clips"):

1. Browser: WebMCP-capable browser, agent side panel open, window 1920×1080, browser zoom 100%, page zoom on the demo set so Swagger UI's operation blocks are legible at 1080p.
2. Open **https://openapi-web-mcp.vercel.app** (or `http://127.0.0.1:4173` after `npm install && npm run dev` — identical behaviour).
3. Click **Sign in**. Header must read `Signed in as dev@waypoint.local`.
4. Loaded document chip: **Waypoint · annotated**. Swagger server dropdown: **Sandbox**.
5. Nothing authorized (Swagger's **Authorize** dialog empty).
6. Run `POST /admin/reset-demo` from Try it out so the audit log starts short.
7. Collapse all operation blocks.
8. Hide bookmarks bar, close other tabs, mute notifications.

Demo tokens are printed on the page: `bearerAuth` → `waypoint-demo-bearer`, `waypointKey` (header `X-Waypoint-Key`) → `waypoint-demo-key`, `waypointQueryKey` (query `key`) → `waypoint-demo-query-key`.

**Never read a direct tool's hash aloud or type it from memory** — `api.<name>.<hash>` changes every load. Always let the agent discover it.

## Title cards

Three cards only. White text on `#0d1117`, Inter or system sans, centred.

| Card | Exact text | Where | Duration |
|---|---|---|---|
| **T1** | `Swagger UI WebMCP` <br> `If you can Try it out, your agent can too.` | 0:00 | 2.5 s, cross-dissolve out |
| **T2** | `The person narrows the agent. Live.` | 1:22, lower-third strip over video | 2 s |
| **T3** | `github.com/alliecatowo/openapi-web-mcp` <br> `openapi-web-mcp.vercel.app` <br> `Apache-2.0` | 2:44 | 4 s, hold to end |

## Storyboard

Each row is one **independently recordable clip**. Record them in any order; reset between each.

---

### Clip 1 — What this is · 0:00–0:20 · *why this shot exists: establishes that it is an ordinary docs page, not a bespoke agent app*

**Screen:** T1 title card over the demo page, dissolving to the live page at 0:03. Slow scroll from the hero down through two Swagger operation blocks.

**Human actions:** none on camera except the scroll. (Sign-in already done in setup — the header visibly reads `Signed in as dev@waypoint.local`.)

**Expected visible result:** an unremarkable Swagger UI 5.32 page.

**VO (52 words):**
> "This is Swagger UI WebMCP — a plugin that turns any OpenAPI documentation page into an agent interface. The problem: a developer already has a tab where they're signed in, on the right environment, with the right key. To let an agent help, all of that has to be rebuilt somewhere else."

**Edit:** cross-dissolve from T1. No zoom.

---

### Clip 2 — The tools, derived from the document · 0:20–0:40 · *why: proves the implementation is real and non-trivial, and that nothing was installed*

**Screen:** Split attention — Swagger page left, agent tool panel right. Zoom 130% on the tool list.

**Human actions:** open the agent tool panel.

**Expected visible result:** five stable tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus `api.listProjects.<hash>`, `api.createTask.<hash>`, and the rest. Reads carry `readOnlyHint`; the delete carries `destructiveHint`.

**VO (53 words):**
> "Here's how it's implemented. One import into an existing Swagger config registers tools on `document.modelContext`, compiled from the OpenAPI document this page just loaded — five core tools plus one per operation. Nothing was installed. No MCP server, no token pasted anywhere. Load a different document and the whole tool set is re-derived."

**Edit:** hard cut in. Slow zoom 100%→130% on the tool list across the segment.

---

### Clip 3 — Shared fields and a visible receipt · 0:40–1:00 · *why: this is the human-agent collaboration story — one set of fields, one transcript*

**Screen:** `GET /projects` block expanded.

**Human actions:** **Try it out**, type `checkout` into the `q` field, **do not press Execute**. Then to the agent panel.

**Agent prompt (type exactly):**
> `List the active projects.`

**Expected tool calls:** `openapi_get_operation` (showing `liveValues: { q: "checkout" }`) → `openapi_execute_operation` / `api.listProjects.<hash>` with no `q` argument.

**Expected visible result:** the filtered 200 response renders **in Swagger UI's own response panel** under `GET /projects`.

**VO (49 words):**
> "Same fields, same session, no copies. I typed half a thought into Try it out and stopped. The agent reads what's on screen, finishes the call, and submits it through Swagger's own pipeline — and the result lands in Swagger's own response panel, where I'd look for my own."

**Edit:** cut on the keystroke ending `checkout`. Zoom 140% on the response panel as it fills. Hold 1 s after.

---

### Clip 4 — SEE vs CALL · 1:00–1:22 · *why: shows authorization is inherited live from the human, not configured for the agent*

**Screen:** agent panel, then Swagger's **Authorize** dialog, then agent panel.

**Agent prompt (type exactly):**
> `Show me the usage report.`

**Expected tool calls:** `openapi_search_operations` (the operation *is* listed, `callable: false`, `requiresAuth: ["bearerAuth"]`) → execution returning structured `AUTH_REQUIRED`.

**Human actions:** click **Authorize**, paste `waypoint-demo-bearer` into `bearerAuth`, **Authorize**, **Close**. Re-send the same prompt.

**Expected visible result:** same call, now 200, rendered in Swagger UI.

**VO (60 words):**
> "Seeing isn't calling. The document says this endpoint needs bearer authorization and nobody's authorized yet — so the agent can see it and say exactly what it needs, but the call is refused. I authorize in the normal Swagger dialog, the same one I'd use myself. The agent's next call follows the page's live state. No re-registration, no second setup."

**Edit:** speed-ramp the typing of the token to 4×. Zoom 130% on the `AUTH_REQUIRED` error, then on the 200.

---

### Clip 5 — Session locks · 1:22–1:52 · *why: the headline control, and the clearest answer to "who's in charge"*

**Screen:** T2 lower-third at 1:22. `DELETE /projects/{projectId}` block, then `GET /projects`, then the session bar under the API info.

**Human actions:**
1. Point at the access control next to Try-it-out on `DELETE /projects/{projectId}`; set it to **Read only**.
2. Agent prompt: `Delete the Checkout reliability project.`
3. Set `GET /projects` to **Hidden**; agent prompt: `What projects are active?`
4. Open the session bar, click **Reset all locks**.
5. Scroll to `POST /billing/charges`, **Try it out**, **Execute** — works by hand.

**Expected tool calls:** structured `LOCKED` error with `locked: true`; then `GET /projects` absent from `openapi_search_operations` and its direct tool unregistered; then restored after reset. `POST /billing/charges` never appears in any agent result.

**VO (84 words):**
> "This is the control I care most about. I don't run the billing server, so I can't annotate it — but I can still narrow what the agent may touch, right now, from the docs page. Read-only lets reads through and denies writes. Hidden removes the operation from the agent's world entirely. Locks only ever tighten what the document allows, the agent has no tool that can change them, and a reload resets everything. I'm never restricted — watch: it still works by hand."

**Edit:** three quick cuts, one per lock state. Zoom 150% on each control as it changes. Keep the by-hand Execute at 100% so the full block is visible.

---

### Clip 6 — Switch environments · 1:52–2:10 · *why: the single clearest reason this belongs in the page rather than in a connector*

**Screen:** the Swagger server dropdown, then the agent panel.

**Human actions:** change the dropdown from **Sandbox** to **Production**.

**Agent prompt (type exactly):**
> `List the active projects again.`

**Expected visible result:** different data — Production has its own store.

**VO (48 words):**
> "This is why it belongs in the page. I changed the environment by hand. The agent's tools didn't change and didn't need to — they read the page's current selection at call time. That's the WebMCP argument: the capability is the tab, and it dies with the tab."

**Edit:** cut tight on the dropdown. Split-screen the before/after project lists for 2 s.

---

### Clip 7 — Batch, and the receipts · 2:10–2:32 · *why: proves multi-step work is safe, and that agent activity is auditable*

**Screen:** agent panel, then `GET /audit-events` response in Swagger UI.

**Agent prompt (type exactly):**
> `Create a project called Checkout reliability, then add two tasks to it. Then show me the audit events.`

**Expected tool calls:** `openapi_execute_batch` (all steps exposure-checked before any runs) → `GET /audit-events`.

**Expected visible result:** the `source` column shows `webmcp-agent` on agent writes and `swagger-ui` on the ones done by hand earlier in the recording.

**VO (54 words):**
> "Multi-step work runs as one plan, checked whole before anything executes — if one step isn't allowed, nothing runs. And every agent call leaves receipts: in the page, in Swagger's own panels, and server-side, where the API logs which pipeline served it. Agent writes, versus mine. Honestly, that's an audit hint, not identity proof."

**Edit:** zoom 140% on the `source` column. Highlight two `webmcp-agent` rows and one `swagger-ui` row with a soft rectangle.

---

### Clip 8 — Close · 2:32–2:48

**Screen:** pull back to the full page, then T3 card at 2:44.

**VO (35 words):**
> "The OpenAPI document was already the contract. WebMCP lets the live documentation page become the connector — with the person holding the locks, sharing the very same fields, and reading the receipts. It's open source."

**Edit:** slow pull-back, dissolve to T3, hold to 2:48.

---

## Reset between clips

After each clip, before recording the next:

1. Reload the page (clears all session locks).
2. Swagger **Authorize** → **Logout** on every scheme (only needed after Clip 4).
3. Confirm the server dropdown is back on **Sandbox** (only needed after Clip 6).
4. Confirm still `Signed in as dev@waypoint.local`; sign in again if not.
5. Run `POST /admin/reset-demo` from Try it out.
6. Collapse all operation blocks.
7. Start a fresh agent conversation so no prior tool results are in context.

Exception: Clip 7's audit view is more convincing if a hand-executed write already exists. Either record Clip 7 immediately after Clip 5 without resetting, or run one Try-it-out write by hand before recording it.

## Full narration script — read straight through

> This is Swagger UI WebMCP — a plugin that turns any OpenAPI documentation page into an agent interface. The problem: a developer already has a tab where they're signed in, on the right environment, with the right key. To let an agent help, all of that has to be rebuilt somewhere else.
>
> Here's how it's implemented. One import into an existing Swagger config registers tools on `document.modelContext`, compiled from the OpenAPI document this page just loaded — five core tools plus one per operation. Nothing was installed. No MCP server, no token pasted anywhere. Load a different document and the whole tool set is re-derived.
>
> Same fields, same session, no copies. I typed half a thought into Try it out and stopped. The agent reads what's on screen, finishes the call, and submits it through Swagger's own pipeline — and the result lands in Swagger's own response panel, where I'd look for my own.
>
> Seeing isn't calling. The document says this endpoint needs bearer authorization and nobody's authorized yet — so the agent can see it and say exactly what it needs, but the call is refused. I authorize in the normal Swagger dialog, the same one I'd use myself. The agent's next call follows the page's live state. No re-registration, no second setup.
>
> This is the control I care most about. I don't run the billing server, so I can't annotate it — but I can still narrow what the agent may touch, right now, from the docs page. Read-only lets reads through and denies writes. Hidden removes the operation from the agent's world entirely. Locks only ever tighten what the document allows, the agent has no tool that can change them, and a reload resets everything. I'm never restricted — watch: it still works by hand.
>
> This is why it belongs in the page. I changed the environment by hand. The agent's tools didn't change and didn't need to — they read the page's current selection at call time. That's the WebMCP argument: the capability is the tab, and it dies with the tab.
>
> Multi-step work runs as one plan, checked whole before anything executes — if one step isn't allowed, nothing runs. And every agent call leaves receipts: in the page, in Swagger's own panels, and server-side, where the API logs which pipeline served it. Agent writes, versus mine. Honestly, that's an audit hint, not identity proof.
>
> The OpenAPI document was already the contract. WebMCP lets the live documentation page become the connector — with the person holding the locks, sharing the very same fields, and reading the receipts. It's open source.

**Word count: 435.** At a brisk-but-natural 155 wpm that is **2:49** of continuous speech; at a slower 150 wpm it is 2:54, still inside the limit but with little margin. Time a read-through before recording.

If the read comes in long, cut in this order — each line is structurally optional:

1. Clip 7, final sentence: "Honestly, that's an audit hint, not identity proof." (−9 words)
2. Clip 2, final sentence: "Load a different document and the whole tool set is re-derived." (−12 words)
3. Clip 5, "Read-only lets reads through and denies writes." (−8 words)

Dropping all three brings the script to 406 words / 2:37 at 155 wpm.

## YouTube

**Title:**
```
Swagger UI WebMCP — your API docs page is the agent connector
```

**Description:**
```
Swagger UI WebMCP is a reusable Swagger UI plugin that turns any OpenAPI
documentation page into a live, session-scoped agent interface. The agent calls
the API through the exact environment, login, and request pipeline the developer
already has open in the page — no MCP server to install, no AI SDK, no bearer
token copied anywhere.

Tools are compiled from whatever OpenAPI document the page has loaded and
registered on document.modelContext: five stable core tools plus one direct tool
per exposed operation. Every call resolves against the currently selected Swagger
server and goes out through Swagger UI's own request pipeline, so the selected
environment, authorized security schemes, cookies, and interceptors are inherited
live rather than duplicated.

The human stays in charge: per-operation session locks let you narrow what the
agent may touch for this session only, publishers declare per-endpoint agent
policy in the OpenAPI document with x-webmcp, and every agent execution renders
in Swagger UI's own response panels.

Live demo: https://openapi-web-mcp.vercel.app
Source (Apache-2.0): https://github.com/alliecatowo/openapi-web-mcp

Built for the OpenAI WebMCP Challenge.

00:00 What this is
00:20 Tools derived from the OpenAPI document
00:40 Shared fields, visible receipts
01:00 See vs call: live authorization
01:22 Session locks
01:52 Switching environments
02:10 Batches and audit receipts
02:32 Close
```

**Visibility:** Public. **Category:** Science & Technology. **Comments:** on. Do **not** mark "made for kids".

## Thumbnail

**Copy (two lines, large, high contrast):**
```
YOUR API DOCS
ARE THE CONNECTOR
```

**Recommended screenshot:** the Clip 5 frame at the moment `DELETE /projects/{projectId}` is set to **Read only** — the Swagger operation block and its access control on the left, the agent's `LOCKED` error visible in the panel on the right. It is the only single frame that shows a normal docs page, an agent, and the human holding the leash at once.

Overlay the copy across the top third in white on a `#0d1117` band at 85% opacity so the Swagger block stays readable underneath.
