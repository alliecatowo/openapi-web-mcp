# Demo script: a spoken walkthrough

Target length ~4 minutes. One browser window, one Swagger UI page, one agent side panel. Nothing is installed on camera. Each step below has what you **DO** (hands) and what you **SAY** (voice). Read the SAY lines aloud; they are written to be spoken.

## Before recording

- `npm run dev`, open the demo. Loaded document: **Waypoint** (annotated). Server dropdown: **Sandbox**. Signed out, nothing authorized.
- Reset the demo data (`POST /admin/reset-demo`) so the audit log starts short.
- Open the agent side panel so the tool list is visible.

## The walkthrough

### 1. A normal documentation page

**DO:** Show the page. Click **Sign in** — the header shows the signed-in developer. Expand `GET /me`, **Try it out**, **Execute**. Point at the response.

**SAY:** "This is the Waypoint Projects API documentation. Ordinary Swagger UI, version 5.32. A session, a selected server, and a working Try it out. Nothing about that changed."

### 2. The same page, seen by an agent

**DO:** Open the agent panel. Show the tool list: `api.listProjects.<hash>`, `api.createTask.<hash>`, `openapi_search_operations`, `openapi_execute_batch`. Show the annotations: reads carry `readOnlyHint`, writes don't, the delete carries `destructiveHint`.

**SAY:** "Those tools came from the OpenAPI document this page just loaded. No connector, no MCP server, no token pasted anywhere. The page doesn't ask me anything — permission UX is the agent client's job. The page declares what each operation is, and the client decides what to confirm."

### 3. A read runs straight through — and leaves a receipt

**DO:** Ask the agent: *"What projects are active in this workspace?"* When the answer arrives, scroll to the `GET /projects` block and show the response now rendered in Swagger UI's own panel.

**SAY:** "A read needs no authorization, so it just runs. And look — the agent's call rendered in Swagger UI's own response panel. Every agent execution shows up where a person would look for their own. That visible receipt is the whole presence story; there is no separate agent console."

### 4. SEE vs CALL: the agent sees it, but can't call it

**DO:** Ask the agent: *"Show me the usage report."* Show the `AUTH_REQUIRED` error and the search result: listed, correctly annotated, `callable: false`, `requiresAuth: ["bearerAuth"]`. Then click **Authorize** in Swagger UI, paste the demo bearer token printed on the page (`waypoint-demo-bearer`), Close. Ask the agent again — same call, 200.

**SAY:** "Seeing is not calling. The document says this endpoint needs bearer authorization, and nobody has authorized yet — so the agent can see it exists and say what it needs, but the call is refused. I authorized in the normal Swagger dialog, the same one I'd use for Try it out. The agent's next call follows the page's live state. No re-registration, no second setup."

### 5. Something the agent cannot see

**DO:** Ask the agent: *"Charge this account fifty dollars."* Show that `POST /billing/charges` is absent from search results. Then scroll to it in Swagger UI, **Try it out**, **Execute** — it works by hand.

**SAY:** "The document marks that endpoint hidden. It is gone from the agent's capability set entirely — and still available to me, by hand, on the same page."

### 6. Locks: the person narrows the agent, this session only

**DO:** Point at the small access control under an operation block — styled like the rest of Swagger UI, no agent branding. Set `DELETE /projects/{projectId}` to **Read only**. Ask the agent to delete a project: show the `LOCKED` error and `locked: true` in its policy. Set it back to **Full access**. Then set `GET /projects` to **Hidden**: show it vanish from search and its direct tool unregister. Open the session bar under the API info and click **Reset all locks**: show the operation return. Reload the page: show every control back at Full access.

**SAY:** "This is the headline control. I don't run the billing server, so I can't annotate it — but I can still keep the agent away from it, for this session. View-only means the agent sees the operation but every call is refused. Read-only lets reads run and denies writes. Hidden removes it entirely. Locks only ever tighten what the document allows — they can never widen it — the agent has no tool that can set or even see them beyond understanding a denial, and a reload resets everything to the spec. I am never restricted: watch, the hidden endpoint still works by hand."

### 7. Shared fields: the person types half, the agent finishes

**DO:** Expand `GET /projects`, **Try it out**, type `checkout` into the `q` field — and submit nothing. Ask the agent for the operation's details and show `liveValues` echoing the typed text. Then ask the agent to list projects with no arguments: show the filtered result, and the response rendered in Swagger UI. Then reverse it: have the agent execute with a `q` value and show the UI input now holding the agent's text before you press anything.

**SAY:** "Same fields, same store, no copies. I typed half a thought into Try it out; the agent sees it, finishes the call, and submits — through Swagger's own pipeline, into Swagger's own panels. Or the agent fills and I review. Either side can start; the other completes."

### 8. A multi-step plan, checked before anything runs

**DO:** Ask: *"Create a project called Checkout reliability, then add tasks for the three most recent 500-error reports."* Show the batch run with no page prompt — the client gated the invocation, and every step was exposure-checked before the first one ran. Then show a forbidden step mixed in: nothing executes at all, no half-applied plan.

**SAY:** "Multi-step work runs as one plan, checked whole before anything executes. If one step isn't exposed, nothing runs — there is no half-applied plan to clean up."

### 9. Switch environments by hand

**DO:** Change the Swagger server dropdown from Sandbox to **Production**. Ask: *"List the active projects again."* Different data comes back.

**SAY:** "I changed the environment. The agent's tools did not change, and did not need to. They read the page's current selection at call time."

### 10. The receipts: who called what

**DO:** Ask for `GET /audit-events`, or run it in Swagger. Point at the `source` column: `webmcp-agent` on the writes the agent made, `swagger-ui` on the ones done by hand — including the hand-executed hidden endpoint from step 5 and the Try-it-out write. Then scroll back to an agent-touched operation and show its call sitting in Swagger UI's response panel.

**SAY:** "Two receipts for every agent call. Server-side, the API logs which pipeline served the request — the plugin marks its invocations, and the demo records the marker. In-page, the call sits in Swagger UI's own panels. The API can tell the difference, and so can I. One honest limit: within this demo the marker distinguishes pipeline paths; it is an audit hint, not an identity proof — any client could send that header."

### 11. Close

**SAY:** "The OpenAPI document was already the contract. WebMCP lets the live documentation page become the connector — with the person holding session locks, sharing the very same fields, and reading the receipts."

## If there is spare time

- Authorize the header key and create an export, then authorize the query key and poll its status: two schemes gating two halves of one flow. **SAY:** "Two halves of one flow, each gated on its own scheme."
- Load the **no x-webmcp** document from the switcher: the whole tool set is re-derived, hidden operations reappear, and the held write becomes callable under the page default. **SAY:** "Same plugin, unannotated document — the capability set is re-derived from whatever is loaded."
- Append `?maxTools=5` to the URL: the document exceeds the cap, direct tools disappear, and the agent falls back to `openapi_search_operations` plus `openapi_execute_operation` without losing any capability. **SAY:** "Too many operations for individual tools — discovery plus generic execution, same capability."
