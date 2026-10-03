# Configuration

All options live under the `webMcp` key of the Swagger UI config and are re-read on every use — Swagger UI has not finished merging user configuration when a plugin's `afterLoad` runs, so anything captured at construction time would silently be a default. It also means changes after startup take effect on the next call.

| Option | Type | Default | Effect |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` skips the plugin entirely. |
| `exposure` | `read` \| `write` \| `hidden` | `write` | Page-level default for every operation. `hidden` is an absolute kill switch no annotation can override. |
| `trustSpecAnnotations` | boolean | `false` | `true` makes `x-webmcp` authoritative in both directions instead of tighten-only. Only for publishers who own both page and document. |
| `maxDirectOperationTools` | number | `64` | Above this, no direct tools; discovery and generic execution remain. |
| `maxBatchSteps` | number | `10` | Maximum steps accepted by `openapi_execute_batch`. |
| `operationFilter` | `(op) => boolean` | none | `false` removes an operation from search, inspection, execution, and registration. |
| `policyResolver` | `(op) => Policy \| undefined` | none | Page-supplied per-operation policy. Composes with `x-webmcp`; may only tighten. |
