# Decisions

Deviations from [BUILD_CONTRACT.md](BUILD_CONTRACT.md), with the reasoning that produced them. Everything else in the contract is implemented as written: Swagger UI 5.32.x, Apache-2.0, versioned `api.<safe-name>.<hash>` direct tools, untrusted OpenAPI prose kept out of privileged metadata, no secrets in tool inputs or outputs, live server/auth/interceptor/credential reads at execution time, a 64-tool default cap, safe degradation for binary bodies, bounded and redacted results, `AbortSignal` support, no production polyfill, and a test-only `modelContext` shim.

> Historical note: entries 1–3 below describe the original consent-based
> interaction model (permission lattice, in-page Agent Console, single-approval
> batch). That model was replaced — see entries 5–7 for what superseded it and
> why. Entry 4 (one demo backend) still stands.

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

## 5. Permission UX belongs to the WebMCP client — the consent system was removed

**Was:** entries 1–3 — a permission lattice (`allow < confirm < block`), an in-page Agent Console with consent cards, allow-once/allow-always session memory, and single-approval batch.

**Now:** none of that exists. No consent UI, no consent flow in the gate, no remembered grants, no `showConsole` or `permissionMode` options.

**Why:** permission UX is the WebMCP client's job (the agent host), not the page's. A page inventing its own prompts duplicates — and can contradict — the client's gating: the client already decides what to ask a person based on tool annotations. Two prompters means two policies, and the page's is the one with less context. Client-side endpoint locking (hiding or disabling tools in the agent's own state) is likewise the client's UI, not ours.

Our interface to the client is three things, and only those three: **registration visibility** (hidden operations are never registered or searchable), **MCP annotations** (`readOnlyHint` on reads, absent on writes, `destructiveHint` where the publisher marked an irreversible operation, `untrustedContentHint` wherever spec/API content flows out), and **structured errors** (`OPERATION_DENIED`, `READ_ONLY_MODE`, `AUTH_REQUIRED`). Agent calls remain visible through Swagger UI's own panels (`displayedInSwaggerUi`) — that shared-state visibility is the demo story, not a parallel console.

> Update: entry 8 below partly revisits the "no client-side locking" line — page-side *session* locks are ours after all, for the reasons given there. Client-side gating stays the client's job.

## 6. One clean policy vocabulary: `tool` / `requiresAuth` / `destructive`

**Was:** `x-webmcp: { policy: no-prompt | ask-for-edits | ask-first | read-only | deny, destructive, reason }` plus a page `permissionMode` — a vocabulary about *prompting*.

**Now:** `x-webmcp: { tool: "read" | "write" | "hidden", requiresAuth: true | <scheme> | [<schemes>], destructive: bool }` plus a page `exposure: "read" | "write" | "hidden"` — a vocabulary about *what the operation is for agents*.

**Why each piece:**

- `tool` declares the publisher's authorization policy per operation: a READ tool, a WRITE tool, or HIDDEN. The page default composes tighten-only on the lattice `hidden < read < write` (or the document is authoritative under `trustSpecAnnotations`), exactly as before — the rule survived, the prompting semantics did not.
- `requiresAuth` declares the policy *per client auth state*: the operation is listed and registered while unauthorized (SEE) but not callable (CALL returns `AUTH_REQUIRED`). The gate is evaluated at call time against Swagger UI's live authorized schemes, so a human authorizing through the normal dialog flips agent behavior instantly with no re-registration. Several names mean ANY of them, mirroring OpenAPI `security` alternatives. `true` means any live authorization.
- `destructive` survived but changed meaning: it no longer forces a prompt (there is nothing to prompt with) — it becomes `destructiveHint` so the *client* can gate.
- `reason` (publisher prose for consent cards) is gone with the cards. Prompt-injection hygiene stays: no prose in schemas, enforced by tests.

**Why no legacy aliases:** the old keys named consent behavior (`allow`, `confirm`, `ask-first`, `deny`, `permissionMode`). Keeping them as aliases would keep two mental models alive and let a copied old annotation silently mean something the author did not intend under the new model. A clean break — unknown keys are ignored — forces annotations to say what they mean now. The old vocabulary's one honest direction (withholding capability) is preserved as `tool: hidden`.

**Session cookies are out of scope for `requiresAuth`, deliberately.** Swagger UI's live auth state only reflects schemes it applies itself (HTTP, API keys). A cookie session set by a server login is invisible to `authSelectors.authorized()`, so gating on it would fail closed forever. Session-gated endpoints therefore surface API 401s rather than `AUTH_REQUIRED` — the demo keeps its cookie flow for the bulk of operations and uses machine-authorizable schemes (bearer, header key, query key) for the three gated ones.

## 7. The batch tool stays — re-justified without approvals

**Was:** entry 1 justified `openapi_execute_batch` as "one approval for a multi-step plan".

**Now:** there are no approvals, but the tool stays. The honest justification is narrower: the client gates the batch *invocation itself* — the tool is registered with `destructiveHint: true` and the full plan is visible in the input schema — and every step is resolved and exposure-checked before anything runs, so a batch never half-applies a plan containing a step the agent may not call. If keeping multi-effect invocations behind one client-side gate is judged to smuggle effects past client gating, the correct move is to remove the tool; as specified here the plan-visibility plus destructive hint is exactly what the client needs to gate it faithfully, so it stays. Had that not held, it would have been deleted rather than kept as cruft.

## 8. Session locks in the docs UI — page-side, memory-scoped, tighten-only

**Was:** entry 5 said endpoint locking is the client's UI, not ours.

**Now:** each operation block carries an access control (view only / read only / hidden) plus an unlock-all reset, and it is ours — page-side, for this session only.

**Why the reversal, and why this shape:** the client's gating answers "should *I* do this", but three real needs belong to the person looking at the docs, not to the agent host: an endpoint the agent must not call but whose server the person does not control (so `x-webmcp` cannot help); confining a misbehaving agent to a subset while debugging; hiding noise so the agent only sees what is relevant. None of those can be expressed by the publisher in advance, and all of them are about what *this page* exposes right now — which is exactly the page's half of the contract.

Memory-scoped (a reload resets to the spec) for two reasons. First, locks are a reaction to a live situation — "not while I debug this" — and reactions should not outlive the session that produced them; anything durable belongs in `x-webmcp`, reviewed and versioned with the document. Second, persistence would need a store the agent might reach and a UI to manage stale entries; an in-memory map has neither problem.

Tighten-only is enforced where the lock composes (`applySessionLock`, after every spec source): a lock can cap a `write` at `read`, deny execution, or hide — it can never un-hide, un-hold, or grant. The agent cannot mutate locks because there is deliberately no path: lock state is module state the tools never touch, no input schema carries a lock field, and no tool reads or writes it. `agentPolicy` reports the effective exposure (`locked`, `lock`) so the agent understands a `LOCKED` denial; that observation is the whole interface. Auth gating stays out: it is live login state, not a lock, with no lock control for it.

Two implementation lessons worth recording. Swagger UI may evaluate a plugin function more than once while wiring the system, so the store could not live in the plugin closure — the rendered controls and the tool gate silently diverged onto two maps, and only a module-level page singleton made them one. And lock re-derivation exposed a latent generation bug: rebuild aborted the old generation *after* re-registering, deleting same-named tools (unchanged operations keep their names across generations). Rebuild now aborts first, with supersede guards.

## 9. Field-merge semantics: explicit wins, UI fills the gaps

**Built:** `openapi_get_operation` reports `liveValues` (whatever the person typed, bounded), and every execution path merges explicit arguments over the live UI values before writing the merged set through Swagger's own pipeline.

**Why this way:** the alternative — agent arguments replace the form, or UI values are invisible — forces one side to clobber the other. Shared browser state means agent ⊇ user: every tool mutation lands in the normal Swagger store, reads observe it, and the merged write is what both the API and the panels see. Explicit-wins is the only merge rule that keeps the agent's words authoritative while letting either side start the work: "person types half, agent finishes and submits" and "agent fills, person reviews, agent submits" are the same mechanism.

Bounds: reporting truncates long values and never surfaces credential-shaped names (the compiler already excludes them from schemas, so there is nothing declared to read back); execution merges full values, because they are the person's own typed input bound for the API they already chose — Swagger would send them on a manual Execute too. Path-parameter validation runs on the merged set, so a UI-typed id satisfies a call the agent makes with empty args.

## 10. The audit fingerprint and its limits

**Built:** the plugin marks whichever operation it is executing; the demo page's interceptor tags those requests `X-Waypoint-Client: webmcp-agent`; the demo API records the pipeline source on every audited write (comparison normalized so header-casing rewrites cannot silently reclassify). In-page, agent calls render in Swagger UI's own panels, and the demo script points at the panel after an agent call.

**Why this is the honest maximum for a demo:** within the demo, the header distinguishes pipeline paths — agent-via-plugin versus person-via-Try-it-out — because the plugin is the only thing that sets the marker. That answers "did an agent call this" for the demo's own audit log, which is what a submission needs to show. It is not an identity proof and must never be described as one: page JavaScript sets the header, the log trusts it, and any client can forge it. Production APIs that need non-repudiation need real authentication. The docs state this outright so the fingerprint is never mistaken for a security boundary.
