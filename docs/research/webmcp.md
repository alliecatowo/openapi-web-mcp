# WebMCP verification

The current WebMCP draft uses secure-context `document.modelContext`, imperative `registerTool()`, and an AbortSignal in registration/execution options. Registration returns a Promise and aborting the registration signal unregisters the tool; `toolchange` signals capability-set changes. There is no production polyfill in this project. These assumptions match the current WebMCP draft and the current WebMCP type/testing references consulted on 2026-09-01.
