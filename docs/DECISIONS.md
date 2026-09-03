# Decisions

Deviations from [BUILD_CONTRACT.md](BUILD_CONTRACT.md), with the reasoning that produced them. Everything else in the contract is implemented as written: Swagger UI 5.32.x, Apache-2.0, versioned `api.<safe-name>.<hash>` direct tools, untrusted OpenAPI prose kept out of privileged metadata, no secrets in tool inputs or outputs, live server/auth/interceptor/credential reads at execution time, a 64-tool default cap, safe degradation for binary bodies, bounded and redacted results, `AbortSignal` support, no production polyfill, and a test-only `modelContext` shim.

## 1. A fifth core tool: `openapi_execute_batch`

**Contract:** four core tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`.

**Built:** those four plus `openapi_execute_batch`, which runs up to `maxBatchSteps` operations (default 10) from the current document in order under a single human approval.

**Why:** real API work is multi-step — create a project, then three tasks, then a comment. With only the single-operation executor, a five-step plan produces five separate consent prompts, and the person approving the fourth has lost sight of the first. Worse, approving step by step means a plan can half-apply: the user consents to steps 1-3, refuses step 4, and is left with partial state they never asked for.

The batch tool resolves and policy-checks every step before any step executes. If one step is withheld or blocked, nothing runs at all. If any step needs approval, the person sees one card listing the whole plan and answers once. That is both a better human-agent experience and a stronger safety property than N independent prompts, which is why the deviation was worth taking. "Always allow" is not offered for a batch, and `stopOnError` defaults to `true`.

## 2. `x-webmcp`, an OpenAPI extension the contract does not define

**Contract:** the page installs the plugin and sets a permission mode; the document is untrusted input.

**Built:** an `x-webmcp` object valid on the document root and on any operation, carrying `policy`, `destructive`, and `reason`.

**Why:** the page owner and the API owner are often different teams, and the page owner is the one with the least information about which endpoints are dangerous. "Deleting a project also deletes its tasks" is a fact about the API, and it belongs next to the endpoint in the document rather than in a hand-maintained list in a page config.

The contract's premise that the document is untrusted is preserved rather than weakened. Annotations are parsed defensively, unrecognised values are dropped rather than guessed at, and by default an annotation may only *tighten* the page's decision on the lattice `allow < confirm < block`. A document cannot talk a `read-only` page into permitting writes. `trustSpecAnnotations: true` is available to a publisher who authors both page and document, and even then `policy: deny` still withholds and `destructive: true` still forces confirmation. The one direction an untrusted document is always allowed to move is toward less capability.

## 3. An in-page consent UI instead of a native confirm

**Contract:** implies human approval for gated operations; the status pill was the only UI.

**Built:** the Agent Console — a shadow-DOM panel showing the selected server, page mode, whether spec policy is authoritative, the capability ledger, a live activity log, and consent cards with Allow once / Always allow / Deny.

**Why:** `window.confirm` is unsuitable for approving an agent's tool call on three counts. It blocks the event loop, which stalls the very call it is asking about and can trip an agent's own timeouts. It can display only a string, so the person cannot see the arguments they are approving — the difference between deleting one task and deleting a project is exactly the argument. And it has no memory, so a legitimate repeated operation prompts every time, which trains people to click through.

The console fixes all three: it is asynchronous, it shows the argument groups and the full argument JSON, and "Always allow" grants for the rest of the page session. It also does the thing a modal cannot: it stays on screen, so there is a persistent record of what the agent did, with outcomes and durations. The publisher's `reason` is rendered there as text under the label "Stated by the API document", never as HTML and never in model-readable metadata. `showConsole: false` removes it, in which case gated operations fail closed.

## 4. One demo backend behind both transports

**Contract:** ship a public demo with a sandbox/production server switch and cookie login.

**Built:** `api/_waypoint/store.ts` and `api/_waypoint/router.ts` — one transport-agnostic, stateful router shared by the Vite dev middleware and the Vercel function in `api/[...route].ts`.

**Why:** the demo previously had three separate implementations of the same fake API, which had already diverged. A demo whose local behaviour differs from its deployed behaviour is worse than no demo, because the failure surfaces during the recording. One router, two thin transports, and separate per-environment stores means `npm run dev` and the deployed URL cannot drift.

The consolidated backend also made it practical to grow the demo document to 28 operations covering the cases that actually exercise the plugin: every HTTP method, path/query/header parameters, repeated array query parameters, enums, cursor pagination, `If-Match` optimistic concurrency returning 409, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload that is deliberately unsupported as a direct tool, and deliberate 401/404/422 paths. The audit log records whether each write came from Swagger UI or from the agent.
