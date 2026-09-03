# Project instructions

The authoritative implementation specification is:

docs/BUILD_CONTRACT.md

Read it before making architectural decisions. Do not re-ideate the product.

Core rules:

- This is a reusable Swagger UI WebMCP plugin.
- Swagger UI remains useful without WebMCP.
- No AI SDK, model, chat interface, MCP server, or browser secret exposure.
- Pin Swagger UI to the 5.32 minor line used by this repository.
- Reuse the current spec, server, auth, request configuration, interceptors, and browser session.
- Never allow arbitrary URL execution or copy OpenAPI prose into privileged tool metadata.
- Direct operation tools come from the currently loaded OpenAPI spec and use versioned names.
- Test through a test-only modelContext shim.

