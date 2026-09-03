# Submission description

- **Live demo:** _add at submission time_
- **Repository:** _add at submission time_
- **Video:** _add at submission time_

## What it is

Swagger UI WebMCP turns a normal OpenAPI documentation page into an ephemeral agent interface using the exact API environment the user already has open. The plugin compiles operations from the currently loaded OpenAPI document into structured WebMCP tools. Those tools inherit Swagger UI's live selected server, authorization state, request and response interceptors, browser credentials, and normal execution path.

This lets a developer sign into internal API documentation, choose staging, work manually through Swagger, and let a browser agent call the same APIs without installing an MCP server, copying bearer tokens, or recreating the environment elsewhere. If the developer switches Swagger from staging to production, the agent's next call follows that live selection automatically.

Swagger UI remains completely functional without WebMCP. There is no embedded model or AI SDK; WebMCP simply makes the existing application semantically accessible to a compatible browser agent. A conventional MCP server is still better for persistent API access away from the website.

Installation is one import and one plugin entry in an existing Swagger UI configuration.

## The capability set

Five core tools are always registered — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, and `openapi_execute_batch` — so an agent has something usable even for documents too large for per-operation tools. Each exposed operation additionally gets a direct `api.<safe-name>.<generation-hash>` tool, regenerated whenever the loaded document changes.

`openapi_execute_batch` runs several operations in order under a single human approval. Every step is resolved and policy-checked before any step executes, so a batch never half-applies a plan the user would have refused.

## The part we think is new: `x-webmcp`

The page owner and the API owner are usually different people, and the page owner knows least about which endpoints are dangerous. So the agent permission vocabulary lives in the OpenAPI document, next to the endpoint it describes:

```yaml
paths:
  /projects/{projectId}:
    delete:
      x-webmcp:
        policy: ask-first
        destructive: true
        reason: Permanently removes a project and all of its tasks.
  /billing/charges:
    post:
      x-webmcp:
        policy: deny
        reason: Payments are out of scope for agents on this documentation page.
```

An OpenAPI document is untrusted input, so this is built as a ratchet rather than a switch. Both the page's `permissionMode` and the document's annotation reduce to a decision on the lattice `allow < confirm < block`, and by default the stricter one wins: a document can tighten the page's policy but never loosen it. Unrecognised annotation values are dropped rather than guessed at, so a hostile annotation degrades to "no annotation". A publisher who authors both page and document can opt into `trustSpecAnnotations: true`, and even then `policy: deny` still withholds the operation and `destructive: true` still forces a human confirmation.

`policy: deny` withholds an operation entirely — it is absent from search, inspection, execution, and registration, so the agent has no evidence it exists. A human can still call it in Swagger UI on the same page. A blocked-but-visible operation is different: the agent can see it and see why it cannot use it, which is what lets it say so instead of retrying.

## The human half

Consent happens in an in-page Agent Console rather than a native dialog. It shows the selected server, the page mode, whether spec policy is authoritative, a ledger of the capability set, and a live log of every agent call with its outcome and duration. When an operation needs approval, a card names the operation, lists the arguments, shows the publisher's `reason` labelled "Stated by the API document" — rendered as text, because it is untrusted — and offers Allow once, Always allow, and Deny. Always allow is withheld for destructive operations.

This replaces `window.confirm`, which blocks the event loop and would stall the agent's own tool call, cannot show the arguments being approved, and has no memory, so it trains people to click through.

The publisher's `reason` prose is deliberately kept out of `agentPolicy` and every other model-readable surface. The agent learns *that* a person will be asked; the argument for saying yes goes to the person.

## Safety properties

OpenAPI prose and API responses are untrusted and never enter privileged tool metadata. Auth values never enter tool inputs or results; credential-shaped parameter and header names are excluded and response headers redacted. No tool can name a URL — every call resolves against the currently selected Swagger server. Direct tools, the generic executor, and the batch executor all pass through a single authorization function, so there is exactly one place policy is evaluated and one place a human is asked. Responses are bounded to about 50 KB, binary bodies are described rather than inlined, and `AbortSignal` is honoured.

## The demo

A fictional Waypoint Projects API with 28 annotated operations, backed by one shared stateful router used by both the local dev server and the deployed functions, with separate sandbox and production data stores. It exercises every HTTP method, path/query/header parameters, repeated array query parameters, cursor pagination, `If-Match` optimistic concurrency returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload deliberately left unsupported as a direct tool, and deliberate 401/404/422 paths. Its audit log records whether each write came from Swagger UI or from the agent. The page can also load an unannotated copy of the same document, or any OpenAPI URL, and `?maxTools=N` demonstrates the large-document fallback.

## Notes for judging

The WebMCP Challenge's official page says submissions need a description, working live app, code repository, and demo video, and evaluates usefulness, originality, execution, thoughtful WebMCP use, and human-agent experience. This repository includes the implementation, unit and end-to-end tests, CI, the demo script, deployment configuration, and Apache-2.0 licensing; the live URL and video link should be added at submission time.
