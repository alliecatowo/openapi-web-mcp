# Swagger UI WebMCP

> If you can Try it out, your agent can too.

Swagger UI already knows an API's operations, schemas, selected environment, authorization, and request pipeline. This reusable plugin exposes that exact live documentation session through WebMCP.

No AI SDK. No MCP server. No copied bearer tokens.

## Demo

Run `npm install`, then `npm run dev` and open the local URL. Sign in, select Sandbox, and use normal Swagger Try it out. In a compatible browser agent, the same page exposes generated tools such as `api.listProjects.<hash>` and `api.createTask.<hash>`. Switch the Swagger server dropdown to Production; the next call uses Production without tool reconfiguration.

The demo document (Waypoint Projects API, 28 operations) covers all HTTP methods, path/query/header parameters, repeated array query parameters, cursor pagination, optimistic concurrency with `If-Match` returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload that is deliberately not exposed as a direct tool, and deliberate 401/404/422 paths. Sandbox and Production have separate data stores. The page can also load an unannotated copy of the same document, or any OpenAPI URL you paste, to show how the tool set is re-derived from whatever is loaded.

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
  webMcp: { permissionMode: "ask-for-edits" }
});
```

The plugin peers with `swagger-ui >=5.32.0 <5.33.0` and is tested with 5.32.14. WebMCP is feature-detected; Swagger remains fully useful when unavailable.

## Configuration

All options live under the `webMcp` key of the Swagger UI config.

| Option | Type | Default | Effect |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` skips the plugin entirely; Swagger UI is untouched. |
| `permissionMode` | `no-prompt` \| `ask-for-edits` \| `ask-first` \| `read-only` \| `deny` | `ask-for-edits` | The page-level policy applied to every operation. `deny` is an absolute kill switch that no annotation can override. |
| `trustSpecAnnotations` | boolean | `false` | When `true`, `x-webmcp` in the document is authoritative instead of tighten-only. Set this only if you publish both the page and the document. |
| `maxDirectOperationTools` | number | `64` | Documents with more operations than this register no direct tools; discovery and generic execution remain. |
| `maxBatchSteps` | number | `10` | Maximum steps accepted by `openapi_execute_batch`. |
| `showConsole` | boolean | `true` | `false` removes the in-page Agent Console. Operations that need approval then have no way to get it and fail closed. |
| `operationFilter` | `(op) => boolean` | none | Returning `false` removes an operation from search, inspection, execution, and registration. |

These settings are read live rather than captured at load time, so changing `webMcp` on the Swagger config after startup takes effect on the next call.

## Agent policy: the `x-webmcp` extension

The page owner sets a baseline with `permissionMode`. The team that publishes the API can state per-endpoint policy in the OpenAPI document itself, with an `x-webmcp` object on the document root (as a default) or on any operation.

```yaml
openapi: 3.1.0

x-webmcp:
  policy: ask-for-edits          # document-wide default

paths:
  /projects/{projectId}/tasks:
    post:
      operationId: createTask
      x-webmcp:
        policy: no-prompt
        reason: Creating a task is cheap and reversible.
  /projects/{projectId}:
    delete:
      operationId: deleteProject
      x-webmcp:
        policy: ask-first
        destructive: true
        reason: Permanently removes a project and all of its tasks.
  /billing/charges:
    post:
      operationId: createCharge
      x-webmcp:
        policy: deny
        reason: Payments are out of scope for agents on this documentation page.
```

- `policy` — one of `no-prompt`, `ask-for-edits`, `ask-first`, `read-only`, `deny`.
- `destructive` — boolean. Forces at least a human confirmation, and withholds the "always allow" button.
- `reason` — publisher prose shown to a human in the consent card. It never enters model-readable tool metadata.

### The security property

Every mode reduces to a decision on the lattice `allow < confirm < block`. An OpenAPI document is untrusted input, so **by default a document annotation may only tighten the page's decision, never loosen it**: the page decision and the document decision are compared and the stricter one wins. A `read-only` page cannot be talked into writes by a document that claims `no-prompt`.

A publisher who authors both the page and the document can set `trustSpecAnnotations: true` to make the document authoritative in both directions. Two rules survive that setting:

- `policy: deny` always removes the operation from the capability set. Refusing exposure is never an escalation.
- `destructive: true` always forces at least `confirm`, even on a trusted `no-prompt` document.

Unrecognised or malformed annotation values are dropped rather than guessed at, so a hostile annotation degrades to "no annotation" rather than to a weaker policy.

### Withheld is not the same as blocked

- **Withheld** (`policy: deny`): the operation is absent from `openapi_search_operations`, `openapi_get_operation`, execution, and direct-tool registration. The agent has no evidence it exists. A human can still call it in Swagger UI.
- **Blocked** (for example a write under `read-only`): the operation is still discoverable, and its `agentPolicy` says `decision: "block"`, so the agent can explain why it cannot proceed. It is not callable and gets no direct tool.

## The Agent Console

An in-page panel, bottom-right, rendered in a shadow root so Swagger UI's stylesheet cannot reach it. It shows:

- the selected server, the page mode, and whether spec policy is authoritative or may only tighten
- a ledger of the capability set: N direct, N ask first, N blocked, N withheld
- a live activity log of every agent call, with the decision that let it run, its outcome, and its duration
- consent cards for anything that requires approval

A consent card names the operation as `METHOD /path`, lists the argument groups, shows the publisher's `reason` under the label "Stated by the API document" (rendered as text, never HTML, because it is untrusted), offers the full argument JSON in an expandable block, and ends with **Allow once**, **Always allow**, and **Deny**. "Always allow" remembers the operation for the rest of the page session, and is withheld for destructive operations.

This replaces `window.confirm`, which blocks the event loop and would stall the agent's own tool call, shows no arguments, and cannot offer a remembered grant.

## Tools

Five stable core tools are always present: `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, and `openapi_execute_batch`. Supported, non-blocked operations additionally get a direct `api.<safe-name>.<generation-hash>` tool.

`openapi_execute_batch` runs up to `maxBatchSteps` operations from the current document in order under a single human approval. Every step is resolved and policy-checked before any step runs, so a batch never half-applies a plan the user would have refused; if one step is forbidden, nothing executes. `stopOnError` defaults to `true`.

See [docs/webmcp-tools.md](docs/webmcp-tools.md) for input shapes, the `agentPolicy` result field, and the full policy truth table.

## Security and limitations

- OpenAPI prose and API responses are untrusted content and are never copied into privileged generated metadata. Tool descriptions are assembled from structural facts only.
- The publisher's `reason` goes to the human in the consent card and is deliberately excluded from `agentPolicy` and every other model-readable surface.
- Auth values stay inside Swagger/browser execution. They never enter tool inputs or results; sensitive parameter and header names are excluded and response headers are redacted.
- Tools cannot select arbitrary URLs. Every call resolves against the currently selected Swagger server. Normal CORS and browser permissions still apply.
- Response bodies are bounded to about 50 KB and binary content types are reported by type and size rather than inlined. `AbortSignal` is honoured.
- Write methods are not marked read-only. Binary and multipart request bodies are not exposed as direct tools in v1.
- Documents larger than `maxDirectOperationTools` fall back to discovery plus generic execution, so the agent's capability set stays legible.
- There is no production WebMCP polyfill. Tests drive a test-only `modelContext` shim.
- Persistent, headless integrations should use a conventional MCP server.

## Development and testing

Node 22+ is recommended. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

## License

Apache-2.0. See [NOTICE](NOTICE).
