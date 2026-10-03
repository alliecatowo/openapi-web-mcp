import { defineConfig } from "vitepress";

// GitHub Pages serves project sites under /<repo>/. Set DOCS_BASE=/ for a custom domain.
export default defineConfig({
  title: "Swagger UI WebMCP",
  description: "Swagger UI plugin that exposes any OpenAPI spec as WebMCP tools.",
  base: process.env.DOCS_BASE ?? "/openapi-web-mcp/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Tools", link: "/webmcp-tools" },
      { text: "Live demo", link: "https://openapi-web-mcp.vercel.app" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "The x-webmcp extension", link: "/guide/x-webmcp" },
          { text: "Who decides what an agent may touch", link: "/guide/policy" },
          { text: "How it works", link: "/guide/how-it-works" },
          { text: "Live demo", link: "/guide/demo" },
          { text: "Security and limitations", link: "/guide/security" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "WebMCP tools", link: "/webmcp-tools" },
          { text: "Architecture", link: "/architecture" },
          { text: "Security notes", link: "/security-notes" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/alliecatowo/openapi-web-mcp" }],
    search: { provider: "local" },
  },
});
