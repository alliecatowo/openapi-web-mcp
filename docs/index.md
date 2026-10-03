---
layout: home
hero:
  name: "Swagger UI WebMCP"
  text: "If you can Try it out, your agent can too."
  tagline: A Swagger UI plugin that exposes any OpenAPI spec as WebMCP tools, with an x-webmcp policy lattice deciding what an agent may touch.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Live demo
      link: https://openapi-web-mcp.vercel.app
    - theme: alt
      text: GitHub
      link: https://github.com/alliecatowo/openapi-web-mcp
features:
  - title: The docs page is the integration
    details: Tools are derived from the loaded OpenAPI document and run through Swagger UI's own pipeline, so login and server selection are inherited.
  - title: Every source may only tighten
    details: Publisher x-webmcp, page config, and per-operation session locks compose on a hidden < read < write lattice.
  - title: No MCP server, no AI SDK
    details: One npm package. Tools register on document.modelContext in WebMCP-capable browsers.
---
