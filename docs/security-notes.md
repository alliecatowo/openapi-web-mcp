# Security notes

Findings from reviewing the credential-name exclusion path in this repository, what was wrong, and what changed. Nothing here is a claim of a completed audit — it is a record of what was actually checked, in one specific area, with the tests that prove it.

## What was checked

The README claims: *"Credential-shaped names are excluded at enumeration, so they never enter a schema at all."* That claim rests entirely on `isSensitiveName()` in [`packages/swagger-ui-webmcp/src/openapi/sanitize.ts`](../packages/swagger-ui-webmcp/src/openapi/sanitize.ts) and on where it gets called. A review of both turned up two real gaps.

### 1. The filter was never applied to request-body properties

`isSensitiveName` was only ever called against parameter names — query, header, and path — in [`openapi/enumerate.ts`](../packages/swagger-ui-webmcp/src/openapi/enumerate.ts). Request bodies are compiled separately, through `compileSchema()` in [`openapi/schema.ts`](../packages/swagger-ui-webmcp/src/openapi/schema.ts), which walks `properties` recursively for structure but never checked a property's name against the filter. A `password` or `apiKey` field inside a JSON request body schema compiled straight into the generated tool's input schema, required list included, at any nesting depth.

**Fix:** `compileSchema` now drops a `properties` entry whenever `isSensitiveName(name)` is true, at every depth, and prunes the same name out of `required` so the schema never asks a caller to supply a field that was just removed. See `packages/swagger-ui-webmcp/src/openapi/schema.ts`.

### 2. The filter itself missed the two motivating examples

While writing a regression test for the fix above, `isSensitiveName('password')` and `isSensitiveName('apiKey')` — the two names used to describe the original gap — both returned `false`, independent of where they were checked. Two separate reasons:

- `password` was never in the `reserved` name set at all. Only `token`, `secret`, and a handful of auth-header names were.
- The "ends in *key*" check was a regex requiring a `-` or `_` immediately before `key` (`/(^|[-_])key$/`), which matches header-style names like `X-API-Key` but not camelCase JSON property names like `apiKey` — and the name was already lowercased before the regex ran, which erases the exact case boundary the regex would have needed to find that separator.

**Fix:** added `password` to the reserved set, and normalize camelCase boundaries (`apiKey` → `api-key`) before lowercasing and checking, so header-style and camelCase spellings of the same name are treated identically. See `packages/swagger-ui-webmcp/src/openapi/sanitize.ts`.

This function backs every credential-shape check in the plugin, not just request bodies — response header redaction (`swagger/responses.ts`), authorized-header redaction (`swagger/auth.ts`), and live Try-it-out field reads (`swagger/fields.ts`) all call it too, so the fix applies uniformly rather than only where the review started.

## How it was found

Code review, not a scanner or a fuzzer: reading `enumerate.ts` and `schema.ts` side by side against the README's claim, then, before touching the fix, writing a test that called `isSensitiveName` directly with the two names the review was motivated by.

## Evidence

Two before/after test suites, both written to fail against the pre-fix code and pass against the fix:

- [`tests/unit/openapi.test.ts`](../packages/swagger-ui-webmcp/tests/unit/openapi.test.ts) — `describe('credential-shaped request body properties are excluded', ...)`: a login operation with `password`, `apiKey`, and a nested `profile.secret` in its request body. Confirms each is dropped from `properties`, dropped from `required`, and does not appear anywhere in the serialized schema — while an ordinary field like `username` survives.
- [`tests/unit/sanitize.test.ts`](../packages/swagger-ui-webmcp/tests/unit/sanitize.test.ts) (new file) — exercises `isSensitiveName` directly: the literal word `password` in several forms, camelCase names ending in `Key`, the previously-covered reserved names (still covered), and a check that ordinary names (`monkey`, `displayName`, `username`, `title`) are not falsely flagged.

Both suites were run against the pre-fix code first and confirmed to fail (`password`/`apiKey` reached the compiled schema; `isSensitiveName('password')` and `isSensitiveName('apiKey')` both returned `false`), then run again after the fix and confirmed to pass. `npm test` — the full suite, unit tests only — went from 107 passing tests before this review to 119 after: 8 tests for this fix plus 4 for the unrelated fix documented below, all passing, nothing else broken. `npm run typecheck` and `npm run build` were also run clean after the change.

## A second, unrelated finding: stale tool-cap metadata

Auditing test coverage for the `maxDirectOperationTools` cap (documented in the README as the `?maxTools=` fallback: very large documents get no direct per-operation tools, only discovery and generic execution) turned up an untested code path, and testing it surfaced a real bug, not just a coverage gap.

`WebMcpRegistry.registrable()` decides whether `search()` and `get()` report a `directTool` name for an operation. It never looked at the cap at all — it checked visibility, support, and blocked status, nothing else. `rebuild()`, separately, registers *zero* direct tools the moment the document's operation count exceeds the cap (an all-or-nothing decision, not per-operation). So once a document crossed the cap, `search()` kept naming `api.<op>.<hash>` tools as if they were directly callable, when `rebuild()` had never registered any of them — an agent told to call one directly would get a not-found response from its own WebMCP client.

**Fix:** `registrable()` now checks the same cap condition `rebuild()` uses, so the two agree. Covered by the new [`tests/unit/tool-cap.test.ts`](../packages/swagger-ui-webmcp/tests/unit/tool-cap.test.ts), which asserts both the previously-untested fallback itself (no `api.*` tools get registered over the cap; they do under it) and the metadata mismatch (`search()`/`get()` no longer claim a `directTool` that was never registered).

## What this is not

This is not a security audit of the plugin. It covers one function and one registry inconsistency, both found by reading the code that was already flagged as suspect, not by a systematic threat model of the whole authorization surface (`gate.ts`, session locks, batch execution). Those paths already have substantial existing test coverage — see `tests/unit/exposure.test.ts`, `tests/unit/locks.test.ts`, and `tests/unit/refs.test.ts` (which specifically covers that external and cyclic `$ref`s are left unresolved rather than fetched or followed forever) — but they were read, not re-derived from scratch, for this pass.
