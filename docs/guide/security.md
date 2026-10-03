# Security and limitations

The safety properties are structural — enforced by what the code can express, not by promises:

- **Untrusted prose never reaches a model as metadata.** Schema compilation runs an *allowlist* of 21 structural JSON Schema keywords; `description`, `examples`, `title`, and `externalDocs` are dropped rather than sanitized. Parameter descriptions are *replaced* with a generated `path parameter "id".`-style string. Tool descriptions are assembled from method, path, and where execution happens. Results carry `untrustedContentHint`.
- **Credential-shaped names are excluded at enumeration**, in both parameters and request bodies, at any nesting depth, so they never enter a schema at all — which is also why `liveValues` cannot leak them: there is nothing declared to read back. Response headers are redacted, and `openapi_get_context` reports scheme *names and types* only. This exclusion was reviewed and two real gaps in it were found and fixed with regression tests: **[docs/security-notes.md](/security-notes)**.
- **The plugin never makes its own network requests.** `$ref` resolution follows local `#/` pointers only; external references are deliberately left unresolved. No tool can name a URL — every call resolves against the currently selected Swagger server, and normal CORS and browser permissions still apply.
- **Server-owned fields are never asked of the caller**: a schema property marked `readOnly: true` compiles away entirely.
- Response bodies are bounded to ~50 KB; binary content is reported by type and size rather than inlined; `AbortSignal` is honoured throughout, including between batch steps.
- Write methods are never marked read-only. Binary and multipart request bodies are not exposed as direct tools in v1.
- Cookie-based sessions are invisible to `requiresAuth` — Swagger's live auth state only reflects schemes it applies itself (HTTP, API keys) — so session-gated endpoints surface API 401s rather than `AUTH_REQUIRED`. Gating on them would fail closed forever.
- Session locks are in-memory page state for this session only; a reload resets to the document.
- **The audit fingerprint distinguishes pipeline paths, not identities.** The plugin only reports which operation it is executing; the demo *page* tags the request. Any client could send the same header. It is an audit hint, and must never be described as proof.
- There is no production WebMCP polyfill. Tests drive a test-only `modelContext` shim.

Details of one review of the credential exclusion path: [Security notes](/security-notes).
