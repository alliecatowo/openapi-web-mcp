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
> **Swagger UI WebMCP is a reusable Swagger UI plugin that turns any OpenAPI documentation page into a live, session-scoped agent interface.** The agent calls the API through the exact environment, login, and request pipeline the developer already has open in the page. No AI SDK. No MCP server to install. No bearer token copied anywhere.
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
> #### Why this is a strong fit for WebMCP
>
> WebMCP's defining property is that the page is the integration: capability lives in the tab, scoped to the session, and dies with it. Almost nothing fits that shape better than an API documentation page.
>
> - **The contract already exists and is machine-readable.** An OpenAPI document is the highest-quality tool-definition source that will ever be lying around. Tools are derived, not hand-written — load a different document and the whole capability set is re-derived with zero code change.
> - **The ambient state is the entire point.** Selected server, authorized security schemes, cookies, `withCredentials`, request/response interceptors — the things that are painful to replicate in a headless connector are simply already true in the tab. They're read live at call time, so when the human flips the dropdown from Sandbox to Production, the agent's next call follows. Nothing re-registers.
> - **Ephemerality is a feature.** Nobody wants a persistent connector holding standing write access to production. Here, capability exists only while the tab is open, only for the document loaded, and only up to what the human has authorized.
> - **It generalizes.** This isn't one app made agent-friendly; it's a plugin. Every Swagger UI page that adds one import becomes an agent surface for whatever API it documents.
>
> A conventional MCP server is still the right answer for persistent, headless automation. This is for the documentation page itself as the integration context.
>
> #### What people and agents can do together
>
> Built around one idea: the person and the agent share **one session, one set of fields, and one visible transcript** — not two parallel worlds.
>
> - **Shared environment.** The human signs in, picks Sandbox, authorizes a scheme in Swagger's own dialog. The agent inherits all of it, live.
> - **Shared fields.** The person types `checkout` into the `q` box of Try it out and stops. The agent reads that value and finishes the call. Or the agent fills the inputs and the person reviews them before anything is submitted. Explicit agent arguments win; anything omitted comes from what's on screen.
> - **Shared transcript.** Every agent execution renders in Swagger UI's own response panel, where the person already looks for their own results. There is no separate agent console.
> - **Session locks.** Each operation block has a small access control next to Try-it-out: Full access, View only, Read only, Hidden. You don't need to own the API server to keep an agent out of an endpoint for the next ten minutes. Locks only tighten, never widen; no tool can read or set them; a reload resets to what the document declares; and they never restrict what *you* can do by hand.
> - **Publisher-declared policy.** The API team declares per-endpoint agent policy in the OpenAPI document itself, with an `x-webmcp` extension — `read`/`write`/`hidden`, plus `requiresAuth` and `destructive` hints — so the page owner and the API owner each control the half they actually understand.
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
> **Registration.** When the browser provides `document.modelContext`, the plugin enumerates operations from Swagger UI's own resolved spec, resolves `$ref`s, converts parameters and request bodies into JSON Schema tool inputs, computes a stable generation hash of the document, and registers tools. Swapping or reloading the document unregisters the previous generation and registers a new one. When `modelContext` is absent the plugin does nothing at all and Swagger UI is untouched — there is no production polyfill.
>
> Two layers are registered: five stable core tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus one direct `api.<safe-name>.<generation-hash>` tool per exposed operation (capped, with graceful fallback to discovery + generic execution for large documents).
>
> **Execution.** Tools can never name a URL. A call resolves its operation against the *currently selected* Swagger server and goes out through Swagger UI's own request pipeline — same interceptors, same `withCredentials`, same auth application, same response rendering. That is why environment and login are inherited rather than duplicated, and why agent calls appear in the normal response panels.
>
> **Authorization.** Direct tools, the generic executor, and the batch executor all funnel through one authorization function evaluated at call time against live state, so there is exactly one place exposure is enforced. It composes the page's `exposure`, the document's `x-webmcp`, the page's `policyResolver`, and the human's session locks on the lattice `hidden < read < write`, where by default the tightest wins and an untrusted document may only tighten. `requiresAuth` is then checked against Swagger UI's live authorized schemes, producing a structured `AUTH_REQUIRED` rather than a silent failure.
>
> **The page never prompts.** Permission UX belongs to the WebMCP client. The page's interface to the client is registration visibility, MCP annotations (`readOnlyHint`, `destructiveHint`, `untrustedContentHint`), and structured errors.
>
> **Safety.** OpenAPI prose and API responses are untrusted content and never enter privileged generated metadata. Auth values never enter tool inputs or results; credential-shaped parameter and header names are excluded and response headers redacted. Responses are bounded to ~50 KB, binary bodies described rather than inlined, and `AbortSignal` honoured. `openapi_execute_batch` exposure-checks every step before running the first, so a plan containing a forbidden step executes nothing.
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
> TypeScript, Vite, Swagger UI 5.32.14 (unmodified, pinned), Vitest, Playwright, Vercel. Apache-2.0. 107 unit tests and 33 end-to-end tests, run in CI on every push.

---

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

- Tools are **compiled**, not hand-written: `$ref` resolution, OpenAPI-parameter-and-requestBody → JSON Schema conversion, safe-name generation, and a stable per-document generation hash. Load a different document and the whole capability set is rebuilt (`packages/swagger-ui-webmcp/openapi/`).
- Two registration layers with a deliberate degradation story: five stable core tools always present, plus per-operation direct tools capped at 64 — past the cap the agent still has full capability through discovery + generic execution.
- Honest MCP annotations: `readOnlyHint` only on reads, `destructiveHint` from the document's `destructive` flag and on `openapi_execute_batch`, `untrustedContentHint` on results derived from spec prose or API responses.
- **SEE vs CALL** modelled explicitly as three distinct states — hidden (no evidence it exists), held (visible, `callable: false`, so the agent can explain itself), gated (visible, annotated with the schemes it needs, `AUTH_REQUIRED` until a human authorizes) — evaluated against live client state at call time.
- Deliberate boundaries the spec invites but we refused: no page-side consent prompts (permission UX is the client's), no arbitrary-URL tool, no production polyfill.
- `openapi_execute_batch` is transactional in its *checking*: every step is resolved and exposure-checked before the first executes, so a plan containing a forbidden step runs nothing.
- 107 unit + 33 e2e tests, the latter driving the real page through a test-only `modelContext` shim.

### Execution
*"…a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept."*

- Deployed and live at <https://openapi-web-mcp.vercel.app>; also runs locally with `npm install && npm run dev` and nothing else.
- Packaged as a **reusable plugin**, not a demo: peer-ranged against `swagger-ui >=5.32.0 <5.33.0`, seven documented config options, Apache-2.0, installable in three lines.
- The demo API is a real, stateful, 28-operation API exercising every HTTP method, path/query/header params, repeated array query params, cursor pagination, `If-Match` 409 concurrency, an async 202 job with polling, a 207 multi-status bulk update, a multipart upload deliberately unsupported as a direct tool, hidden operations, a held write, three `requiresAuth` gates across three scheme types, and deliberate 401/404/422 paths — with separate Sandbox and Production stores.
- One router module is shared by the Vite dev server and the Vercel function, so local and hosted demos cannot drift.
- CI runs typecheck, unit tests, build, and Playwright e2e on every push. All green.
- Documentation is complete and layered: README for judges, `docs/architecture.md`, `docs/webmcp-tools.md` (full tool reference), `docs/DECISIONS.md`, and `CODEX_DRIVER.md` (external verification protocol).

### Potential Impact
*"…a credible, specific case for solving a real problem for a real audience — and does the solution actually address that problem."*

- **Specific audience:** developers, QA and support engineers, and solutions/partner-integration teams who work inside OpenAPI documentation pages, plus the API publishers who host them.
- **Specific problem:** the environment is already correct in the tab and has to be rebuilt elsewhere for an agent to use it — including copying a live bearer token into a config file, which is the thing everyone does and nobody should.
- **The solution addresses it directly** rather than adjacently: nothing is copied, because the agent executes through the page's own pipeline against the page's own selected server with the page's own auth. Switching environments is a dropdown, not a reconfiguration.
- **Leverage:** the value multiplies per adopting publisher, not per user. One import on a Swagger UI page makes the whole API it documents agent-usable. There are a very large number of such pages.
- **Governance is real, not decorative:** `x-webmcp` gives the API team a place to say "agents must never call this" that travels with the contract, and session locks give the page's user a way to constrain an agent for an API server they don't control.

### Creativity & Ambition
*"How creative and novel is the concept and does the project differ from existing concepts?"*

- The inversion: instead of writing an MCP server *for* an API, the API's own documentation page *becomes* the connector — and the tools are derived from the artifact that was already there.
- **`x-webmcp`** is a genuine design contribution: agent-authorization vocabulary declared in the OpenAPI document, next to the endpoint, by the people who actually know which endpoints are dangerous. Built as a *ratchet* rather than a switch, because an OpenAPI document is untrusted input — a document can hide operations or hold writes at read, but can never loosen the page, unless a publisher who owns both explicitly opts in with `trustSpecAnnotations`. Even then, `tool: hidden` still wins, because refusing exposure is never an escalation.
- **Session locks** answer a question most agent integrations skip: what does the *person sitting there* get to decide, right now, about an API server they don't own — with the honest constraints that locks only tighten, no tool can see or set them, and they never limit the human.
- **Shared Try-it-out fields** treat the form as one collaborative surface rather than giving the agent a parallel input path. Either party can start; the other completes.
- **The audit fingerprint** takes the "was that an agent?" question seriously enough to implement *and* to state its limits: it distinguishes pipeline paths, not identities.
- Deliberate restraint is part of the design: no chat UI, no embedded model, no consent theatre on the page, no Swagger fork.

---

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
