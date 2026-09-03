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
  "operations": { "total": 28, "supported": 27, "directToolsRegistered": 25, "directToolLimit": 64 },
  "policy": { "pageMode": "ask-for-edits", "trustSpecAnnotations": true, "allow": 15, "confirm": 11, "blocked": 0, "hidden": 2 }
}
```

Those numbers are the demo document under the demo page settings: 28 operations, one multipart upload that cannot be a direct tool, and two operations withheld by `x-webmcp.policy: deny`.

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

Operations withheld by `x-webmcp.policy: deny`, or by `operationFilter`, do not appear.

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

Runs several operations from the current document in order under a single human approval.

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

`maxItems` follows `webMcp.maxBatchSteps` (default 10). Every step is resolved and policy-checked before anything executes:

- If any step is unknown, ambiguous, unsupported, or blocked, the whole batch is refused and nothing runs.
- If any step requires approval, the human sees one consent card listing all steps in order. "Always allow" is not offered for a batch.
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

Tool descriptions are assembled from structural facts only — method, path, and the fact that the page's current server and authorization are used. OpenAPI prose never lands in a tool description. Annotations are `readOnlyHint` (true for GET/HEAD/OPTIONS), `destructiveHint` (from `x-webmcp.destructive`), and `untrustedContentHint`.

An operation is **not** registered as a direct tool when it is withheld, filtered out, unsupported, or its resolved decision is `block`. It can still be reached by `openapi_execute_operation` if its decision is `allow` or `confirm`.

Documents with more operations than `maxDirectOperationTools` (default 64) register no direct tools at all. Discovery and generic execution still work.

## `agentPolicy`

`openapi_search_operations` and `openapi_get_operation` report the resolved policy for each operation:

```json
{
  "decision": "confirm",
  "destructive": true,
  "requiresApproval": true,
  "declaredIn": "openapi-document"
}
```

| Field | Values | Meaning |
|---|---|---|
| `decision` | `allow` \| `confirm` \| `block` | What happens if the agent calls it. |
| `destructive` | boolean | The publisher marked the operation irreversible. |
| `requiresApproval` | boolean | True exactly when `decision` is `confirm`. |
| `declaredIn` | `openapi-document` \| `page` | Which source produced the decision. `page` also covers the case where the decision was raised because the operation is destructive. |

The publisher's `reason` prose is deliberately **not** included. It is untrusted document text intended for a human, so it goes to the consent card and never into model-readable tool metadata. The agent learns *that* a person will be asked, not the argument for saying yes.

## The `x-webmcp` extension

An `x-webmcp` object is valid on the OpenAPI document root, where it acts as a default, and on any operation, where it overrides the root.

```yaml
x-webmcp:
  policy: ask-first          # no-prompt | ask-for-edits | ask-first | read-only | deny
  destructive: true          # boolean
  reason: Permanently removes a project and all of its tasks.
```

| Field | Type | Notes |
|---|---|---|
| `policy` | string enum | Any other value is dropped. |
| `destructive` | boolean | Only the literal `true` is honoured. |
| `reason` | string | Trimmed and truncated to 240 characters. Shown to a human only. |

Parsing keeps only values this version understands. A non-object, an array, `policy: "allow-everything"`, `destructive: "yes"` — each is dropped, and an annotation left with no recognised fields is treated as absent. A malformed or hostile annotation degrades to "no annotation", never to a weaker policy.

`destructive` is the logical OR of the operation annotation and the document-root annotation.

### How a decision is reached

Each permission mode reduces to a decision about one operation. Read-only means the method is GET, HEAD, or OPTIONS.

| Mode | Read operation | Write operation |
|---|---|---|
| `no-prompt` | `allow` | `allow` |
| `ask-for-edits` | `allow` | `confirm` |
| `ask-first` | `confirm` | `confirm` |
| `read-only` | `allow` | `block` |
| `deny` | `block` | `block` |

The decisions form a lattice: `allow < confirm < block`.

1. Reduce the page's `permissionMode` to a page decision.
2. Reduce the document annotation — the operation's `policy` if present, otherwise the root's — to a document decision. If neither declares a `policy`, there is no document decision.
3. If `trustSpecAnnotations` is `false` (the default), take the **stricter** of the two. The document can only tighten. If it is `true`, the document decision replaces the page decision when one exists.
4. If either source says `deny`, the decision becomes `block` and the operation is marked hidden — under either trust setting.
5. If the operation is `destructive` and the decision is still `allow`, raise it to `confirm`.

Step 4 is why `deny` is safe to honour from an untrusted document: withholding a capability is never an escalation. It cuts both ways — a page `permissionMode: "deny"` is an absolute kill switch that withholds every operation, and no annotation can talk its way out of it even when `trustSpecAnnotations` is `true`.

### Truth table

Cells give the resolved decision. `withheld` means blocked *and* removed from the capability set. Add `destructive: true` to any row and every `allow` becomes `confirm`.

**Default (`trustSpecAnnotations: false`) — the document may only tighten.**

Read operations (GET/HEAD/OPTIONS):

| page mode \ `x-webmcp.policy` | none | `no-prompt` | `ask-for-edits` | `ask-first` | `read-only` | `deny` |
|---|---|---|---|---|---|---|
| `no-prompt` | allow | allow | allow | confirm | allow | withheld |
| `ask-for-edits` | allow | allow | allow | confirm | allow | withheld |
| `ask-first` | confirm | confirm | confirm | confirm | confirm | withheld |
| `read-only` | allow | allow | allow | confirm | allow | withheld |
| `deny` | withheld | withheld | withheld | withheld | withheld | withheld |

Write operations (POST/PUT/PATCH/DELETE):

| page mode \ `x-webmcp.policy` | none | `no-prompt` | `ask-for-edits` | `ask-first` | `read-only` | `deny` |
|---|---|---|---|---|---|---|
| `no-prompt` | allow | allow | confirm | confirm | block | withheld |
| `ask-for-edits` | confirm | confirm | confirm | confirm | block | withheld |
| `ask-first` | confirm | confirm | confirm | confirm | block | withheld |
| `read-only` | block | block | block | block | block | withheld |
| `deny` | withheld | withheld | withheld | withheld | withheld | withheld |

Note the whole `no-prompt` row of the write table: an annotation can raise a silent page to `confirm` or `block`, and the `read-only` row shows that no annotation can lower a blocked write.

**Trusted (`trustSpecAnnotations: true`) — the document is authoritative.**

Read operations:

| page mode \ `x-webmcp.policy` | none | `no-prompt` | `ask-for-edits` | `ask-first` | `read-only` | `deny` |
|---|---|---|---|---|---|---|
| `no-prompt` | allow | allow | allow | confirm | allow | withheld |
| `ask-for-edits` | allow | allow | allow | confirm | allow | withheld |
| `ask-first` | confirm | allow | allow | confirm | allow | withheld |
| `read-only` | allow | allow | allow | confirm | allow | withheld |
| `deny` | withheld | withheld | withheld | withheld | withheld | withheld |

Write operations:

| page mode \ `x-webmcp.policy` | none | `no-prompt` | `ask-for-edits` | `ask-first` | `read-only` | `deny` |
|---|---|---|---|---|---|---|
| `no-prompt` | allow | allow | confirm | confirm | block | withheld |
| `ask-for-edits` | confirm | allow | confirm | confirm | block | withheld |
| `ask-first` | confirm | allow | confirm | confirm | block | withheld |
| `read-only` | block | allow | confirm | confirm | block | withheld |
| `deny` | withheld | withheld | withheld | withheld | withheld | withheld |

The `none` column is identical in both tables: with no annotation, the page decides.

## Consent and the approval gate

Direct tools, `openapi_execute_operation`, and `openapi_execute_batch` all pass through one authorization function, so there is exactly one place policy is evaluated and exactly one place a person is asked.

- `block` returns an error without asking anyone: `OPERATION_DENIED` for a withheld operation, `READ_ONLY_MODE` for a write under a read-only policy, `POLICY_BLOCKED` otherwise.
- `confirm` raises a consent card in the Agent Console and awaits the answer. **Deny** returns `PERMISSION_REQUIRED`. **Always allow** remembers the operation key for the rest of the page session and is not offered for destructive operations or batches.
- `allow` proceeds, and the call is still recorded in the console's activity log with its outcome and duration.

## Result handling

Responses are normalised before they reach the agent. At most 50 headers are kept and credential-shaped header names are dropped. Bodies over roughly 50 KB are replaced by `{ "truncated": true, "originalBytes": N }`. Image, audio, video, PDF, and ZIP bodies are reported as `{ contentType, bytes, included: false }` rather than inlined. Operation results are untrusted content.

## Error codes

`WEBMCP_UNAVAILABLE`, `SPEC_NOT_READY`, `SPEC_INVALID`, `OPERATION_NOT_FOUND`, `OPERATION_AMBIGUOUS`, `OPERATION_UNSUPPORTED`, `INPUT_INVALID`, `CONTENT_TYPE_UNSUPPORTED`, `AUTH_REQUIRED`, `NETWORK_ERROR`, `CORS_ERROR`, `ABORTED`, `RESPONSE_TOO_LARGE`, `SWAGGER_EXECUTION_ERROR`, `PERMISSION_REQUIRED`, `READ_ONLY_MODE`, `OPERATION_DENIED`, `POLICY_BLOCKED`, `BATCH_TOO_LARGE`, `INTERNAL_ERROR`.
