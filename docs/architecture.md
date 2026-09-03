# Architecture

The plugin sits between two things that already exist: a Swagger UI instance holding a live API session, and a browser agent holding `document.modelContext`. It adds an exposure engine and a single call-time gate. It adds no network client, no model, no prompts, no persistent state, and no UI of its own.

```text
                        OpenAPI document (untrusted input)
                                      |
                                      v
  +-- Swagger UI 5.32  ------------------------------------------------------+
  | spec store . server dropdown . authorize dialog . interceptors           |
  | . Try it out . the visible request/response surface                      |
  +--------------------------------------------------------------------------+
       ^                             |
       | specActions.execute         | store.subscribe (spec/server/auth)
       |                             v
  +-- swagger-ui-webmcp  ----------------------------------------------------+
  |                                                                          |
  |   enumerate + compile        exposure engine                             |
  |   +-----------------+     +---------------+                              |
  |   | operations      |     | page exposure |                              |
  |   | bounded schemas |---->| x-webmcp tool |                              |
  |   | safe name+hash  |     | hidden <      |                              |
  |   | x-webmcp parsed |     | read < write  |                              |
  |   +--------+--------+     +-------+-------+                              |
  |            |                      v                                      |
  |            v              +------------------+                            |
  |   +-----------------+     | gate.authorize   |                            |
  |   | registry        |     | gate.authorize-  |                            |
  |   | one Abort-      |---->| Batch            |                            |
  |   | Controller per  |     | the single choke |                            |
  |   | tool generation |     | point: exposure  |                            |
  |   +--------+--------+     | + live auth are  |                            |
  |            |              | enforced here,   |                            |
  |            | registerTool | at call time     |                            |
  |            |              +--------+---------+                            |
  |            |                       | authorized                           |
  |            |                       v                                      |
  |            |              swagger/execute.ts                              |
  |            |              current server, Swagger execution,              |
  |            |              normalised and redacted response                |
  |                                                                          |
  +--------------------------------------------------------------------------+
               |
               v
     document.modelContext
     +----------------------------+
     | openapi_get_context        |
     | openapi_search_operations  |
     | openapi_get_operation      |
     | openapi_execute_operation  |
     | openapi_execute_batch      |
     | api.<name>.<hash>  x N     |
     +-------------+--------------+
                   |
             browser agent
```

## Modules

| Path | Responsibility |
|---|---|
| `src/index.ts` | Swagger UI plugin entry. Reads `webMcp` config in `afterLoad`, constructs the registry, subscribes to the Swagger store. |
| `src/openapi/enumerate.ts` | Walks `paths`, merges path-level and operation-level parameters, compiles a bounded input schema, derives the safe tool name and generation hash, and parses `x-webmcp`. |
| `src/openapi/schema.ts`, `sanitize.ts`, `hash.ts` | Structural schema compilation, credential-shaped-name filtering and title sanitising, and the generation hash. |
| `src/policy/index.ts` | The exposure engine. Reduces a page exposure and a document annotation to `read` / `write` / `hidden`, plus an authorization gate and `destructive`. Pure and independently testable. |
| `src/webmcp/registry.ts` | Owns the capability set: registers core tools once, re-derives direct tools per document generation, and implements search, inspection, execution, and batch. |
| `src/webmcp/gate.ts` | `authorize` and `authorizeBatch`. The only place exposure is enforced, evaluated at call time against live auth state. Never prompts. |
| `src/webmcp/core-tools.ts`, `operation-tool.ts`, `schemas.ts` | Tool definitions. Descriptions are built from structural facts; no OpenAPI prose enters them. |
| `src/swagger/execute.ts`, `server.ts`, `context.ts`, `auth.ts`, `responses.ts` | The live adapter: current server, current authorization, execution through Swagger UI, and response normalisation. |

## The request path, end to end

1. **Registration.** Startup is deferred one task past `afterLoad`, because Swagger UI is still assembling its configuration while plugins load; the `webMcp` settings are then re-read live on each use. Startup calls `registry.initialize()`. If `document.modelContext` is absent the plugin stops; Swagger UI is untouched. Otherwise the five core tools are registered under one `AbortController`, and `rebuild()` runs.

2. **Deriving the capability set.** `rebuild()` fingerprints the current spec and returns early if it has not changed. Otherwise it enumerates every operation, resolves each one's exposure, and registers a direct tool for each operation that is visible, supported, and callable — unless the document exceeds `maxDirectOperationTools`, in which case no direct tools are registered. Authorization-gated operations ARE registered: the gate is evaluated at call time, so an unauthenticated agent still sees them. The previous generation's `AbortController` is aborted only after the new registrations settle, so there is never a window with no tools.

3. **Re-derivation.** The plugin subscribes to the Swagger store. Changing the server, authorizing, or loading a different document all settle through it. Server and auth changes need no re-registration, because they are read at execution time; a document change produces a new fingerprint, new hashes, and a new generation.

4. **The agent calls a tool.** A direct tool already knows its operation. `openapi_execute_operation` and each batch step resolve their `operation` string to exactly one visible operation first, returning `OPERATION_NOT_FOUND`, `OPERATION_AMBIGUOUS`, or `OPERATION_UNSUPPORTED` before any exposure work. Hidden operations are invisible to this step.

5. **The gate.** `authorize` resolves the exposure for the operation and checks it against Swagger UI's live authorized schemes. Hidden or held returns `OPERATION_DENIED` / `READ_ONLY_MODE` immediately. An unsatisfied `requiresAuth` gate returns `AUTH_REQUIRED`, naming the needed schemes. `authorizeBatch` resolves *all* steps first: if any one is hidden, held, or unauthorized, the batch is refused whole and nothing runs.

6. **Execution.** `executeOperation` interpolates path parameters, builds the query string (repeating array values), resolves the base URL from `oas3Selectors.serverEffectiveValue` for the currently selected server, and hands the call to `specActions.execute`, falling back to `swaggerClient.execute`. Swagger UI's own request and response interceptors, authorization state, and `withCredentials` setting apply, and the call appears in Swagger UI where it normally would — agent calls remain visible through Swagger UI's own panels (`displayedInSwaggerUi`). There is no code path that accepts a URL from the agent.

7. **Return.** The response is normalised: headers filtered and capped, credential-shaped names dropped, bodies bounded to about 50 KB, binary content types described rather than inlined. The agent receives a structured result marked as untrusted content.

## Why these boundaries

- **The document is input, not authority.** `x-webmcp` is parsed defensively and, by default, can only tighten. The one thing an untrusted document can always do is take a capability away.
- **Permission UX belongs to the client.** The page declares exposure through registration visibility and MCP annotations (`readOnlyHint`, `destructiveHint`, `untrustedContentHint`) and reports refusals as structured errors. Prompting, remembering grants, and hiding or disabling tools in the agent's own state are the WebMCP client's UI, not this plugin's — there is deliberately no in-page surface that exists only for agents.
- **One choke point.** Direct tools, the generic executor, and the batch executor share `gate.ts`. There is no second path to `executeOperation` that skips exposure.
- **SEE vs CALL is evaluated live.** The authorization gate reads Swagger UI's current authorized schemes on every call, so a human authorizing in the normal dialog flips agent behavior instantly with no re-registration round-trip.
- **Prose never becomes metadata.** Summaries and descriptions reach the agent only through explicitly untrusted-marked discovery results. Tool descriptions and `agentPolicy` are structural.
- **Swagger UI stays the surface.** Execution, visibility, authorization state, and the environment all remain Swagger UI's. Removing the plugin removes agent capability and changes nothing else.
