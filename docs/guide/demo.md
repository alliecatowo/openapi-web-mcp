# Live demo

**<https://openapi-web-mcp.vercel.app>** — open it in ChatGPT's in-app browser or Chrome with WebMCP enabled.

Nothing is behind a login — reads and writes both work the moment the page loads. Leave the document on **Waypoint** and the Swagger server dropdown on **Sandbox**, then paste this prompt to your agent:

> **You have WebMCP tools on this page. Call `openapi_get_context` and tell me which API and environment I'm on. Then list the active projects. Then try to fetch the usage report and tell me exactly why it fails and what I'd have to do. Finally create a project called "Checkout reliability", add a task to it, and read `GET /audit-events` to show me which writes came from an agent.**

That one prompt exercises discovery, a read, a `requiresAuth` gate refusing a call the agent can nonetheless *see*, two writes, and the audit fingerprint.

Then, by hand, do any of these and ask again — the agent adapts with no reconfiguration:

- Click **Authorize**, paste `waypoint-demo-bearer` for `bearerAuth`, and re-ask for the usage report. It now returns 200.
- Switch the server dropdown to **Production** and ask for the projects again. Different data store, same tools.
- Set `DELETE /projects/{projectId}` to **Read only** and ask the agent to delete a project. It gets a structured `LOCKED` error — then set it back and watch the same call succeed.
- Ask the agent to charge the account $50. `POST /billing/charges` is `tool: hidden` — it is absent from the agent's capability set entirely, while you can still run it yourself in Try it out.
- Ask the agent to start an export. `POST /exports` is `costHint`-flagged rather than hidden: the tool stays registered and callable (once `waypointKey` is authorized), but carries `costHint: true` and a `costNote` explaining it bills metered processing minutes — a client that reads annotations can choose to confirm with you first, unlike the flat refusal `hidden` gives.
- Load the **Waypoint — no x-webmcp** document from the switcher, or paste any OpenAPI URL. The tool set is re-derived from whatever is loaded.

The demo API is real and stateful, not a stub: 28 operations covering every HTTP method, path/query/header parameters, repeated array query parameters, cursor pagination, `If-Match` optimistic concurrency returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload deliberately unsupported as a direct tool, two hidden operations, a write held at read, a `costHint`-flagged write, three `requiresAuth` gates across three scheme types, and deliberate 401/404/422 paths — with separate Sandbox and Production data stores.

**Sign in** is optional: it shares a browser session with the agent and shows in the audit log, but never blocks a call. Exactly three operations require authorization — they declare it in the document, so Swagger draws its padlock on them and nowhere else.

Demo credentials (nothing real is protected by them): `bearerAuth` → `waypoint-demo-bearer`; `waypointKey` header `X-Waypoint-Key` → `waypoint-demo-key`; `waypointQueryKey` query `key` → `waypoint-demo-query-key`.
