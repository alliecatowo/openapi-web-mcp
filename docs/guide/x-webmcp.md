# The x-webmcp extension

The API team declares agent policy next to the endpoint it describes, on the document root (as a default) or on any operation:

```yaml
x-webmcp:
  tool: write                     # document-wide default

paths:
  /projects/{projectId}:
    delete:
      x-webmcp: { tool: write, destructive: true }
  /reports/usage:
    get:
      security: [{ bearerAuth: [] }]
      x-webmcp: { tool: read, requiresAuth: bearerAuth }
  /billing/charges:
    post:
      x-webmcp: { tool: hidden }
  /exports:
    post:
      x-webmcp: { tool: write, requiresAuth: waypointKey, costHint: "Each export consumes metered processing minutes billed to the account" }
```

- `tool` — `read`, `write`, or `hidden`. What the operation *is* for agents.
- `requiresAuth` — `true`, a scheme name, or a list (several names mean ANY of them, mirroring OpenAPI `security` alternatives). The operation stays SEE-able but is not CALL-able until Swagger UI's live auth state satisfies it; an early call returns `AUTH_REQUIRED`, and authorizing in the normal dialog makes the same call succeed.
- `destructive` — surfaces as `destructiveHint` so the client can gate the invocation. It never prompts anyone by itself.
- `costHint` — `true`, or a string describing the cost or consequence. Surfaces as `costHint: true` plus a `costNote` string (when given) on the registered tool, so a client can choose to confirm with a human before calling an operation that costs money or has a real-world side effect, the same way `destructiveHint` lets it gate an irreversible one. It never prompts anyone by itself, and it never blocks the call — a publisher who wants the call blocked reaches for `tool: read` or `requiresAuth`, not `costHint`.

There are no consent keys and no legacy aliases; the old vocabulary named prompting behaviour, and keeping aliases would let a copied annotation silently mean something its author never intended.

**Three distinct states.** *Hidden*: absent from search, inspection, execution, and registration — a lookup returns `OPERATION_NOT_FOUND`, indistinguishable from a typo, so the agent has no evidence it exists, while a human can still call it by hand. *Held* (a write under a `read` level): still discoverable, `callable: false`, so the agent can explain why it cannot proceed. *Gated* (`requiresAuth` unsatisfied): visible and correctly annotated with the schemes it needs, refused until a human authorizes.
