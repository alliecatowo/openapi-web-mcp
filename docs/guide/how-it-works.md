# How it works

## Registration

On every document load the plugin enumerates operations from Swagger UI's own resolved spec, resolves local `$ref`s, converts parameters and request bodies into JSON Schema tool inputs, computes a generation hash, and registers tools. The hash covers the raw operation, so changing an `x-webmcp` annotation changes the tool's name — policy changes are visible in tool identity.

Generations are managed with `AbortController`. Two details that are not obvious: the previous generation must be aborted **before** the next is registered, because unchanged operations keep their tool names across generations and aborting afterwards would delete the new tools through those shared names; and a supersede guard means only the current generation records itself, since a newer rebuild may land while registrations are in flight. Session locks join the spec fingerprint as generation identity, so locking re-derives the capability set through the same path a document swap does.

## Execution — and the tax it costs

Tools can never name a URL. A call resolves its operation against the *currently selected* Swagger server, and then — deliberately — **does not build its own fetch client.** Arguments are written into the Swagger store, `specActions.execute` runs the request through the page's configured interceptors, credentials, and selected server, and the result is read back out of the store. That is why environment and login are inherited rather than duplicated, and why agent calls render in the normal response panels.

Driving someone else's store instead of owning one has real costs, and paying them honestly is what makes the claim work:

- **Executions are serialized through a promise queue.** Swagger's store holds one form per operation, so concurrent calls — or an agent call racing the human's typing — would clobber each other's parameters.
- **Responses are observed, not awaited.** Swagger's action wrappers swallow exceptions and return `undefined`, so completion is detected by watching for the Immutable response record to be replaced.
- **Both the path item and the operation are resolved.** Parameters declared once on the path item merge into the operation only when the *path item* is resolved; without that, Swagger collects no value for them and sends a literal `{placeholder}` in the URL.
- **Path parameters are validated on the merged set before anything is written**, for the same reason.
- **Arrays and objects are handed over unflattened**, so Swagger applies each parameter's own `style`/`explode` rules — which is how repeated array query parameters work correctly.

## Authorization

Direct tools, the generic executor, and the batch executor all funnel through one `authorize` function evaluated at call time against live state, so there is exactly one place exposure is enforced. It composes page `exposure`, the document's `x-webmcp`, the page's `policyResolver`, and the human's session locks on the `hidden < read < write` lattice, then checks `requiresAuth` against Swagger UI's live authorized schemes. Nothing is cached: authorizing in Swagger UI, or changing a lock, flips the *next* call with no re-registration.

**The page never prompts.** Permission UX belongs to the WebMCP client. The page's interface to the client is exactly three things: registration visibility, MCP annotations (`readOnlyHint`, `destructiveHint`, `costHint`, `untrustedContentHint`), and structured errors (`AUTH_REQUIRED`, `LOCKED`, `OPERATION_DENIED`, `READ_ONLY_MODE`).

An earlier version of this plugin shipped a full in-page consent system — a shadow-DOM console, consent cards showing argument JSON, allow-once/allow-always. It was deleted. A page that prompts is a second policy engine competing with the client's, and the page's has less context.


Architecture overview: [Architecture](/architecture). Tool reference: [WebMCP tools](/webmcp-tools).
