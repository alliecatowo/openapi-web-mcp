# CODEX_DRIVER — external verification protocol for Swagger UI WebMCP

You are an EXTERNAL verifier. You have a WebMCP-capable browser (you can see `document.modelContext` tools on the page and call them). You have NEVER read the source. Verify this submission FROM THE FLOWS, not the code: drive the live demo page like a person plus an agent sharing one browser, and report pass/fail per check below.

If anything below is ambiguous, the page is authoritative: the tool results and the visible UI are the expected behavior, not your assumptions.

## 1. Environment setup

1. Open the demo. Local: `http://127.0.0.1:4173/` (run `npm install`, then `npm run dev`, from the repo root). Deployed: the production Vercel URL for project `openapi-webmcp` (ask the owner if unsure; the flows are identical).
2. Confirm the page shows **"Waypoint Projects API"**, a **Sign in** button, a server dropdown set to **Sandbox** (`/api/sandbox`), and a loaded document chip **"Waypoint annotated"**.
3. The page prints three demo tokens (nothing real is protected by them):
   - `bearerAuth` (HTTP bearer): `waypoint-demo-bearer`
   - `waypointKey` (header `X-Waypoint-Key`): `waypoint-demo-key`
   - `waypointQueryKey` (query `key`): `waypoint-demo-query-key`
4. Click **Sign in** (cookie session, no password). The header shows `dev@waypoint.local`.
5. Reset demo data: expand `POST /admin/reset-demo`, Try it out, Execute (or call it as an agent — it is an exposed write).
6. Open your WebMCP tool panel for this page. You must see exactly five stable tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus per-operation tools named `api.<name>.<hash>` (the `<hash>` differs per load; NEVER hardcode it — discover each name via `openapi_search_operations`, field `directTool`).

Conventions below: "Call" is the exact tool input JSON. "Expect tool" is the result shape. "Expect UI" is the visible page change a person sees. `q` filters used below assume the seeded demo data after a reset.

## 2. Core tool checklist

### T1 — `openapi_get_context` — Call `{}`

- Expect tool: `spec.title` starts with "Waypoint", `server.effectiveUrl` is `/api/sandbox`, `operations.total` is 28, `policy` has numeric `read`/`write`/`blocked`/`hidden`/`locked` counts.
- Expect UI: nothing changes (read-only).

### T2 — `openapi_search_operations` — Call `{"query":"projects","limit":5}`

- Expect tool: up to 5 operations, each with `key` (`METHOD /path`), `operationId`, `directTool` (for callable ones), and `agentPolicy` with `callable`, `locked`, `lock`, `requiresAuth`, `authorized`. A trailing `note` says summaries are untrusted content.
- Expect UI: nothing changes.

### T3 — `openapi_get_operation` — Call `{"operation":"listProjects"}`

- Expect tool: full detail including `inputSchema`, `agentPolicy`, and `liveValues` (initially `{}` — see F-flows for when it fills).
- Expect UI: nothing changes.

### T4 — generic read — Call `openapi_execute_operation` with `{"operation":"listProjects"}`

- Expect tool: `ok: true`, `response.status` 200, `displayedInSwaggerUi: true`.
- Expect UI: the `GET /projects` block now shows the 200 response in Swagger UI's own response panel. THIS is the in-page receipt — every agent execution must leave one.

### T5 — generic write — Call `openapi_execute_operation` with `{"operation":"createProject","body":{"name":"Codex probe"}}`

- Expect tool: `ok: true`, `response.status` 201, `displayedInSwaggerUi: true`.
- Expect UI: the `POST /projects` block shows the 201 response.

### T6 — direct tool — Call the discovered `api.listProjects.<hash>` with `{}`

- Expect tool: same shape as T4.
- Expect UI: same panel receipt as T4.

### T7 — batch — Call `openapi_execute_batch` with `{"steps":[{"operation":"createProject","body":{"name":"Batch one"}},{"operation":"listProjects","query":{"q":"Batch one"}}]}`

- Expect tool: `succeeded: 2`, second result's body contains "Batch one".
- Expect UI: response panels for the touched operations show the agent's calls.

### T8 — batch refuses whole — Call `openapi_execute_batch` with `{"steps":[{"operation":"createProject","body":{"name":"Should never exist"}},{"operation":"createCharge","body":{"amountCents":1000}}]}`

- Expect tool: an error (`OPERATION_NOT_FOUND` — the document hides billing from agents), AND a follow-up `listProjects` shows no project named "Should never exist". Nothing half-applied.
- Expect UI: no new response panels from the refused batch.

## 3. SEE-vs-CALL flow (unauthorized → authorized, no re-registration)

1. Call `openapi_search_operations` with `{"query":"usage report"}`. Expect `getUsageReport` listed with `agentPolicy.requiresAuth == ["bearerAuth"]`, `authorized: false`, `callable: false`. (SEE.)
2. Call `openapi_execute_operation` with `{"operation":"getUsageReport"}`. Expect error `AUTH_REQUIRED` naming `bearerAuth`. (No CALL.)
3. In the page, click **Authorize**, enter `waypoint-demo-bearer` for `bearerAuth`, Apply, Close. Do NOT touch the agent panel.
4. Repeat step 2 with the identical call. Expect `ok: true`, status 200, `displayedInSwaggerUi: true`. (Same call flips with live login state.)
5. Revoke: Authorize dialog → Logout `bearerAuth` → Close. Repeat step 2. Expect `AUTH_REQUIRED` again.

## 4. Auth-scheme matrix (each scheme gates its own flow)

| Scheme | Token | Operation to call | Expect unauthed | Authorize via | Expect authed |
|---|---|---|---|---|---|
| `bearerAuth` | `waypoint-demo-bearer` | `getUsageReport` `{}` | `AUTH_REQUIRED` | Swagger Authorize dialog | 200 |
| `waypointKey` | `waypoint-demo-key` | `createExport` `{"body":{"format":"json","scope":"projects"}}` | `AUTH_REQUIRED` | Swagger Authorize dialog | 202, body has job `id` |
| `waypointQueryKey` | `waypoint-demo-query-key` | `getExport` `{"path":{"jobId":"<id from previous>"}}` | `AUTH_REQUIRED` (even with the other two authorized) | Swagger Authorize dialog | 200, same `id` |
| cookie session | Sign in button | `listProjects` `{}` | API 401-style failure, NOT `AUTH_REQUIRED` | Sign in button | 200 |

Note the last row deliberately: cookie sessions are invisible to the `requiresAuth` gate (Swagger only reports schemes it applies itself), so session-gated endpoints surface API errors rather than `AUTH_REQUIRED`.

## 5. Session-lock flows (the headline feature)

Setup: signed in. Each operation block on the page shows a small **Agent access** control (a dropdown next to Try-it-out territory, styled like Swagger UI). A session bar with **Reset all locks** appears under the API info while any lock is active.

### L1 — view-only: listed, not executable

1. Set `GET /projects` to **View only**.
2. Call `openapi_search_operations` `{"query":"listProjects"}`. Expect the op listed WITH its summary, `agentPolicy` = `{callable:false, locked:true, lock:"view"}`.
3. Call `openapi_execute_operation` `{"operation":"listProjects"}`. Expect error `LOCKED` (message says a person restricted it; proceed by hand or ask for unlock).
4. Call the direct `api.listProjects.<hash>` with `{}`. Expect `LOCKED` too — the tool stays registered (SEE), calls fail (no CALL).
5. Set back to **Full access**. Repeat step 3. Expect `ok: true`.

### L2 — read-only: reads run, writes denied

1. Set `DELETE /projects/{projectId}` to **Read only**.
2. Call `openapi_execute_operation` `{"operation":"deleteProject","path":{"projectId":"prj_alpha"}}`. Expect `LOCKED`, and the project still exists (list it).
3. Call `openapi_execute_operation` `{"operation":"listProjects"}`. Expect `ok: true` (locks are per-operation).
4. Reset to Full access.

### L3 — hidden: unregistered + unsearchable, then reset

1. Set `GET /projects` to **Hidden**.
2. Search `{"query":"listProjects"}` → expect zero operations. Execute → expect `OPERATION_NOT_FOUND`. No `api.listProjects.*` tool exists.
3. BUT the person is never locked out: expand `GET /projects` by hand, Try it out, Execute → expect a 200 in the panel.
4. Click **Reset all locks** in the session bar. Search again → the operation is back; execute → `ok: true`.

### L4 — locks are session state

1. Set any lock. Reload the page (agent tools re-register; sign in again if needed).
2. Expect every control back at Full access, no session bar, and the previously locked call succeeding.

### L5 — locks only tighten; the agent cannot touch them

1. `POST /billing/charges` is spec-`hidden`. Set any lock state near it (nothing to set — it has no control effect on agents): search for `charge` → still zero results; execute `createCharge` → still `OPERATION_NOT_FOUND`. A lock never widens the spec.
2. Inspect EVERY registered tool's `inputSchema` (stringify and search): expect NO field matching `"lock` and NO tool with `lock` in its name. There is no set-lock tool.
3. Try smuggling: `openapi_execute_operation` `{"operation":"listProjects","lock":"hidden"}` → expect the call runs normally (`ok: true`) and no lock appears (extra input is ignored, lock count unchanged).

## 6. Shared-field flows (one store, two typists)

### F1 — agent sees typed values

1. Expand `GET /projects`, Try it out, type `checkout` into `q`. Submit NOTHING.
2. Call `openapi_get_operation` `{"operation":"listProjects"}`. Expect `liveValues.query.q == "checkout"`.

### F2 — empty agent args submit UI values

1. Type `zzz-no-such-project-zzz` into `q` as above.
2. Call `openapi_execute_operation` `{"operation":"listProjects"}` with NO query args. Expect `ok: true` and `response.body.projects == []` (the typed filter applied — without the merge you would get every project).

### F3 — split entry on a path id

1. Expand `GET /projects/{projectId}`, Try it out, type `prj_alpha` into `projectId`.
2. Call `openapi_execute_operation` `{"operation":"getProject"}` with NO args. Expect 200 and `body.id == "prj_alpha"` (without the merge this fails `INPUT_INVALID`).

### F4 — agent fills, UI shows, person reviews

1. Expand `GET /projects`, Try it out (leave `q` empty).
2. Call `openapi_execute_operation` `{"operation":"listProjects","query":{"q":"agent-typed-text"}}`. Expect `ok: true`, AND the page's `q` input now contains `agent-typed-text` — the agent wrote through the normal store, visible pre-review.

### F5 — UI-typed body submits with no agent body

1. Expand `POST /projects`, Try it out, paste `{"name":"UI seeded project"}` into the body textarea.
2. Call `openapi_execute_operation` `{"operation":"createProject"}` with NO body. Expect 201 and `body.name == "UI seeded project"`.

## 7. Fingerprint flow (did an agent call this?)

1. By hand: `POST /projects` Try it out with `{"name":"Human-written project"}`, Execute → 201.
2. As agent: `openapi_execute_operation` `{"operation":"createProject","body":{"name":"Agent-written project"}}` → 201.
3. Call `openapi_execute_operation` `{"operation":"listAuditEvents","query":{"limit":50}}`. Find the two `project.created` events: expect `source: "swagger-ui"` for the hand-made one and `source: "webmcp-agent"` for the agent-made one.
4. Limits (do NOT file as failure): the marker is a request header set by page JavaScript and trusted by the demo log — it distinguishes pipeline paths within this demo, it is not an identity proof.

## 8. Document switch (capability set is derived, not configured)

1. Load the **no x-webmcp** document (switcher chip). Expect `createCharge` and `bulkUpdateTasks` tools now exist and `bulkUpdateTasks` reports `callable: true, declaredIn: "page"`.
2. Reload with `?maxTools=5`. Expect NO `api.*` tools at all, while `openapi_search_operations` still finds operations (discovery-only fallback).

## 9. Pass/fail report template

Copy, fill, return. One row per check ID. Evidence = short quote (tool field, panel text, audit row).

| ID | Check | Result (PASS/FAIL) | Evidence |
|---|---|---|---|
| T1–T8 | core tools | | |
| SEE 1–5 | see-vs-call + revoke | | |
| MATRIX | 4 auth rows | | |
| L1–L5 | locks | | |
| F1–F5 | shared fields | | |
| FP 1–4 | fingerprint | | |
| DOC 1–2 | document switch | | |

**FAIL rules:** any `FAIL` must quote the actual result. `LOCKED` where `AUTH_REQUIRED` was expected (or vice versa) is a FAIL — the codes are distinct. A missing in-page receipt (`displayedInSwaggerUi: false` on a success, or no panel update) is a FAIL. UI controls that do not affect tools (or tools that affect the person's ability to use Try-it-out) are FAILs. The §7-limits note and the cookie row of the matrix are informational, not failures.
