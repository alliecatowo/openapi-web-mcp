# Architecture

The plugin sits between two things that already exist: a Swagger UI instance holding a live API session, and a browser agent holding `document.modelContext`. It adds a policy engine, a single approval gate, and an in-page console. It adds no network client, no model, and no persistent state.

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
  |   enumerate + compile        policy engine         Agent Console         |
  |   +-----------------+     +---------------+     +----------------+       |
  |   | operations      |     | page mode     |     | server, mode   |       |
  |   | bounded schemas |---->| x-webmcp      |---->| ledger         |       |
  |   | safe name+hash  |     | allow <       |     | activity log   |       |
  |   | x-webmcp parsed |     | confirm <     |     | consent cards  |       |
  |   +--------+--------+     | block         |     +-------+--------+       |
  |            |              +-------+-------+             ^                |
  |            v                      v                     | await a human  |
  |   +-----------------+     +--------------------------------------+       |
  |   | registry        |     | gate.authorize / gate.authorizeBatch |       |
  |   | one Abort-      |---->| the single choke point: policy is    |       |
  |   | Controller per  |     | resolved here and consent is asked   |       |
  |   | tool generation |     | here, for every path to execution    |       |
  |   +--------+--------+     +------------------+-------------------+       |
  |            |                                 | authorized                |
  |            | registerTool                    v                           |
  |            |                        swagger/execute.ts                   |
  |            |                        current server, Swagger execution,   |
  |            |                        normalised and redacted response     |
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
| `src/index.ts` | Swagger UI plugin entry. Reads `webMcp` config in `afterLoad`, mounts the console, constructs the registry, subscribes to the Swagger store. |
| `src/openapi/enumerate.ts` | Walks `paths`, merges path-level and operation-level parameters, compiles a bounded input schema, derives the safe tool name and generation hash, and parses `x-webmcp`. |
| `src/openapi/schema.ts`, `sanitize.ts`, `hash.ts` | Structural schema compilation, credential-shaped-name filtering and title sanitising, and the generation hash. |
| `src/policy/index.ts` | The permission lattice. Reduces a page mode and a document annotation to `allow` / `confirm` / `block`, plus `hidden` and `destructive`. Pure and independently testable. |
| `src/webmcp/registry.ts` | Owns the capability set: registers core tools once, re-derives direct tools per document generation, and implements search, inspection, execution, and batch. |
| `src/webmcp/gate.ts` | `authorize` and `authorizeBatch`. The only place policy is enforced and the only place a human is asked. |
| `src/webmcp/core-tools.ts`, `operation-tool.ts`, `schemas.ts` | Tool definitions. Descriptions are built from structural facts; no OpenAPI prose enters them. |
| `src/swagger/execute.ts`, `server.ts`, `context.ts`, `responses.ts` | The live adapter: current server, current authorization, execution through Swagger UI, and response normalisation. |
| `src/ui/console.ts` | The shadow-DOM Agent Console: status, ledger, activity log, consent cards. |

## The request path, end to end

1. **Registration.** Startup is deferred one task past `afterLoad`, because Swagger UI is still assembling its configuration while plugins load; the `webMcp` settings are then re-read live on each use. Startup mounts the console and calls `registry.initialize()`. If `document.modelContext` is absent the console says so and the plugin stops; Swagger UI is untouched. Otherwise the five core tools are registered under one `AbortController`, and `rebuild()` runs.

2. **Deriving the capability set.** `rebuild()` fingerprints the current spec and returns early if it has not changed. Otherwise it enumerates every operation, resolves each one's policy, and registers a direct tool for each operation that is visible, supported, and not blocked — unless the document exceeds `maxDirectOperationTools`, in which case no direct tools are registered. The previous generation's `AbortController` is aborted only after the new registrations settle, so there is never a window with no tools. The resulting ledger is pushed to the console.

3. **Re-derivation.** The plugin subscribes to the Swagger store. Changing the server, authorizing, or loading a different document all settle through it. Server and auth changes need no re-registration, because they are read at execution time; a document change produces a new fingerprint, new hashes, and a new generation.

4. **The agent calls a tool.** A direct tool already knows its operation. `openapi_execute_operation` and each batch step resolve their `operation` string to exactly one visible operation first, returning `OPERATION_NOT_FOUND`, `OPERATION_AMBIGUOUS`, or `OPERATION_UNSUPPORTED` before any policy work.

5. **The gate.** `authorize` resolves the policy for the operation. `block` returns an error immediately and records a refusal in the activity log. `confirm` renders a consent card and awaits the person, unless this operation was already granted "always allow" this session. `allow` proceeds. `authorizeBatch` resolves *all* steps first: if any one is blocked the batch is refused whole, and consent for the rest is asked once.

6. **Execution.** `executeOperation` interpolates path parameters, builds the query string (repeating array values), resolves the base URL from `oas3Selectors.serverEffectiveValue` for the currently selected server, and hands the call to `specActions.execute`, falling back to `swaggerClient.execute`. Swagger UI's own request and response interceptors, authorization state, and `withCredentials` setting apply, and the call appears in Swagger UI where it normally would. There is no code path that accepts a URL from the agent.

7. **Return.** The response is normalised: headers filtered and capped, credential-shaped names dropped, bodies bounded to about 50 KB, binary content types described rather than inlined. The activity log row is closed with the status and duration. The agent receives a structured result marked as untrusted content.

## Why these boundaries

- **The document is input, not authority.** `x-webmcp` is parsed defensively and, by default, can only tighten. The one thing an untrusted document can always do is take a capability away.
- **One choke point.** Direct tools, the generic executor, and the batch executor share `gate.ts`. There is no second path to `executeOperation` that skips policy.
- **Prose never becomes metadata.** Summaries and descriptions reach the agent only through explicitly untrusted-marked discovery results. Tool descriptions and `agentPolicy` are structural. The publisher's `reason` reaches a human only.
- **Swagger UI stays the surface.** Execution, visibility, and the environment all remain Swagger UI's. Removing the plugin removes agent capability and changes nothing else.
