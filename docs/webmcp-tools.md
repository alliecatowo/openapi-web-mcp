# WebMCP tools

Everything the plugin registers on `document.modelContext` comes from the OpenAPI document currently loaded in Swagger UI. Nothing is configured out of band, and no tool can name a URL that is not in that document.

Two layers are registered:

- **Core tools** — five stable names that are always present, whatever document is loaded, so an agent has a usable capability set even for documents too large for per-operation tools.
- **Direct operation tools** — one `api.<safe-name>.<generation-hash>` tool per exposed operation.

## Core tools

### `openapi_get_context`

Read the state of the live Swagger session.

```json
{ "type": "object", "additionalProperties": false }
```

Returns:

```json
{
  "spec": { "title": "Waypoint Projects API", "version": "2.0.0", "openapiVersion": "3.1.0", "sourceUrl": "/openapi.yaml", "fingerprint": "1a2b3c" },
  "server": { "effectiveUrl": "/api/sandbox" },
  "auth": { "authorizedSchemes": [{ "name": "bearerAuth", "type": "http" }], "withCredentials": true },
  "operations": { "total": 28, "supported": 27, "directToolsRegistered": 24, "directToolLimit": 64 },
  "policy": { "pageExposure": "write", "trustSpecAnnotations": true, "read": 12, "write": 13, "blocked": 1, "hidden": 2, "locked": 0 }
}
```

Those numbers are the demo document under the demo page settings: 28 operations, one multipart upload that cannot be a direct tool, two operations hidden by `x-webmcp.tool: hidden`, and one write held at read.

`authorizedSchemes` reports scheme names and types only. No credential value is ever included.

### `openapi_search_operations`

```json
{
  "type": "object",
  "properties": {
    "query":  { "type": "string" },
    "method": { "type": "string" },
    "tag":    { "type": "string" },
    "limit":  { "type": "integer", "minimum": 1, "maximum": 30 }
  },
  "additionalProperties": false
}
```

`limit` defaults to 20 and is capped at 30. Each result carries `key` (`METHOD /path`), `operationId`, `method`, `path`, `summary`, `tags`, `deprecated`, `directTool`, `supported`, `unsupportedReason`, and `agentPolicy`. The result also carries a `note` stating that summaries come from the OpenAPI document and are untrusted content.

Operations hidden by `x-webmcp.tool: hidden`, or by `operationFilter`, do not appear. Operations gated by `requiresAuth` DO appear — SEE vs CALL means an unauthorized agent lists them with `callable: false` and the schemes they need.

### `openapi_get_operation`

```json
{
  "type": "object",
  "properties": { "operation": { "type": "string", "minLength": 1 } },
  "required": ["operation"],
  "additionalProperties": false
}
```

`operation` accepts an `operationId`, a `METHOD /path` key, or a direct tool name. Returns the search fields plus `description`, `parameters`, `requestBody`, and the compiled `inputSchema`. Ambiguous identifiers return `OPERATION_AMBIGUOUS`; use `METHOD /path`.

It also reports `liveValues`: whatever the person already typed into this operation's Try-it-out fields, read live from the Swagger store and bounded (long values are truncated, credential-shaped names are never surfaced). Executing with empty or partial arguments submits these values — see [Shared Try-it-out fields](#shared-try-it-out-fields).

### `openapi_execute_operation`

```json
{
  "type": "object",
  "properties": {
    "operation":   { "type": "string" },
    "path":        { "type": "object" },
    "query":       { "type": "object" },
    "headers":     { "type": "object" },
    "body":        {},
    "contentType": { "type": "string" }
  },
  "required": ["operation"],
  "additionalProperties": false
}
```

Executes through Swagger UI's own execution path, so the selected server, authorization state, request and response interceptors, and browser credentials are all read live at call time. Array and object values are handed to Swagger unflattened and serialised according to the parameter's own `style` and `explode` rules.

Empty or partial arguments fall back to the operation's current Try-it-out values: explicit arguments always win, and the merged set is what gets written, sent, and rendered in Swagger UI's own panels — see [Shared Try-it-out fields](#shared-try-it-out-fields).

Returns:

```json
{
  "ok": true,
  "request": { "method": "POST", "url": "/api/sandbox/projects" },
  "response": { "status": 201, "statusText": "Created", "contentType": "application/json", "headers": {}, "body": {}, "truncated": false },
  "displayedInSwaggerUi": true
}
```

Failures return `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

### `openapi_execute_batch`

Runs several operations from the current document in order — no prompts, no remembered grants. The full plan is visible in the input schema and the tool is registered with `destructiveHint: true`, so the WebMCP client gates the whole invocation as one unit.

```json
{
  "type": "object",
  "properties": {
    "steps": {
      "type": "array",
      "minItems": 1,
      "maxItems": 10,
      "items": {
        "type": "object",
        "properties": {
          "operation": { "type": "string" },
          "path": { "type": "object" }, "query": { "type": "object" }, "headers": { "type": "object" },
          "body": {}, "contentType": { "type": "string" }
        },
        "required": ["operation"],
        "additionalProperties": false
      }
    },
    "stopOnError": { "type": "boolean", "default": true }
  },
  "required": ["steps"],
  "additionalProperties": false
}
```

`maxItems` follows `webMcp.maxBatchSteps` (default 10). Every step is resolved and exposure-checked before anything executes:

- If any step is unknown, ambiguous, unsupported, held, hidden, or unauthorized, the whole batch is refused and nothing runs.
- Steps then run sequentially. `stopOnError` defaults to `true`. An aborted signal ends the batch and records an `ABORTED` step.

Returns:

```json
{
  "ok": false,
  "requested": 3,
  "completed": 2,
  "succeeded": 1,
  "failed": 1,
  "stoppedEarly": true,
  "results": [{ "index": 0, "operation": "POST /projects", "ok": true, "response": {} }]
}
```

## Direct operation tools

Each exposed operation that is supported and not blocked also gets its own tool:

```text
api.<safe-name>.<generation-hash>
```

The safe name is derived from the `operationId`, or from method and path when there is none, and is reduced to `[A-Za-z0-9_.-]`. The generation hash is derived from the operation key, the raw operation object, and the compiled input schema, so any change to the document — including a change to `x-webmcp` — produces a new tool name and the previous generation is aborted. Same-name schema replacement races are therefore not possible.

The input schema is the same `path` / `query` / `headers` / `body` grouping as the generic executor, restricted to the parameters the operation actually declares. Path parameters are required. Parameter names that look like credentials are excluded. JSON request bodies are preferred, then `+json`, then `application/x-www-form-urlencoded`, then `text/plain`.

Tool descriptions are assembled from structural facts only — method, path, and the fact that the page's current server and authorization are used. OpenAPI prose never lands in a tool description. Annotations are `readOnlyHint` (true for GET/HEAD/OPTIONS), `destructiveHint` (from `x-webmcp.destructive`), `costHint` (from `x-webmcp.costHint`, plus a `costNote` string when the publisher gave one), and `untrustedContentHint` (always true: spec and API content flow out through these tools).

An operation is **not** registered as a direct tool when it is hidden, filtered out, unsupported, or its resolved level is `read` while the method is a write. It can still be inspected by `openapi_get_operation` when it is merely held (but not when hidden). Authorization-gated operations ARE registered: the gate is evaluated at call time, not at registration time.

Documents with more operations than `maxDirectOperationTools` (default 64) register no direct tools at all. Discovery and generic execution still work.

## `agentPolicy`

`openapi_search_operations` and `openapi_get_operation` report the resolved policy for each operation:

```json
{
  "exposure": "write",
  "readOnly": false,
  "destructive": true,
  "costHint": false,
  "costNote": null,
  "callable": true,
  "requiresAuth": ["bearerAuth"],
  "authorized": false,
  "locked": false,
  "lock": null,
  "declaredIn": "openapi-document"
}
```

| Field | Values | Meaning |
|---|---|---|
| `exposure` | `read` \| `write` \| `hidden` | The resolved level, including this session's locks. Never `hidden` here — hidden operations are not reported at all. |
| `readOnly` | boolean | True for GET/HEAD/OPTIONS. |
| `destructive` | boolean | The publisher marked the operation irreversible. Surfaces as `destructiveHint`. |
| `costHint` | boolean | The publisher marked the operation costly or otherwise consequential. Surfaces as `costHint` on the registered tool. |
| `costNote` | `null` \| string | The publisher's optional description of the cost or consequence, when they gave one. Surfaces as `costNote`. |
| `callable` | boolean | Whether a call would be attempted right now: false when held, view-locked, or when `requiresAuth` is unsatisfied by live auth state. |
| `requiresAuth` | `null` \| `"any"` \| `string[]` | The authorization gate, if any. A list means ANY of the schemes. |
| `authorized` | boolean | Whether Swagger UI's live auth state currently satisfies the gate. |
| `locked` | boolean | Whether a person restricted this operation for the agent in the docs UI this session. |
| `lock` | `null` \| `"view"` \| `"read"` | Which session lock applies, when `locked` is true. |
| `declaredIn` | `openapi-document` \| `page` | Which source produced the level. |

There is deliberately no publisher prose in `agentPolicy` or any other model-readable surface. The agent learns *that* an operation needs authorization, not an argument about it.

## The `x-webmcp` extension

An `x-webmcp` object is valid on the OpenAPI document root, where it acts as a default, and on any operation, where it overrides the root.

```yaml
x-webmcp:
  tool: read                # read | write | hidden
  requiresAuth: bearerAuth  # true | scheme name | [names]
  destructive: true         # boolean
  costHint: true            # true | a description string
```

| Field | Type | Notes |
|---|---|---|
| `tool` | string enum | Any other value is dropped. The operation's value wins over the root's. |
| `requiresAuth` | `true` \| string \| string[] | `true` needs any live authorization; names need ANY of those schemes authorized. The operation's value wins over the root's. Anything else is dropped. |
| `destructive` | boolean | Only the literal `true` is honoured. OR-ed across operation, root, and resolver. |
| `costHint` | `true` \| string | `true` flags the operation as costly or consequential with no further detail; a non-empty string does the same and supplies a description (e.g. `"$0.02 per call"`). OR-ed across operation, root, and resolver — a description from any source survives even if another source only sent `true`. Anything else (`false`, a number, an empty string) is dropped. |

Parsing keeps only values this version understands. A non-object, an array, `tool: "sometimes"`, `requiresAuth: 42`, `destructive: "yes"`, `costHint: 0` — each is dropped, and an annotation left with no recognised fields is treated as absent. A malformed or hostile annotation degrades to "no annotation", never to a weaker policy. There are no legacy aliases: the old `policy`/`agent` keys, `reason` prose, and the `allow`/`confirm`/`block` and permission-mode names are ignored entirely.

`costHint` is a signal, not a gate: like `destructive`, it never pauses execution by itself. It exists so the WebMCP client — never the page — can decide to prompt a human before calling an operation the publisher flagged as costly, exactly the way `destructiveHint` lets a client decide to prompt before an irreversible one.

### How a level is reached

The page's `webMcp.exposure` and the document's `x-webmcp.tool` (operation value, else root value) each name a level on the lattice `hidden < read < write`.

1. If `trustSpecAnnotations` is `true` and the document names a level, it wins.
2. Otherwise the **tighter** of the two wins. The document can only tighten.
3. `hidden` from either source always wins, under either setting — a page `exposure: "hidden"` is an absolute kill switch.
4. A page-supplied `policyResolver` composes tighten-only: its level replaces the result only when tighter, its `requiresAuth` only when tighter, its `destructive` is OR-ed in.
5. A write operation held at `read` is visible but not callable (`blocked`); a read operation at `read` is unaffected.

The authorization gate is orthogonal to the level and is evaluated at CALL time against Swagger UI's live authorized schemes (`authSelectors.authorized()`), so authorizing flips the next call from `AUTH_REQUIRED` to success with no re-registration. Cookie sessions are invisible to the gate — Swagger only reports schemes it applies itself — so session-gated endpoints surface API 401s rather than `AUTH_REQUIRED`.

### Worked example

Page `exposure: "write"`, untrusted document (`trustSpecAnnotations: false`):

| Operation | `x-webmcp` | Level | Callable? |
|---|---|---|---|
| `GET /projects` | none | `write` (page) | yes, `readOnlyHint: true` |
| `POST /projects` | none | `write` (page) | yes |
| `POST /tasks/bulk` | `tool: read` | `read` (document, tighter) | no — visible, `READ_ONLY_MODE` |
| `POST /billing/charges` | `tool: hidden` | `hidden` | absent everywhere |
| `GET /reports/usage` | `tool: read, requiresAuth: bearerAuth` | `read` | only when bearerAuth is authorized, else `AUTH_REQUIRED` |
| `DELETE /projects/{id}` | `tool: write, destructive: true` | `write` | yes, `destructiveHint: true` |
| `POST /exports` | `tool: write, requiresAuth: waypointKey, costHint: "..."` | `write` | yes once authorized, `costHint: true` + `costNote` |

With page `exposure: "read"`, every write above becomes held regardless of annotations, and no annotation can loosen them.

## Calls and the authorization gate

Direct tools, `openapi_execute_operation`, and `openapi_execute_batch` all pass through one authorization function, so there is exactly one place exposure is evaluated — at call time, against live state:

- Hidden or held returns an error without touching the API: `OPERATION_DENIED` for a hidden operation, `READ_ONLY_MODE` for a write held at read.
- A session-locked operation returns `LOCKED`: view locks deny every call on the operation, read locks deny writes. Locks compose after every spec source and can only tighten — see [Session locks](#session-locks).
- `requiresAuth` unsatisfied returns `AUTH_REQUIRED`, naming the needed schemes and pointing at Swagger UI's authorize dialog. Nothing executes.
- Otherwise the call runs through Swagger UI's own execution path and the result is recorded with `displayedInSwaggerUi: true`, so it is visible where a person would look.

## Session locks

A person looking at the documentation page can restrict an operation for the agent — for this session only. Each operation block carries an access control next to Try-it-out (styled like Swagger UI, no agent branding), and a session bar under the API info offers the unlock-all reset while locks are active. A reload resets every operation to what the spec declares, because locks live in an in-memory page map that dies with the page.

Lock levels mirror the server vocabulary exactly:

| Lock | Agent experience |
|---|---|
| View only | Listed with its spec, direct tool still registered, but every call returns structured `LOCKED`. |
| Read only | Capped at `read`: reads run, writes are denied with `LOCKED`. |
| Hidden | Unregistered and unsearchable this session, like spec `hidden`. |

Rules that make locks safe:

- Locks can only tighten. The effective exposure is the tighter of the spec-resolved level and the lock; a lock can never un-hide a hidden operation, un-hold a held write, or grant what the spec withheld. Authorization gating is not a lock — it stays live login state, with no lock control for it.
- The agent cannot mutate locks. Lock state lives in module state the tools never touch: no tool reads or writes it, no input schema carries a lock field, and there is no set-lock tool. `agentPolicy` reports the effective exposure (`locked: true`, plus which `lock`) so the agent understands a `LOCKED` denial — observation only.
- The person is never locked out. Locks touch only the agent's capability set; an operation hidden from the agent stays fully operable by hand in the same page.

Lock changes re-derive the tool set through the normal generation mechanism: hiding unregisters the direct tool, unlocking restores it, with no spec reload.

## Shared Try-it-out fields

The agent and the person use the same fields in the same Swagger store — there are no shadow copies, in either direction:

- The agent sees work in progress. `openapi_get_operation` reports `liveValues`: parameter values and request body text the person already typed, read live from the Swagger store at call time and bounded (long values truncated, credential-shaped names never surfaced).
- The agent can submit work in progress. Executing with empty or partial arguments uses the current UI values for the missing pieces. Explicit arguments always win; the merged set is written back through Swagger's own pipeline, so the populated fields and the response render in Swagger UI's own panels.

Both split-entry flows work on the same fields: the person types half and the agent finishes and submits, or the agent fills values the person reviews before the agent submits. Every tool mutation lands in the normal Swagger store, and every execution path — direct tools, the generic executor, every batch step — records `displayedInSwaggerUi: true`, which is the presence equivalent of a read receipt.

## Audit fingerprint: did an agent call this?

Every agent execution leaves a fingerprint answering "did an agent call this", in two places:

- Server side (demo): the plugin marks whichever operation it is executing (`agentExecution`), and the demo page's request interceptor tags those requests `X-Waypoint-Client: webmcp-agent`. The demo API records the request's pipeline source on every audited write, so `GET /audit-events` shows `webmcp-agent` on agent-made writes and `swagger-ui` on hand-made ones. Within the demo this distinguishes pipeline paths — agent-via-plugin versus person-via-Try-it-out — because the plugin marks its invocations. It is an audit hint, not an identity proof: any HTTP client can send the header.
- In page: agent-executed requests appear in Swagger UI's own request/response panels (`displayedInSwaggerUi`), so a person watching the docs sees the call and its result where they would look for their own.

Limits, stated honestly: the header is set by page JavaScript and the audit log trusts it; a hostile page or a forged request can lie about source. The fingerprint proves which pipeline the demo server saw, nothing more. Production APIs that need non-repudiation need real authentication, not this header.

## Result handling

Responses are normalised before they reach the agent. At most 50 headers are kept and credential-shaped header names are dropped. Bodies over roughly 50 KB are replaced by `{ "truncated": true, "originalBytes": N }`. Image, audio, video, PDF, and ZIP bodies are reported as `{ contentType, bytes, included: false }` rather than inlined. Operation results are untrusted content.

## Error codes

`WEBMCP_UNAVAILABLE`, `SPEC_NOT_READY`, `SPEC_INVALID`, `OPERATION_NOT_FOUND`, `OPERATION_AMBIGUOUS`, `OPERATION_UNSUPPORTED`, `INPUT_INVALID`, `CONTENT_TYPE_UNSUPPORTED`, `AUTH_REQUIRED`, `LOCKED`, `NETWORK_ERROR`, `CORS_ERROR`, `ABORTED`, `RESPONSE_TOO_LARGE`, `SWAGGER_EXECUTION_ERROR`, `READ_ONLY_MODE`, `OPERATION_DENIED`, `BATCH_TOO_LARGE`, `INTERNAL_ERROR`.
