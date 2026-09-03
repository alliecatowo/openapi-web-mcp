# Swagger UI WebMCP

> If you can Try it out, your agent can too.

**Swagger UI WebMCP is a reusable Swagger UI plugin that turns any OpenAPI documentation page into a live, session-scoped agent interface — the agent calls the API through the exact environment, login, and request pipeline the developer already has open in the page.**

No AI SDK. No MCP server to install. No bearer token copied anywhere.

**Live demo: <https://openapi-web-mcp.vercel.app>** · Apache-2.0 · [Repository](https://github.com/alliecatowo/openapi-web-mcp)

---

## The problem

A developer working against an internal or partner API already has a browser tab where everything is correct: they are signed in, they picked *staging* from the server dropdown, they pasted the right key into Swagger UI's **Authorize** dialog, and the corporate proxy, CORS rules, and session cookies all work.

To let an agent help with the same API, that entire environment has to be rebuilt somewhere else — install or write an MCP server, re-describe the endpoints, copy a bearer token out of the browser into a config file, and keep the two in sync every time the environment changes. Most people don't. So the agent is useful for writing code *about* the API and useless for actually *driving* it.

**Audience:** developers, QA and support engineers, and solutions/API-partner teams who live in OpenAPI documentation pages — and the API publishers who host them.

## Why this is specifically a strong WebMCP use case

WebMCP's defining property is that the *page* is the integration: capability lives in the tab, scoped to the session, and dies with it. Almost nothing fits that shape better than an API documentation page, because Swagger UI is already an execution surface that has solved every hard part:

- **The contract already exists and is machine-readable.** An OpenAPI document is the highest-quality tool definition source that will ever be lying around. Tools are *derived*, not hand-written — load a different document and the whole capability set is re-derived with no code change.
- **The ambient state is the whole point.** Selected server, authorized security schemes, cookies, `withCredentials`, request/response interceptors — the things that are painful to replicate in a headless connector are simply *already true* in the tab. The agent reads them live at call time, so when the human flips the dropdown from Sandbox to Production, the agent's next call follows. Nothing re-registers.
- **Ephemerality is a feature, not a limitation.** Nobody wants a persistent connector with standing write access to production. Here, capability exists only while the tab is open, only for the document loaded, and only up to what the human has authorized.
- **It generalizes.** This is not one app made agent-friendly; it is a plugin. Every Swagger UI page that adds one import becomes an agent surface for whatever API it documents.

A conventional MCP server is still the right answer for persistent, headless automation. This is for the documentation page itself as the integration context.

|  | Traditional MCP server | Swagger UI WebMCP |
|---|---|---|
| Setup | Install/write a connector | Visit the docs page |
| Lifetime | Persistent | Current page session |
| Environment | Configured separately | The Swagger server you selected |
| Authorization | Configured again | The browser/Swagger auth you already have |
| Tool source | Hand-maintained | Derived from the loaded OpenAPI document |
| Best for | Automation anywhere | Working *with* an API, in its docs |

## What humans and agents can do together

This was built around one idea: the person and the agent share **one session, one set of fields, and one visible transcript** — not two parallel worlds.

- **Shared environment.** The human signs in, selects Sandbox, and authorizes a scheme in Swagger UI's own dialog. The agent's calls inherit all of it, live. Flip to Production mid-conversation and the next agent call goes to Production.
- **Shared fields.** The person types `checkout` into the `q` box of Try it out and stops. The agent reads that value (`liveValues`) and finishes the call. Or the agent fills the inputs and the person reviews them in the UI before anything is submitted. Explicit agent arguments win; anything omitted comes from what is on screen.
- **Shared transcript.** Every agent execution renders in Swagger UI's own response panel, where the person already looks for their own results. There is no separate agent console.
- **Session locks — the human narrows the agent, live.** Each operation block has a small access control next to Try-it-out: **Full access**, **View only** (listed, not executable), **Read only** (reads run, writes denied), **Hidden** (invisible to the agent). You don't need to own the API server to keep an agent out of an endpoint for the next ten minutes. Locks only tighten, never widen; no tool can read or set them; a reload resets everything to what the document declares; and they never restrict what *you* can do by hand.
- **Publisher-declared policy (`x-webmcp`).** The API team declares per-endpoint agent policy in the OpenAPI document itself — `read` / `write` / `hidden`, plus `requiresAuth` and `destructive` hints — so the page owner and the API owner each control the half they actually understand.
- **Receipts in both directions.** The demo API logs whether each write arrived via the agent pipeline or by hand: `GET /audit-events` shows `webmcp-agent` versus `swagger-ui`.

The thing that was hard before: *letting an agent act on a real, authenticated, environment-specific API without provisioning it any standing credentials or infrastructure* — and being able to see, constrain, and revoke that in the same place you were already working.

## Try the live demo

**<https://openapi-web-mcp.vercel.app>** — open it in ChatGPT's in-app browser or Chrome with WebMCP enabled.

1. Click **Sign in** (cookie session, no password).
2. Leave the loaded document on **Waypoint** *annotated* and the Swagger server dropdown on **Sandbox**.
3. Paste this prompt to your agent:

> **You have WebMCP tools on this page. Call `openapi_get_context` and tell me which API and environment I'm on. Then list the active projects. Then try to fetch the usage report and tell me exactly why it fails and what I'd have to do. Finally create a project called "Checkout reliability", add a task to it, and read `GET /audit-events` to show me which writes came from an agent.**

That single prompt exercises discovery, a read, a `requiresAuth` gate refusing a call the agent can nonetheless *see*, two writes, and the audit fingerprint.

Then, by hand, do any of these and ask again — the agent adapts with no reconfiguration:

- Click **Authorize**, paste `waypoint-demo-bearer` for `bearerAuth`, and re-ask for the usage report. It now returns 200.
- Switch the server dropdown to **Production** and ask for the projects again. Different data store, same tools.
- Set `DELETE /projects/{projectId}` to **Read only** in its access control and ask the agent to delete a project. It gets a structured `LOCKED` error.
- Ask the agent to charge the account $50. `POST /billing/charges` is `tool: hidden` — it is absent from the agent's capability set entirely, while you can still run it yourself in Try it out.
- Load the **Waypoint — no x-webmcp** document from the switcher, or paste any OpenAPI URL. The tool set is re-derived from whatever is loaded.

Demo credentials (nothing real is protected by them): `bearerAuth` → `waypoint-demo-bearer`; `waypointKey` header `X-Waypoint-Key` → `waypoint-demo-key`; `waypointQueryKey` query `key` → `waypoint-demo-query-key`.

## How WebMCP is implemented

The plugin registers tools on `document.modelContext` when the browser provides it, and does nothing at all when it doesn't — Swagger UI is untouched and fully usable either way. There is no production polyfill.

```ts
import SwaggerUI from "swagger-ui";
import SwaggerUIWebMCP from "swagger-ui-webmcp";
import "swagger-ui/dist/swagger-ui.css";

SwaggerUI({
  dom_id: "#swagger-ui",
  url: "/openapi.yaml",
  plugins: [SwaggerUIWebMCP],   // ← the whole integration
  webMcp: { exposure: "write" }
});
```

The plugin peers with `swagger-ui >=5.32.0 <5.33.0` and is tested against 5.32.14.

**Registration.** On every document load the plugin enumerates operations from Swagger UI's own resolved spec, resolves `$ref`s, converts parameters and request bodies into JSON Schema tool inputs, computes a stable generation hash of the document, and registers the tools. Reloading or swapping the document unregisters the previous generation and registers a new one.

**Execution.** Tools never name a URL. A call resolves its operation against the *currently selected* Swagger server, then goes out through Swagger UI's own request pipeline — same interceptors, same `withCredentials`, same auth application, same response rendering. That is why environment and login are inherited rather than duplicated, and why agent calls appear in the normal response panels.

**Authorization.** Direct tools, the generic executor, and the batch executor all funnel through one authorization function evaluated at call time against live state, so there is exactly one place exposure is enforced. It composes, in order: the page's `exposure`, the document's `x-webmcp`, the page's `policyResolver`, and the human's session locks — on the lattice `hidden < read < write`, where by default **the tightest wins** and a document may only tighten. `requiresAuth` is then checked against Swagger UI's live authorized schemes.

**The page never prompts.** Permission UX belongs to the WebMCP client. The page's interface to the client is registration visibility, MCP annotations (`readOnlyHint`, `destructiveHint`, `untrustedContentHint`), and structured errors (`AUTH_REQUIRED`, `LOCKED`, `OPERATION_DENIED`).

### Tools

| Tool | Kind | What it does |
|---|---|---|
| `openapi_get_context` | read | Live session state: spec title/version/fingerprint, effective server URL, authorized scheme *names* (never values), operation and policy counts. |
| `openapi_search_operations` | read | Search the loaded document by text, method, or tag. Returns each match's key, `directTool` name, and `agentPolicy`. Hidden operations never appear. |
| `openapi_get_operation` | read | Full detail for one operation: input schema, `agentPolicy`, and `liveValues` — what the human has currently typed into Try it out. |
| `openapi_execute_operation` | write | Execute any exposed operation by id or `METHOD /path`, merging supplied arguments over the live UI values. |
| `openapi_execute_batch` | write, `destructiveHint` | Up to `maxBatchSteps` (default 10) operations in order. Every step is resolved and exposure-checked *before the first one runs*, so a plan containing a forbidden step executes nothing — no half-applied batch. |
| `api.<safe-name>.<generation-hash>` | read or write per operation | One direct tool per exposed, supported operation, with the operation's own input schema. Capped at `maxDirectOperationTools` (default 64); past the cap the page falls back to discovery + generic execution with no loss of capability. |

Full input shapes, the `agentPolicy` result field, error codes, and the `x-webmcp` reference: **[docs/webmcp-tools.md](docs/webmcp-tools.md)**.

### Configuration

All options live under the `webMcp` key of the Swagger UI config and are read live, so changes after startup take effect on the next call.

| Option | Type | Default | Effect |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` skips the plugin entirely. |
| `exposure` | `read` \| `write` \| `hidden` | `write` | Page-level default for every operation. `hidden` is an absolute kill switch no annotation can override. |
| `trustSpecAnnotations` | boolean | `false` | `true` makes `x-webmcp` authoritative in both directions instead of tighten-only. Only for publishers who own both page and document. |
| `maxDirectOperationTools` | number | `64` | Above this, no direct tools; discovery and generic execution remain. |
| `maxBatchSteps` | number | `10` | Maximum steps accepted by `openapi_execute_batch`. |
| `operationFilter` | `(op) => boolean` | none | `false` removes an operation from search, inspection, execution, and registration. |
| `policyResolver` | `(op) => Policy \| undefined` | none | Page-supplied per-operation policy. Composes with `x-webmcp`; may only tighten. |

### The `x-webmcp` extension

The API team declares agent policy next to the endpoint it describes, on the document root (as a default) or on any operation:

```yaml
x-webmcp:
  tool: write                     # document-wide default

paths:
  /projects/{projectId}:
    delete:
      x-webmcp: { tool: write, destructive: true }
  /reports/usage:
    get:
      security: [{ bearerAuth: [] }]
      x-webmcp: { tool: read, requiresAuth: bearerAuth }
  /billing/charges:
    post:
      x-webmcp: { tool: hidden }
```

- `tool` — `read`, `write`, or `hidden`. What the operation *is* for agents.
- `requiresAuth` — `true`, a scheme name, or a list. The operation stays SEE-able but is not CALL-able until Swagger UI's live auth state satisfies it; an early call returns a structured `AUTH_REQUIRED`, and authorizing in the normal dialog makes the same call succeed.
- `destructive` — surfaces as `destructiveHint` so the client can gate the invocation. It never prompts anyone by itself.

Unrecognised or malformed values are dropped rather than guessed at, so a hostile annotation degrades to "no annotation" rather than to a weaker policy. There are no consent keys and no legacy aliases.

**Three distinct states.** *Hidden*: absent from search, inspection, execution, and registration — the agent has no evidence it exists, while a human can still call it by hand. *Held* (a write under a `read` level): still discoverable, `callable: false`, so the agent can explain why it cannot proceed instead of retrying. *Gated* (`requiresAuth` unsatisfied): visible and correctly annotated with the schemes it needs, refused until a human authorizes.

## Architecture

```
apps/demo/            Waypoint demo page: Swagger UI 5.32.14 + the plugin, document switcher
packages/swagger-ui-webmcp/
  openapi/            enumerate · $ref resolution · schema conversion · sanitize · generation hash
  policy/             the hidden<read<write lattice; x-webmcp parsing; locks; composition
  swagger/            reads live spec/server/auth/values from the Swagger store; executes and renders
  webmcp/             modelContext detection, tool registration, result shaping
api/_waypoint/        one stateful router + store, shared by the Vite dev server and the Vercel function
tests/                unit suites + a Playwright e2e suite driven through a test-only modelContext shim
```

**Request path:** tool call → single authorization function (page exposure ∧ `x-webmcp` ∧ `policyResolver` ∧ session lock, then `requiresAuth` against live auth) → argument merge over live Try-it-out values → Swagger UI's own executor against the selected server → response rendered into Swagger UI's panel → bounded, redacted result returned to the agent.

The demo's local dev server and its deployed serverless function import the *same* router module, so the hosted and local demos cannot diverge.

More detail: **[docs/architecture.md](docs/architecture.md)** and **[docs/DECISIONS.md](docs/DECISIONS.md)**.

## Security and limitations

- OpenAPI prose and API responses are untrusted content and never enter privileged generated metadata; tool descriptions are assembled from structural facts only, and results carry `untrustedContentHint`.
- Auth values never enter tool inputs or results. Credential-shaped parameter and header names are excluded, and response headers are redacted. `openapi_get_context` reports scheme *names and types* only.
- No tool can name a URL. Every call resolves against the currently selected Swagger server; normal CORS and browser permissions still apply.
- Response bodies are bounded to ~50 KB; binary content is reported by type and size rather than inlined; `AbortSignal` is honoured.
- Write methods are never marked read-only. Binary and multipart request bodies are not exposed as direct tools in v1.
- Cookie-based sessions are invisible to `requiresAuth` — Swagger's live auth state only reflects schemes it applies itself (HTTP, API keys) — so session-gated endpoints surface API 401s rather than `AUTH_REQUIRED`.
- Session locks are in-memory page state for this session only; a reload resets to the document.
- The audit fingerprint distinguishes *pipeline paths*, not identities. Any client could send the same header; it is an audit hint, not proof.
- There is no production WebMCP polyfill. Tests drive a test-only `modelContext` shim.

## Run it locally

Node 22+ is recommended.

```bash
git clone https://github.com/alliecatowo/openapi-web-mcp
cd openapi-web-mcp
npm install
npm run dev            # http://127.0.0.1:4173
```

The dev server serves the demo API in-process through the same router the deployed function uses, so no other service is needed.

```bash
npm run typecheck      # tsc -b
npm test               # 107 unit tests (vitest)
npm run build          # plugin + demo
npm run test:e2e       # 33 Playwright end-to-end tests
```

CI runs all four on every push.

## Test the WebMCP behaviour

**In a WebMCP-capable browser**, against the live demo or `http://127.0.0.1:4173`:

1. Sign in, and run `POST /admin/reset-demo` from Try it out so the audit log starts clean.
2. Open your agent's tool panel. You should see exactly five stable tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus `api.<name>.<hash>` per exposed operation. **The hash differs per load; never hardcode it** — discover names via `openapi_search_operations` → `directTool`.
3. Work through the recommended prompt above, then the by-hand variations (authorize, switch server, lock, hidden endpoint, swap document).
4. Append `?maxTools=5` to the URL to force the large-document fallback: direct tools disappear, discovery plus generic execution remain.

A complete, flow-by-flow external verification protocol — every call, its expected tool result, and the expected visible UI change — is in **[CODEX_DRIVER.md](CODEX_DRIVER.md)**.

**Without a WebMCP-capable browser**, the same behaviour is covered end-to-end by the Playwright suite, which drives a test-only `modelContext` shim against the real page: `npm run test:e2e`. It asserts the capability set, honest annotations, hidden/held operations, all three `requiresAuth` gates and their revocation, locks, shared fields, batch atomicity, server switching, and audit fingerprinting in both directions.

## Provenance

Built from scratch for the OpenAI WebMCP Challenge during the submission period (25 August – 3 September 2026). There is no pre-existing project: the repository's entire git history falls inside the window, and every line of the plugin, the demo API, the tests, and the documentation was written for this challenge. No forks of Swagger UI; it is consumed as an unmodified pinned dependency (5.32.14).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
