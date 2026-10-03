# Getting started

## Install

```sh
npm install swagger-ui-webmcp
```

Published on npm as [`swagger-ui-webmcp`](https://www.npmjs.com/package/swagger-ui-webmcp) (latest 0.1.1). Peers: `swagger-ui >=5.32.0 <5.33.0` (tested against 5.32.14) and `react >=18 <20`.

## Use

The plugin registers tools on `document.modelContext` when the browser provides it, and registers no tools when it doesn't. Swagger UI stays fully usable either way, but the plugin's lock-select control is added to each operation even without `document.modelContext`. There is no production polyfill.

```ts
import SwaggerUI from "swagger-ui";
import SwaggerUIWebMCP from "swagger-ui-webmcp";
import "swagger-ui/dist/swagger-ui.css";

SwaggerUI({
  dom_id: "#swagger-ui",
  url: "/openapi.yaml",
  plugins: [SwaggerUIWebMCP],   // ← the whole integration
  webMcp: { exposure: "write" }
});
```

## Run it locally

Node 22+ is recommended.

```bash
git clone https://github.com/alliecatowo/openapi-web-mcp
cd openapi-web-mcp
npm install
npm run dev            # http://127.0.0.1:4173
```

The dev server serves the demo API in-process through the same router the deployed function uses, so no other service is needed.

```bash
npm run typecheck      # tsc -b
npm test
npm run build          # plugin + demo
npm run test:e2e
```

CI runs all four on every push.

## Test the WebMCP behaviour

**In a WebMCP-capable browser**, against the live demo or `http://127.0.0.1:4173`:

1. Sign in, and run `POST /admin/reset-demo` from Try it out so the audit log starts clean.
2. Open your agent's tool panel. You should see exactly five stable tools — `openapi_get_context`, `openapi_search_operations`, `openapi_get_operation`, `openapi_execute_operation`, `openapi_execute_batch` — plus `api.<name>.<hash>` per exposed operation. **The hash differs per load; never hardcode it** — discover names via `openapi_search_operations` → `directTool`.
3. Work through the recommended prompt above, then the by-hand variations (authorize, switch server, lock, hidden endpoint, swap document).
4. Append `?maxTools=5` to the URL to force the large-document fallback: direct tools disappear, discovery plus generic execution remain.

**Without a WebMCP-capable browser**, the same behaviour is covered end-to-end by the Playwright suite, which drives a test-only `modelContext` shim against the real page: `npm run test:e2e`. It asserts the capability set, honest annotations, hidden/held operations, all three `requiresAuth` gates and their revocation, locks (including that no tool input anywhere can set one), shared fields, batch atomicity, server switching, and audit fingerprinting in both directions.

