# Demo script

Target length 2:50. One browser window, one Swagger UI page, one agent side panel. Nothing is installed on camera.

## Before recording

- `npm run dev`, open the demo, and confirm the Agent Console appears bottom-right with a tool count.
- Loaded document: **Waypoint** (annotated). Server dropdown: **Sandbox**. Signed out.
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

Point at the Agent Console: selected server, page mode, and the ledger — direct, ask first, blocked, withheld.

**0:45 — 1:05 · A read runs straight through**

Ask: *"What projects are active in this workspace?"*

The answer arrives. The Agent Console logs `GET /projects` with a status and a duration.

"A read under this policy needs no permission, so it just runs — and it is still on the record."

**1:05 — 1:40 · A write stops for a person**

Ask: *"Register a webhook at https://hooks.example.com/waypoint for task events."*

A consent card appears in the console. Read it out: the operation `POST /webhooks`, the arguments, and the line under **Stated by the API document** — "Sends future API events to an external URL, so a human confirms the destination."

"That sentence is in the OpenAPI document, written by the team that owns the API. It is shown to me, not to the model."

Expand **Review arguments** to show the exact JSON. Click **Allow once**. The call runs and appears in the log.

**1:40 — 2:00 · Something the agent cannot see**

Ask: *"Charge this account fifty dollars."*

The agent reports it has no such capability. Show `POST /billing/charges` in the search results — it is not there.

Scroll to `POST /billing/charges` in Swagger UI, **Try it out**, **Execute**. It works.

"The document marks that endpoint `deny`. It is gone from the agent's capability set entirely — and still available to me, by hand, on the same page."

**2:00 — 2:30 · A multi-step plan under one approval**

Ask: *"Create a project called Checkout reliability, then add tasks for the three most recent 500-error reports."*

One consent card lists every step in order. Approve once. Watch the steps complete in the activity log.

"Every step was checked before the first one ran. If one had been forbidden, none of them would have executed — no half-applied plan."

**2:30 — 2:45 · Switch environments by hand**

Change the Swagger server dropdown from Sandbox to **Production**. The Agent Console's server line changes with it.

Ask: *"List the active projects again."*

Different data comes back.

"I changed the environment. The agent's tools did not change, and did not need to. They read the page's current selection at call time."

**2:45 — 2:55 · The receipts**

Ask for `GET /audit-events`, or run it in Swagger. Point at the `source` column: `webmcp-agent` on the writes the agent made, `swagger-ui` on the ones done by hand.

"The API can tell the difference, and so can I."

**2:55 — 3:00 · Close**

"The OpenAPI document was already the contract. WebMCP lets the live documentation page become the connector."

## If there is spare time

- Load the **no x-webmcp** document from the switcher: the whole tool set is re-derived, and the ledger falls back to the page's own permission mode.
- Append `?maxTools=5` to the URL: the document exceeds the cap, direct tools disappear, and the agent falls back to `openapi_search_operations` plus `openapi_execute_operation` without losing any capability.
