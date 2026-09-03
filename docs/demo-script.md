# Demo script

Target length 2:50. One browser window, one Swagger UI page, one agent side panel. Nothing is installed on camera.

## Before recording

- `npm run dev`, open the demo. Loaded document: **Waypoint** (annotated). Server dropdown: **Sandbox**. Signed out, nothing authorized.
- Reset the demo data (`POST /admin/reset-demo`) so the audit log starts short.
- Confirm agent-driven writes land in `GET /audit-events` with source `webmcp-agent`. The demo API reads the `X-Waypoint-Client: webmcp-agent` request header to distinguish agent traffic from a human using Try it out.

## Script

**0:00 — 0:25 · A normal documentation page**

"This is the Waypoint Projects API documentation. Ordinary Swagger UI, version 5.32."

Click **Sign in** — the header shows the signed-in developer. Expand `GET /me`, **Try it out**, **Execute**. Point at the response.

"A session, a selected server, and a working Try it out. Nothing about that changed."

**0:25 — 0:45 · The same page, seen by an agent**

Open the agent panel. Show the tool list: `api.listProjects.<hash>`, `api.createTask.<hash>`, `openapi_search_operations`, `openapi_execute_batch`.

"Those came from the OpenAPI document this page just loaded. No connector, no MCP server, no token pasted anywhere."

Show the annotations: reads carry `readOnlyHint`, writes don't, the delete carries `destructiveHint`.

"The page doesn't ask me anything — permission UX is the agent client's job. The page declares what each operation is, and the client decides what to confirm."

**0:45 — 1:05 · A read runs straight through**

Ask: *"What projects are active in this workspace?"*

The answer arrives with a receipt flag showing it rendered in Swagger UI's own response panel.

"A read needs no authorization, so it just runs — and it is still on the record, in Swagger UI itself."

**1:05 — 1:40 · SEE vs CALL: the agent sees it, but can't call it**

Ask: *"Show me the usage report."*

The agent reports the operation exists, needs `bearerAuth`, and returns `AUTH_REQUIRED`. Show the search result: listed, correctly annotated, `callable: false`.

"Seeing is not calling. The document says this endpoint needs bearer authorization, and nobody has authorized yet."

Click **Authorize** in Swagger UI, paste the demo bearer token from the page (`waypoint-demo-bearer`), Close. Ask again. The same call now returns 200.

"I authorized in the normal Swagger dialog — the same one I'd use for Try it out. The agent's next call follows the page's live state. No re-registration, no second setup."

**1:40 — 2:00 · Something the agent cannot see**

Ask: *"Charge this account fifty dollars."*

The agent reports it has no such capability. Show `POST /billing/charges` in the search results — it is not there.

Scroll to `POST /billing/charges` in Swagger UI, **Try it out**, **Execute**. It works.

"The document marks that endpoint `hidden`. It is gone from the agent's capability set entirely — and still available to me, by hand, on the same page."

**2:00 — 2:30 · A multi-step plan, checked before anything runs**

Ask: *"Create a project called Checkout reliability, then add tasks for the three most recent 500-error reports."*

The batch runs with no page prompt — the client gates the invocation, and every step was exposure-checked before the first one ran. Show what happens with a forbidden step mixed in: nothing executes at all, no half-applied plan.

**2:30 — 2:45 · Switch environments by hand**

Change the Swagger server dropdown from Sandbox to **Production**.

Ask: *"List the active projects again."*

Different data comes back.

"I changed the environment. The agent's tools did not change, and did not need to. They read the page's current selection at call time."

**2:45 — 2:55 · The receipts**

Ask for `GET /audit-events`, or run it in Swagger. Point at the `source` column: `webmcp-agent` on the writes the agent made, `swagger-ui` on the ones done by hand.

"The API can tell the difference, and so can I."

**2:55 — 3:00 · Close**

"The OpenAPI document was already the contract. WebMCP lets the live documentation page become the connector."

## If there is spare time

- Authorize the header key and create an export, then authorize the query key and poll its status: two schemes gating two halves of one flow.
- Load the **no x-webmcp** document from the switcher: the whole tool set is re-derived, hidden operations reappear, and the held write becomes callable under the page default.
- Append `?maxTools=5` to the URL: the document exceeds the cap, direct tools disappear, and the agent falls back to `openapi_search_operations` plus `openapi_execute_operation` without losing any capability.
