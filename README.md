# Swagger UI WebMCP

> If you can Try it out, your agent can too.

Swagger UI already knows an API's operations, schemas, selected environment, authorization, and request pipeline. This reusable plugin exposes that exact live documentation session through WebMCP.

No AI SDK. No MCP server. No copied bearer tokens.

## Demo

Run `npm install`, then `npm run dev` and open the local URL. Sign in, select Sandbox, and use normal Swagger Try it out. In a compatible browser agent, the same page exposes generated tools such as `api.listProjects.<hash>` and `api.createTask.<hash>`. Switch the Swagger server dropdown to Production; the next call uses Production without tool reconfiguration.

The demo document (Waypoint Projects API, 28 operations) covers all HTTP methods, path/query/header parameters, repeated array query parameters, cursor pagination, optimistic concurrency with `If-Match` returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload that is deliberately not exposed as a direct tool, hidden operations, a write held at read, three `requiresAuth` gates (HTTP bearer, header API key, query API key) over distinct operations, and deliberate 401/404/422 paths. Sandbox and Production have separate data stores. The page can also load an unannotated copy of the same document, or any OpenAPI URL you paste, to show how the tool set is re-derived from whatever is loaded.

## Why WebMCP?

| | Traditional MCP | Swagger UI WebMCP |
|---|---|---|
| Setup | Install a connector | Visit docs |
| Lifetime | Persistent | Current page/session |
| Environment | Configured separately | Current Swagger server |
| Authorization | Configure again | Current browser/Swagger auth |
| Best use | Automation anywhere | Help while using API docs |

A conventional MCP server remains better for persistent, headless API access. This plugin is for the documentation page itself as the integration context. A publisher must install it; users cannot enable it on arbitrary Swagger pages.

## Installation

```ts
import SwaggerUI from "swagger-ui";
import SwaggerUIWebMCP from "swagger-ui-webmcp";
import "swagger-ui/dist/swagger-ui.css";

SwaggerUI({
  dom_id: "#swagger-ui",
  url: "/openapi.yaml",
  plugins: [SwaggerUIWebMCP],
  webMcp: { exposure: "write" }
});
```

The plugin peers with `swagger-ui >=5.32.0 <5.33.0` and is tested with 5.32.14. WebMCP is feature-detected; Swagger remains fully useful when unavailable.

## Configuration

All options live under the `webMcp` key of the Swagger UI config.

| Option | Type | Default | Effect |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` skips the plugin entirely; Swagger UI is untouched. |
| `exposure` | `read` \| `write` \| `hidden` | `write` | The page-level default applied to every operation. `hidden` is an absolute kill switch that no annotation can override. |
| `trustSpecAnnotations` | boolean | `false` | When `true`, `x-webmcp` in the document is authoritative instead of tighten-only. Set this only if you publish both the page and the document. |
| `maxDirectOperationTools` | number | `64` | Documents with more operations than this register no direct tools; discovery and generic execution remain. |
| `maxBatchSteps` | number | `10` | Maximum steps accepted by `openapi_execute_batch`. |
| `operationFilter` | `(op) => boolean` | none | Returning `false` removes an operation from search, inspection, execution, and registration. |
| `policyResolver` | `(op) => Policy \| undefined` | none | Page-supplied policy source consulted per operation. Composes with `x-webmcp` and may only tighten. |

These settings are read live rather than captured at load time, so changing `webMcp` on the Swagger config after startup takes effect on the next call.

## Agent policy: the `x-webmcp` extension

The page owner sets a baseline with `exposure`. The team that publishes the API declares per-endpoint agent policy in the OpenAPI document itself, with an `x-webmcp` object on the document root (as a default) or on any operation.

```yaml
openapi: 3.1.0

x-webmcp:
  tool: write                     # document-wide default

paths:
  /projects/{projectId}/tasks:
    get:
      operationId: listTasks
      x-webmcp:
        tool: read
  /projects/{projectId}:
    delete:
      operationId: deleteProject
      x-webmcp:
        tool: write
        destructive: true
  /reports/usage:
    get:
      operationId: getUsageReport
      security:
        - bearerAuth: []
      x-webmcp:
        tool: read
        requiresAuth: bearerAuth
  /billing/charges:
    post:
      operationId: createCharge
      x-webmcp:
        tool: hidden
```

- `tool` — one of `read`, `write`, `hidden`. What the operation is for agents: a READ tool, a WRITE tool, or HIDDEN (never registered, never searchable).
- `requiresAuth` — `true`, a security scheme name, or a list of scheme names. The operation stays SEE-able but is not CALL-able until Swagger UI's live auth state satisfies the gate; a call before that returns a structured `AUTH_REQUIRED` error. The human authorizes through Swagger UI's normal authorize dialog and the same call then succeeds.
- `destructive` — boolean. Surfaces as `destructiveHint` on the registered tool so the WebMCP client can gate the invocation. It never prompts anyone by itself.

There are no consent keys and no legacy aliases. `allow`, `confirm`, `block`, `policy`, `agent`, `reason`, and the old permission-mode names are not read.

### The security property

Both sources reduce to a level on the lattice `hidden < read < write`. An OpenAPI document is untrusted input, so **by default a document annotation may only tighten the page's level, never loosen it**: the page level and the document level are compared and the tighter one wins. A `read` page cannot be talked into writes by a document that claims `write`.

A publisher who authors both the page and the document can set `trustSpecAnnotations: true` to make the document authoritative in both directions. One rule survives that setting: `tool: hidden` always removes the operation from the capability set. Refusing exposure is never an escalation.

Unrecognised or malformed annotation values are dropped rather than guessed at, so a hostile annotation degrades to "no annotation" rather than to a weaker policy.

### SEE vs CALL

- **Hidden** (`tool: hidden`): the operation is absent from `openapi_search_operations`, `openapi_get_operation`, execution, and direct-tool registration. The agent has no evidence it exists. A human can still call it in Swagger UI.
- **Held** (a write under a `read` level): the operation is still discoverable, and its `agentPolicy` says it is not callable, so the agent can explain why it cannot proceed. It gets no direct tool.
- **Gated** (`requiresAuth` unsatisfied): the operation is registered, listed, and correctly annotated — the agent sees it and which schemes it needs — but calling it returns `AUTH_REQUIRED`. Authorizing in Swagger UI flips the next call to success with no re-registration.
- **Consent and client-side gating are the client's job.** The page never prompts, never remembers grants, and never reaches into the agent's own state. Its interface to the client is registration visibility plus MCP annotations (`readOnlyHint`, `destructiveHint`, `untrustedContentHint`) plus structured errors. Session locks (below) are the page's own declaration: a person narrowing what the page exposes, which the client observes through the same visibility and errors.

## Session locks: what a person allows the agent, right now

Every operation block in the docs carries a small access control next to Try-it-out, styled like Swagger UI. A person looking at the page can restrict an operation for the agent — view only (listed with its spec, but calls return a structured `LOCKED` error), read only (reads run, writes denied), or hidden (unregistered and unsearchable). A session bar under the API info offers the unlock-all reset while locks are active.

Use cases: an endpoint you don't want the agent to accidentally call but whose server you don't control; confining a looping agent to a subset while debugging; hiding noisy operations so the agent only sees what's relevant.

Locks are for this session only — in-memory page state, and a reload resets every operation to what the spec declares. They can only tighten what `x-webmcp` allows, never widen it. The agent cannot mutate locks (no tool reads or writes lock state; `agentPolicy` only reports the effective exposure so the agent understands a `LOCKED` denial), auth gating stays live login state with no lock control, and locks never limit what the person can do by hand.

## Shared fields and the audit fingerprint

The agent and the person use the same Try-it-out fields in the same Swagger store. The agent sees what the person already typed (`liveValues` on operation reads), and executing with empty or partial arguments submits the current UI values — explicit arguments always win, and the merged set renders in Swagger UI's own panels.

Every agent execution leaves a fingerprint answering "did an agent call this": the plugin marks its invocations, the demo page tags those requests `X-Waypoint-Client: webmcp-agent`, and the demo API records the pipeline source on every audited write — `GET /audit-events` shows `webmcp-agent` versus `swagger-ui`. Within the demo that distinguishes pipeline paths; it is an audit hint, not an identity proof. See [docs/webmcp-tools.md](docs/webmcp-tools.md) for the full reference.

## Tools

Five stable core tools are always present: `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, and `openapi_execute_batch`. Supported, callable operations additionally get a direct `api.<safe-name>.<generation-hash>` tool.

`openapi_execute_batch` runs up to `maxBatchSteps` operations from the current document in order. Every step is resolved and exposure-checked before any step runs, so a batch never half-applies a plan containing a step the agent may not call; if one step is hidden, held, unknown, or unauthorized, nothing executes. `stopOnError` defaults to `true`. The tool itself is registered with `destructiveHint: true` and its full plan is visible in the input schema, so the WebMCP client gates the invocation as one unit.

See [docs/webmcp-tools.md](docs/webmcp-tools.md) for input shapes, the `agentPolicy` result field, and the `x-webmcp` reference.

## Security and limitations

- OpenAPI prose and API responses are untrusted content and are never copied into privileged generated metadata. Tool descriptions are assembled from structural facts only.
- Auth values stay inside Swagger/browser execution. They never enter tool inputs or results; sensitive parameter and header names are excluded and response headers are redacted.
- The page never prompts. Permission UX belongs to the WebMCP client, driven by registration visibility and tool annotations.
- Tools cannot select arbitrary URLs. Every call resolves against the currently selected Swagger server. Normal CORS and browser permissions still apply.
- Response bodies are bounded to about 50 KB and binary content types are reported by type and size rather than inlined. `AbortSignal` is honoured.
- Write methods are not marked read-only. Binary and multipart request bodies are not exposed as direct tools in v1.
- Documents larger than `maxDirectOperationTools` fall back to discovery plus generic execution, so the agent's capability set stays legible.
- Cookie-based sessions are invisible to `requiresAuth`: Swagger's live auth state only reflects schemes it applies itself (HTTP, API keys), so session-gated endpoints surface API 401s rather than `AUTH_REQUIRED`.
- There is no production WebMCP polyfill. Tests drive a test-only `modelContext` shim.
- Persistent, headless integrations should use a conventional MCP server.

## Development and testing

Node 22+ is recommended. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

## License

Apache-2.0. See [NOTICE](NOTICE).
