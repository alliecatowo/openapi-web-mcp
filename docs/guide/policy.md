# Who decides what an agent may touch

This is the part we think is new. Authority over an agent's reach is split four ways, because four different parties each hold information the others don't:

| Party | Knows | Instrument | Scope |
|---|---|---|---|
| **API publisher** | which endpoints are dangerous | `x-webmcp` in the OpenAPI document | travels with the contract, reviewed and versioned |
| **Page owner** | what this deployment is for | `webMcp.exposure`, `policyResolver` | page configuration |
| **Person at the page** | what is happening *right now* | per-operation session locks | this tab; dies on reload |
| **WebMCP client** | what to ask a human | MCP annotations + structured errors | the agent host |

The rule that makes those compose rather than conflict: **every source may only tighten.** All of them reduce to a level on the lattice `hidden < read < write`, the tightest wins, and `hidden` survives every setting — because refusing exposure is never a privilege escalation.

That gives real properties, not just configuration:

- An OpenAPI document is untrusted input, so by default it can hide operations or hold writes at read, but **cannot talk a `read` page into writes**.
- A page-supplied `policyResolver` is page code, so it may only take capability away — and even for authorization gates, an *incomparable* gate keeps the document's, so a resolver can never loosen by naming a different scheme.
- A page `exposure: "hidden"` is an absolute kill switch no annotation can override, even under `trustSpecAnnotations`.
- Malformed or hostile annotation values are **dropped, not guessed at**, so a bad annotation degrades to "no annotation" rather than to a weaker policy.

Notably, the party that does *not* get a vote is the agent. Session locks are module state the tools never touch: no input schema carries a lock field, no tool reads or writes one. The agent observes only the *effect* — `agentPolicy` reports `locked: true` so it can make sense of a `LOCKED` denial and say so instead of retrying.

## What humans and agents can do together

The person and the agent share **one session, one set of fields, and one visible transcript** — not two parallel worlds.

- **Shared environment.** The human signs in, selects Sandbox, and authorizes a scheme in Swagger UI's own dialog. The agent's calls inherit all of it, live. Flip to Production mid-conversation and the next agent call goes to Production.
- **Shared fields.** The person types `checkout` into the `q` box of Try it out and stops. The agent reads that value (`liveValues`) and finishes the call. Or the agent fills the inputs and the person reviews them in the UI before anything is submitted. Explicit agent arguments win; anything omitted comes from what is on screen. Either side can start; the other completes.
- **Shared transcript.** Every agent execution renders in Swagger UI's own response panel, where the person already looks for their own results. There is no separate agent console.
- **Live narrowing.** Each operation block has an access control next to Try-it-out: **Full access**, **View only** (listed, not executable), **Read only** (reads run, writes denied), **Hidden** (invisible to the agent). You don't need to own the API server to keep an agent out of an endpoint for the next ten minutes. A reload resets everything to what the document declares, and locks never restrict what *you* can do by hand.
- **Receipts in both directions.** The demo API logs whether each write arrived via the agent pipeline or by hand: `GET /audit-events` shows `webmcp-agent` versus `swagger-ui`.

The thing that was hard before: *letting an agent act on a real, authenticated, environment-specific API without provisioning it any standing credentials or infrastructure* — and being able to see, constrain, and revoke that in the same place you were already working.
