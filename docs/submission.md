# Submission description

- **Live demo:** https://openapi-web-mcp.vercel.app
- **Repository:** https://github.com/alliecatowo/openapi-web-mcp
- **Video:** _add at submission time_

## What it is

Swagger UI WebMCP turns a normal OpenAPI documentation page into an ephemeral agent interface using the exact API environment the user already has open. The plugin compiles operations from the currently loaded OpenAPI document into structured WebMCP tools. Those tools inherit Swagger UI's live selected server, authorization state, request and response interceptors, browser credentials, and normal execution path.

This lets a developer sign into internal API documentation, choose staging, work manually through Swagger, and let a browser agent call the same APIs without installing an MCP server, copying bearer tokens, or recreating the environment elsewhere. If the developer switches Swagger from staging to production, the agent's next call follows that live selection automatically.

Swagger UI remains completely functional without WebMCP. There is no embedded model or AI SDK; WebMCP simply makes the existing application semantically accessible to a compatible browser agent. A conventional MCP server is still better for persistent API access away from the website.

Installation is one import and one plugin entry in an existing Swagger UI configuration.

## The capability set

Five core tools are always registered — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, and `openapi_execute_batch` — so an agent has something usable even for documents too large for per-operation tools. Each exposed operation additionally gets a direct `api.<safe-name>.<generation-hash>` tool, regenerated whenever the loaded document changes.

`openapi_execute_batch` runs several operations in order with no page prompts. Every step is resolved and exposure-checked before any step executes, so a batch never half-applies a plan containing a step the agent may not call. The tool registers with `destructiveHint: true` and its full plan is visible in the input schema, so the WebMCP client gates the invocation as one unit.

## The part we think is new: `x-webmcp`

The page owner and the API owner are usually different people, and the page owner knows least about which endpoints are dangerous. So the agent authorization vocabulary lives in the OpenAPI document, next to the endpoint it describes:

```yaml
paths:
  /projects/{projectId}:
    delete:
      x-webmcp:
        tool: write
        destructive: true
  /reports/usage:
    get:
      security:
        - bearerAuth: []
      x-webmcp:
        tool: read
        requiresAuth: bearerAuth
  /billing/charges:
    post:
      x-webmcp:
        tool: hidden
```

The declaration says what each operation *is* for agents — a READ tool, a WRITE tool, HIDDEN — and optionally what client auth state its calls require. An OpenAPI document is untrusted input, so this is built as a ratchet rather than a switch. Both the page's `exposure` and the document's `tool` reduce to a level on the lattice `hidden < read < write`, and by default the tighter one wins: a document can hide operations or hold writes at read, but never loosen the page. Unrecognised annotation values are dropped rather than guessed at, so a hostile annotation degrades to "no annotation". A publisher who authors both page and document can opt into `trustSpecAnnotations: true`, and even then `tool: hidden` still removes the operation. There are no legacy aliases for the old consent vocabulary — old keys are ignored, so annotations always mean what they say now.

`tool: hidden` removes an operation entirely — it is absent from search, inspection, execution, and registration, so the agent has no evidence it exists. A human can still call it in Swagger UI on the same page. A held-but-visible operation is different: the agent can see it and see why it cannot use it, which is what lets it say so instead of retrying. An authorization-gated operation is a third state: the agent sees it, sees which schemes it needs, and gets a structured `AUTH_REQUIRED` until a human authorizes through Swagger UI's normal dialog — SEE vs CALL, evaluated against live client state at call time.

## The human half

There is deliberately no agent-only UI on the page — no consent prompts, no allow-once/allow-always, no client-side tool locking. Permission UX belongs to the WebMCP client (the agent host), which gates invocations using the annotations each tool was registered with. The page's interface to the client is registration visibility plus MCP annotations plus structured errors, and agent calls remain visible through Swagger UI's own response panels rather than a parallel console.

The demo story is therefore shared state, not approvals: a developer signs in, picks an environment, authorizes schemes in the normal dialog, and the agent's next call follows all of it automatically.

## Safety properties

OpenAPI prose and API responses are untrusted and never enter privileged tool metadata. Auth values never enter tool inputs or results; credential-shaped parameter and header names are excluded and response headers redacted. No tool can name a URL — every call resolves against the currently selected Swagger server. Direct tools, the generic executor, and the batch executor all pass through a single authorization function evaluated at call time against live auth state, so there is exactly one place exposure is enforced and it never prompts. Responses are bounded to about 50 KB, binary bodies are described rather than inlined, and `AbortSignal` is honoured.

## The demo

A fictional Waypoint Projects API with 28 annotated operations, backed by one shared stateful router used by both the local dev server and the deployed functions, with separate sandbox and production data stores. It exercises every HTTP method, path/query/header parameters, repeated array query parameters, cursor pagination, `If-Match` optimistic concurrency returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload deliberately left unsupported as a direct tool, hidden operations, a write held at read, three `requiresAuth` gates (HTTP bearer on the usage report, header API key on export creation, query API key on export status), and deliberate 401/404/422 paths. Its audit log records whether each write came from Swagger UI or from the agent. The page can also load an unannotated copy of the same document, or any OpenAPI URL, and `?maxTools=N` demonstrates the large-document fallback.

## Notes for judging

The WebMCP Challenge's official page says submissions need a description, working live app, code repository, and demo video, and evaluates usefulness, originality, execution, thoughtful WebMCP use, and human-agent experience. This repository includes the implementation, unit and end-to-end tests, CI, the demo script, deployment configuration, and Apache-2.0 licensing; the live URL and video link should be added at submission time.
