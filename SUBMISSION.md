# SUBMISSION.md — internal canonical submission packet

Single source of truth for filling in the Devpost submission form. **This is not an official hackathon-required file** — it is our own working document. Judges are not expected to read it; everything they need is in [README.md](README.md).

Outstanding manual actions live in [CHECKLIST.md](CHECKLIST.md). Video production lives in [DEMO.md](DEMO.md).

---

## 1. Verified official rules

**Verified: 2026-09-02, from <https://webmcp.devpost.com/rules> and <https://webmcp.devpost.com/>.** Re-verify before submitting if more than a few hours have passed.

| | |
|---|---|
| Event | The WebMCP Challenge (OpenAI) |
| Devpost | <https://webmcp.devpost.com/> |
| Official rules | <https://webmcp.devpost.com/rules> |
| Resources | <https://webmcp.devpost.com/resources> |
| Registration period | 25 Aug 2026 11:00 PT – 3 Sep 2026 13:00 PT |
| **Submission deadline** | **3 September 2026, 1:00 PM Pacific Time** |
| Judging | 4–21 Sep 2026 |
| Winners announced | ~23 Sep 2026, 2:00 PM PT |
| Prizes | Top 10 each: $3,000 cash, Codex Micro, ChatGPT Pro (1 yr), merch, supporter prizes. Each project is eligible for one prize. |
| Sponsors | OpenAI, Cloudflare, Vercel, Render, Netlify, Shopify, Google Chrome |

### Submission requirements, as written

1. **Live project URL** — "Provide a working live URL that judges can access using ChatGPT's in-app browser or Google Chrome with WebMCP enabled."
2. **Text description** covering: "Why your use case is a strong fit for WebMCP"; "How it creates a better user experience"; "Describe what people and agents can do together that was difficult or impossible before"; "Briefly explain how you implemented WebMCP".
3. **Public code repository** (GitHub, GitLab, or Bitbucket) with all source, assets, and functional instructions. "Must be open source by including an open source license file", and the license must be "detectable and visible at the top of the repository page".
4. **Demonstration video** — "must be less than three (3) minutes"; "must include a clear demo of your project functioning and with audio that covers what you built"; "must be uploaded to and made publicly visible on YouTube"; no third-party trademarks or unlicensed copyrighted music.
5. **Language** — all materials in English.
6. **Eligibility of the project** — "Projects must be either newly created during the Hackathon Submission Period or, if the Project existed prior to the Submission Period, must have been meaningfully extended using WebMCP after the Submission Period start date."

### Judging criteria, as written (all equally weighted)

1. **WebMCP Leverage** — "How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation?"
2. **Execution** — "Does the project deliver a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept?"
3. **Potential Impact** — "Does the project make a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem?"
4. **Creativity & Ambition** — "How creative and novel is the concept and does the project differ from existing concepts?"

---

## 2. Compliance matrix

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Working live URL, reachable in ChatGPT in-app browser / Chrome with WebMCP | ✅ | <https://openapi-web-mcp.vercel.app> — HTTP 200; `/openapi.yaml` 200; `/api/sandbox/*` returns a structured `NOT_AUTHENTICATED` 401 until **Sign in**, by design. Static SPA + one serverless function; no login wall in front of judges. |
| 2a | "Why your use case is a strong fit for WebMCP" | ✅ | README § *Why this is specifically a strong WebMCP use case*; Devpost description § 2 below. |
| 2b | "How it creates a better user experience" | ✅ | README § *What humans and agents can do together* (shared environment / fields / transcript / locks). |
| 2c | "What people and agents can do together that was difficult or impossible before" | ✅ | README § *What humans and agents can do together*, closing paragraph. |
| 2d | "Briefly explain how you implemented WebMCP" | ✅ | README § *How WebMCP is implemented*; [docs/architecture.md](docs/architecture.md). |
| 3 | Public repo with all source, assets, functional instructions | ✅ | <https://github.com/alliecatowo/openapi-web-mcp> — plugin, demo app, demo API, specs, tests, CI. README § *Run it locally*. |
| 3b | Open source license file, detectable at top of repo page | ✅ | `LICENSE` holds the full Apache-2.0 text; `NOTICE` attributes Swagger UI. GitHub reports `spdx_id: "Apache-2.0"`, `license.name: "Apache License 2.0"` — the sidebar reads "Apache-2.0". Verified 2026-09-02 via `api.github.com/repos/alliecatowo/openapi-web-mcp`. (It previously carried only the licence *header stub* and was detected as `NOASSERTION`; fixed in `1ec4944`.) |
| 4a | Video < 3:00 | ⬜ | DEMO.md targets 2:50; script is 435 words with a documented trim path to 2:37. |
| 4b | Video shows the project functioning, with audio covering what was built | ⬜ | DEMO.md storyboard + full narration; narration explicitly covers what was built, the problem, why WebMCP matters, and how it was implemented. |
| 4c | Video public on YouTube | ⬜ | DEMO.md § YouTube (title, description, visibility = Public). |
| 4d | No third-party trademarks / unlicensed music | ✅ (by design) | No music. Fictional "Waypoint Projects API". Swagger UI is Apache-2.0 and used unmodified; attributed in NOTICE. |
| 5 | English | ✅ | All materials in English. |
| 6 | Newly created during the submission period | ✅ | Entire git history is 2 Sep 2026, inside the 25 Aug – 3 Sep window. No pre-existing project. |
| — | Tests green | ✅ | 107 unit tests (vitest) and 33 Playwright e2e tests pass; CI runs typecheck + test + build + e2e on every push. |

⬜ = requires a human action before submitting; tracked in CHECKLIST.md.

---

## 3. Devpost form values

Paste these verbatim.

**Project name**
```
Swagger UI WebMCP
```

**Tagline** (Devpost "elevator pitch", 200 char max)
```
If you can Try it out, your agent can too — a Swagger UI plugin that turns any OpenAPI docs page into a live agent interface, using the environment and login you already have open.
```
*(177 characters.)*

**Live project URL**
```
https://openapi-web-mcp.vercel.app
```

**Repository URL**
```
https://github.com/alliecatowo/openapi-web-mcp
```

**YouTube video URL**
```
TODO — paste after upload
```

**Built with** (Devpost tags)
```
webmcp, openapi, swagger-ui, typescript, vite, vitest, playwright, vercel, javascript, json-schema
```

**Final submitted commit SHA**
```
TODO — record `git rev-parse HEAD` at the moment of submission
```
*(Latest at time of writing: `d6e771762d9d1a5ae66278cad48af80f7c811c6f`.)*

---

## 4. Paste-ready Devpost description

> ### If you can Try it out, your agent can too.
>
> **Swagger UI WebMCP is a reusable Swagger UI plugin that turns any OpenAPI documentation page into a live, session-scoped agent interface — and splits the decision of what that agent may touch among the four parties who each know something different.** The agent calls the API through the exact environment, login, and request pipeline the developer already has open in the page. No AI SDK. No MCP server to install. No bearer token copied anywhere.
>
> **Live demo:** https://openapi-web-mcp.vercel.app · **Source (Apache-2.0):** https://github.com/alliecatowo/openapi-web-mcp
>
> ---
>
> #### The problem
>
> A developer working against an internal or partner API already has a browser tab where everything is correct: signed in, *staging* selected in the server dropdown, the right key pasted into Swagger UI's Authorize dialog, and the corporate proxy, CORS rules, and session cookies all working.
>
> To let an agent help with that same API, the entire environment has to be rebuilt somewhere else — install or write an MCP server, re-describe the endpoints, copy a bearer token out of the browser into a config file, and keep the two in sync forever. Most people don't. So the agent is useful for writing code *about* the API and useless for actually *driving* it.
>
> Underneath that is a second problem nobody has a good answer for: once the connector exists, **who decides what the agent may touch?** Today it is whoever wrote it, once, months ago, holding standing credentials.
>
> #### The idea: authority splits four ways, and only ever narrows
>
> Four parties each hold information the others don't, so each gets exactly the instrument they have the information for:
>
> - **The API publisher** knows which endpoints are dangerous → `x-webmcp` in the OpenAPI document, travelling with the contract, reviewed and versioned.
> - **The page owner** knows what this deployment is for → `webMcp.exposure` and `policyResolver`.
> - **The person at the page** knows what is happening right now → per-operation session locks, this tab only, gone on reload.
> - **The WebMCP client** knows what to ask a human → MCP annotations and structured errors.
>
> The rule that makes them compose rather than conflict: **every source may only tighten.** All of them reduce to a level on the lattice `hidden < read < write`, the tightest wins, and `hidden` survives every setting, because refusing exposure is never a privilege escalation.
>
> That yields properties rather than settings. An OpenAPI document is untrusted input, so by default it can hide operations or hold writes at read but cannot talk a `read` page into writes. A page-supplied resolver may only take capability away — even for authorization gates, where an incomparable gate keeps the document's, so a resolver can never loosen by naming a different scheme. A page `exposure: "hidden"` is an absolute kill switch no annotation overrides. Malformed or hostile annotation values are dropped rather than guessed at, so a bad annotation degrades to "no annotation" instead of to a weaker policy.
>
> The party that does not get a vote is the agent. Session locks are module state the tools never touch: no input schema carries a lock field, no tool reads or writes one. The agent observes only the effect — `agentPolicy` reports `locked: true` so it can explain a `LOCKED` denial instead of retrying.
>
> #### Why the documentation page is the right place
>
> WebMCP's defining property is that the page is the integration: capability lives in the tab, scoped to the session, and dies with it. Almost nothing fits that shape better than API docs.
>
> - **The contract already exists and is machine-readable.** An OpenAPI document is the highest-quality tool-definition source that will ever be lying around. Tools are derived, not hand-written — load a different document and the whole capability set is re-derived with zero code change.
> - **The ambient state is the entire point.** Selected server, authorized schemes, cookies, `withCredentials`, interceptors — the things that are painful to replicate in a headless connector are simply already true in the tab, read live at call time. Flip the dropdown from Sandbox to Production and the agent's next call follows. Nothing re-registers.
> - **Ephemerality is a feature.** Nobody wants a persistent connector holding standing write access to production.
> - **It is where the human already is.** Governance you have to leave the task to exercise is governance nobody exercises. The lock is next to the endpoint.
> - **It generalizes.** This is a plugin, not one app made agent-friendly. Every Swagger UI page that adds one import becomes an agent surface for whatever API it documents.
>
> A conventional MCP server is still right for persistent, headless automation. This is for the documentation page itself as the integration context.
>
> #### What people and agents can do together
>
> The person and the agent share one session, one set of fields, and one visible transcript — not two parallel worlds.
>
> - **Shared environment.** The human signs in, picks Sandbox, authorizes a scheme in Swagger's own dialog. The agent inherits all of it, live.
> - **Shared fields.** The person types `checkout` into the `q` box of Try it out and stops. The agent reads that value and finishes the call. Or the agent fills the inputs and the person reviews them before anything is submitted. Explicit agent arguments win; anything omitted comes from what is on screen. Either side can start; the other completes.
> - **Shared transcript.** Every agent execution renders in Swagger UI's own response panel, where the person already looks for their own results. There is no separate agent console.
> - **Live narrowing.** An access control next to Try-it-out on every operation: Full access, View only, Read only, Hidden. You do not need to own the API server to keep an agent out of an endpoint for the next ten minutes.
> - **Receipts both ways.** The demo API logs whether each write arrived via the agent pipeline or by hand: `GET /audit-events` shows `webmcp-agent` versus `swagger-ui`.
>
> The thing that was hard before: letting an agent act on a real, authenticated, environment-specific API without provisioning it any standing credentials or infrastructure — and being able to see, constrain, and revoke that in the same place you were already working.
>
> #### How WebMCP was implemented
>
> One import into an existing Swagger UI config is the whole integration:
>
> ```ts
> SwaggerUI({
>   dom_id: "#swagger-ui",
>   url: "/openapi.yaml",
>   plugins: [SwaggerUIWebMCP],
>   webMcp: { exposure: "write" }
> });
> ```
>
> **Registration.** When the browser provides `document.modelContext`, the plugin enumerates operations from Swagger UI's own resolved spec, resolves local `$ref`s, converts parameters and request bodies into JSON Schema tool inputs, computes a generation hash, and registers tools. The hash covers the raw operation, so changing an `x-webmcp` annotation changes the tool's name — policy changes are visible in tool identity. When `modelContext` is absent the plugin does nothing at all; there is no production polyfill.
>
> Two layers are registered: five stable core tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus one direct `api.<safe-name>.<generation-hash>` tool per exposed operation, capped at 64 with graceful fallback to discovery plus generic execution for larger documents.
>
> **Execution, and the tax it costs.** Tools can never name a URL. A call resolves against the currently selected Swagger server and then, deliberately, does *not* build its own fetch client: arguments are written into the Swagger store, `specActions.execute` runs the request through the page's configured interceptors, credentials, and selected server, and the result is read back out of the store. That is why environment and login are inherited rather than duplicated, and why agent calls render in the normal response panels.
>
> Driving someone else's store has real costs, and paying them is what makes the claim work. Executions are serialized through a promise queue, because Swagger's store holds one form per operation and concurrent calls — or an agent call racing the human's typing — would clobber each other. Responses are observed rather than awaited, because Swagger's action wrappers swallow exceptions and return `undefined`. Both the path item and the operation are resolved, because path-item-level parameters merge into the operation only when the path item is resolved; without that Swagger sends a literal `{placeholder}` in the URL. Arrays are handed over unflattened so Swagger applies each parameter's own style/explode rules.
>
> **Authorization.** Direct tools, the generic executor, and the batch executor all funnel through one `authorize` function evaluated at call time against live state, so there is exactly one place exposure is enforced. Nothing is cached: authorizing in Swagger UI, or changing a lock, flips the next call with no re-registration.
>
> **The page never prompts.** Permission UX belongs to the WebMCP client. The page's interface to the client is exactly three things: registration visibility, MCP annotations (`readOnlyHint`, `destructiveHint`, `untrustedContentHint`), and structured errors. An earlier version of this plugin shipped a full in-page consent system — shadow-DOM console, consent cards showing argument JSON, allow-once/allow-always — and it was deleted, because a page that prompts is a second policy engine competing with the client's, and the page's has less context.
>
> **Safety is structural, not promised.** Schema compilation runs an allowlist of 21 structural JSON Schema keywords; `description`, `examples`, `title`, and `externalDocs` are dropped rather than sanitized, and parameter descriptions are *replaced* with generated structural text. Credential-shaped names are excluded at enumeration, so they never enter a schema — which is also why live UI values cannot leak them: there is nothing declared to read back. `$ref` resolution follows local `#/` pointers only; the plugin never makes its own network requests. A property marked `readOnly: true` compiles away entirely. Responses are bounded to ~50 KB, binary bodies described rather than inlined, `AbortSignal` honoured throughout. `openapi_execute_batch` exposure-checks every step before running the first, so a plan containing a forbidden step executes nothing.
>
> #### Try it
>
> Open https://openapi-web-mcp.vercel.app in ChatGPT's in-app browser or Chrome with WebMCP enabled. Click **Sign in**. Then paste this to your agent:
>
> > You have WebMCP tools on this page. Call `openapi_get_context` and tell me which API and environment I'm on. Then list the active projects. Then try to fetch the usage report and tell me exactly why it fails and what I'd have to do. Finally create a project called "Checkout reliability", add a task to it, and read `GET /audit-events` to show me which writes came from an agent.
>
> Then, by hand: authorize `bearerAuth` with `waypoint-demo-bearer` and re-ask for the usage report (now 200); switch the server dropdown to Production and ask again (different data, same tools); set an operation to **Read only** and watch the agent get a structured `LOCKED`; ask it to charge the account $50 and watch `POST /billing/charges` not exist for it at all, while you run it yourself.
>
> #### Built with
>
> TypeScript, Vite, Swagger UI 5.32.14 (unmodified, pinned), Vitest, Playwright, Vercel. Apache-2.0. ~2,100 lines of plugin, 107 unit tests and 33 end-to-end tests, run in CI on every push.

## 5. Testing instructions for judges

Also in README § *Test the WebMCP behaviour*.

**Hosted, in a WebMCP-capable browser:**

1. Open <https://openapi-web-mcp.vercel.app>.
2. Click **Sign in** (cookie session, no password). Header reads `Signed in as dev@waypoint.local`.
3. Optionally run `POST /admin/reset-demo` from Try it out for clean seed data.
4. Confirm the tool panel shows the five core tools plus `api.<name>.<hash>` entries. The hash changes every load — discover names via `openapi_search_operations` → `directTool`; never hardcode one.
5. Run the recommended prompt above, then the by-hand variations.
6. `?maxTools=5` on the URL forces the large-document fallback.

**Locally:** Node 22+, then `npm install && npm run dev` → <http://127.0.0.1:4173>. The dev server serves the demo API in-process through the same router module the deployed function uses, so hosted and local cannot diverge.

**Without a WebMCP browser:** `npm run test:e2e` drives the real page through a test-only `modelContext` shim and asserts the capability set, annotations, hidden/held operations, all three `requiresAuth` gates plus revocation, locks, shared fields, batch atomicity, server switching, and audit fingerprinting in both directions.

A flow-by-flow external verification protocol is in [CODEX_DRIVER.md](CODEX_DRIVER.md).

### Credentials

Nothing real is protected by these; they are printed on the demo page.

| Purpose | Value |
|---|---|
| Demo sign-in | None — click **Sign in**, no password |
| `bearerAuth` (HTTP bearer; gates the usage report) | `waypoint-demo-bearer` |
| `waypointKey` (header `X-Waypoint-Key`; gates export creation) | `waypoint-demo-key` |
| `waypointQueryKey` (query `key`; gates export status) | `waypoint-demo-query-key` |

---

## 6. Evidence against the four judging criteria

### WebMCP Leverage
*"How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation?"*

**Tools are compiled, not written.** `openapi/` does local `$ref` resolution with hop limits and cycle breaking, OpenAPI-parameter-and-requestBody → JSON Schema conversion with a depth cap, path-item parameter inheritance with operation-level override, safe tool-name derivation, and a per-document generation hash. Load a different document and the entire capability set is rebuilt with no code change — demonstrable live via the page's document switcher and the "paste any OpenAPI URL" box.

**Two registration layers with a deliberate degradation story.** Five stable core tools are always present; per-operation direct tools are capped at 64, and past the cap the agent keeps full capability through discovery plus generic execution. `?maxTools=5` on the demo URL shows it.

**Honest MCP annotations.** `readOnlyHint` only on GET/HEAD/OPTIONS, `destructiveHint` from the publisher's `destructive` flag and unconditionally on the batch tool, `untrustedContentHint` wherever spec or API content flows outward.

**SEE vs CALL modelled as three genuinely distinct states**, evaluated against live client state at call time:
- *Hidden* — absent from search, inspection, execution, and registration; a lookup returns `OPERATION_NOT_FOUND`, indistinguishable from a typo, so the agent has no evidence it exists.
- *Held* — a write under a `read` level: still discoverable, `callable: false`, so the agent can explain why it cannot proceed rather than retrying.
- *Gated* — `requiresAuth` unsatisfied: registered, listed, annotated with the schemes it needs, refused with `AUTH_REQUIRED` until a human authorizes in Swagger UI's normal dialog. The next call then succeeds with no re-registration.

**The integration is deep, and the depth is where the effort shows.** The plugin refuses to build its own HTTP client and instead drives Swagger UI's own store and executor — which is the only way to inherit environment, auth, interceptors and response rendering, and which costs five non-obvious things that are all in the code:

1. A promise queue serializing every execution, because Swagger's store holds one form per operation — concurrent agent calls, or an agent call racing the human's typing, would clobber each other.
2. Completion detected by watching for the Immutable response record to be replaced (`current !== previous`), because Swagger's action wrappers swallow exceptions and return `undefined`.
3. Resolving both `paths/{path}` and `paths/{path}/{method}`, because path-item-level parameters merge into the operation only when the path item is resolved; without it Swagger sends a literal `{placeholder}` in the URL.
4. Aborting the previous generation *before* registering the next, because unchanged operations keep their tool names across generations — aborting afterwards deletes the new tools through those shared names, silently dropping everything that did not change on every spec edit.
5. The session-lock store as a module-level singleton, because Swagger UI evaluates plugin functions more than once while wiring, and the rendered control and the tool gate had silently diverged onto two different maps.

**Deliberate boundaries the spec invites but we refused:** no page-side consent prompts, no arbitrary-URL tool, no production polyfill, no external `$ref` fetching (the plugin never makes its own network requests).

**Verification:** 107 unit tests and 33 Playwright e2e tests, the latter driving the real page through a test-only `modelContext` shim — including an explicit test that no tool input anywhere can set a lock. CI runs typecheck, unit, build, and e2e on every push.

### Execution
*"…a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept."*

- Deployed and live at <https://openapi-web-mcp.vercel.app>; also runs locally with `npm install && npm run dev` and nothing else.
- Packaged as a **reusable plugin**, not a demo: peer-ranged against `swagger-ui >=5.32.0 <5.33.0`, seven documented config options, Apache-2.0, installable in three lines. Config is re-read on every use rather than captured at construction, because Swagger UI has not finished merging user configuration when a plugin's `afterLoad` runs — so a publisher can also change exposure at runtime.
- The demo API is a real, stateful, 28-operation API exercising every HTTP method, path/query/header params, repeated array query params, cursor pagination, `If-Match` 409 concurrency, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload deliberately unsupported as a direct tool, two hidden operations, a held write, three `requiresAuth` gates across three scheme types, and deliberate 401/404/422 paths — with separate Sandbox and Production stores.
- One router module is shared by the Vite dev server and the Vercel function, so local and hosted demos cannot drift. (Three divergent copies existed earlier; consolidating them is recorded as a decision.)
- Documentation is complete and layered: README for judges, `docs/architecture.md`, `docs/webmcp-tools.md` (full tool reference), `docs/DECISIONS.md` (design log including reversals), and `CODEX_DRIVER.md` — a flow-by-flow protocol written for an *external* agent to verify the submission from the behaviour rather than the source.

### Potential Impact
*"…a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem."*

- **Specific audience:** developers, QA and support engineers, and solutions/partner-integration teams who work inside OpenAPI documentation pages, plus the API publishers who host them.
- **Specific problem, part one:** the environment is already correct in the tab and has to be rebuilt elsewhere for an agent to use it — including copying a live bearer token into a config file, which is the thing everyone does and nobody should.
- **Specific problem, part two:** once a connector exists, nobody has a good answer for who decides what it may touch. The current answer is standing credentials configured once, months ago.
- **The solution addresses both directly.** Nothing is copied, because the agent executes through the page's own pipeline against the page's own selected server with the page's own auth; switching environments is a dropdown, not a reconfiguration. And revocation is a select box next to the endpoint, effective on the next call, on a server the person does not need to own.
- **Governance is real, not decorative.** `x-webmcp` gives the API team a place to say "agents must never call this" that travels with the contract and is reviewed and versioned with it. Session locks give the person at the page a way to constrain an agent *for an API server they do not control* — the case no publisher annotation can ever cover.
- **Leverage:** the value multiplies per adopting publisher, not per user. One import on a Swagger UI page makes the whole API it documents agent-usable. There are a very large number of such pages, and they are disproportionately the internal and partner APIs where standing credentials are least acceptable.

### Creativity & Ambition
*"How creative and novel is the concept and does the project differ from existing concepts?"*

**The inversion.** Instead of writing an MCP server *for* an API, the API's own documentation page *becomes* the connector — and the tools are derived from the artifact that was already sitting there.

**The four-party authority model** is the substantive contribution, and it is a position, not a feature list: publisher, page owner, person, and client each hold exactly the decision they have information for, composed on a lattice where every source can only tighten and `hidden` survives everything. `tighterGate()` even resolves *incomparable* authorization gates by keeping the document's, so a page resolver can never loosen by naming a different scheme. That is an algebraic property, not a settings screen.

**`x-webmcp`** puts agent-authorization vocabulary in the OpenAPI document, next to the endpoint, written by the people who actually know which endpoints are dangerous — and built as a ratchet rather than a switch, because an OpenAPI document is untrusted input.

**Session locks** answer a question most agent integrations skip entirely: what does the *person sitting there* get to decide, right now, about an API server they do not own? With honest constraints: locks only tighten, no tool can see or set them, and they never limit the human.

**Shared Try-it-out fields** treat the form as one collaborative surface rather than giving the agent a parallel input path. Explicit arguments win, omissions fall back to what is on screen, and the merged set renders in Swagger's own panels.

**The strongest evidence of ambition is what was deleted.** `docs/DECISIONS.md` records a full in-page consent system that was designed, argued for, built, and then removed: a shadow-DOM Agent Console, consent cards showing the actual argument JSON, allow-once/allow-always session grants, and single-approval batching. The argument for it was good — it demolished `window.confirm` on three specific counts. It was removed anyway, on the realization that a page which prompts is a second policy engine competing with the client's, and the page's has less context. The log then *partially reverses that reversal* for session locks, on a distinction sharp enough to be worth stating: the client's gating answers "should I do this?", while a lock answers "what may this page expose right now?" — different questions, different owners.

**And three refusals to overclaim, all in the repo rather than only in the pitch:** the batch tool is kept with the exact condition written down under which it should instead be deleted; the audit fingerprint is implemented and then explicitly documented as forgeable and "not an identity proof"; and cookie-session gating is declared out of scope on the reasoning that gating on state Swagger cannot see would fail closed forever.

## 7. Provenance

Built from scratch for the OpenAI WebMCP Challenge during the submission period (25 Aug – 3 Sep 2026). No pre-existing project: the repository's entire git history falls inside the window, and the plugin, demo API, demo document, tests, and documentation were all written for this challenge. Swagger UI is consumed as an unmodified pinned dependency (5.32.14) under Apache-2.0 and attributed in `NOTICE`; there is no fork.

The requirement about pre-existing projects therefore does not apply — nothing here predates the submission period.

---

## 8. Related documents

| File | Purpose |
|---|---|
| [README.md](README.md) | Judge-facing landing page. Self-contained; a judge should never need this file. |
| [DEMO.md](DEMO.md) | Video production playbook. |
| [CHECKLIST.md](CHECKLIST.md) | Outstanding manual actions only. |
| [CODEX_DRIVER.md](CODEX_DRIVER.md) | External agent verification protocol. |
| [docs/architecture.md](docs/architecture.md) | Module boundaries and request path. |
| [docs/webmcp-tools.md](docs/webmcp-tools.md) | Full tool and `x-webmcp` reference. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Design decision log. |
| [docs/BUILD_CONTRACT.md](docs/BUILD_CONTRACT.md) | Vendored implementation contract. |
