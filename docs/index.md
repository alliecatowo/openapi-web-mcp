---
layout: page
title: Swagger UI WebMCP
pageClass: ow-page
sidebar: false
---

<h1>If you can Try it out, your agent can too.</h1>
<p class="ow-lede">A Swagger UI plugin that turns an OpenAPI docs page into a session-scoped tool set for browser agents. The agent calls the API through the login, server and request pipeline you already have open. No MCP server, no AI SDK, no token copied anywhere.</p>
<div class="ow-actions">
  <a class="ow-primary" href="https://openapi-web-mcp.vercel.app">try the live demo</a>
  <a href="./guide/getting-started">get started</a>
  <a href="https://github.com/alliecatowo/openapi-web-mcp">github</a>
</div>

```sh
npm install swagger-ui-webmcp
```

Published on npm as [`swagger-ui-webmcp`](https://www.npmjs.com/package/swagger-ui-webmcp). Peers: `swagger-ui >=5.32.0 <5.34.0` and `react >=18 <20`. Add it as a Swagger UI plugin:

```ts
import SwaggerUI from "swagger-ui";
import SwaggerUIWebMCP from "swagger-ui-webmcp";
import "swagger-ui/dist/swagger-ui.css";

SwaggerUI({
  dom_id: "#swagger-ui",
  url: "/openapi.yaml",
  plugins: [SwaggerUIWebMCP],
  webMcp: { exposure: "write" },
});
```

The plugin registers tools on `document.modelContext` when the browser provides it, and registers none when it does not. See [Getting started](/guide/getting-started) for the full walkthrough.

## try it now

This is the deployed demo, a stateful Waypoint project-tracker API with Sandbox and Production data stores. No sign-in needed. Agent tools appear only in a browser that implements WebMCP; everything else works for humans either way.

<div class="ow-demo">
<iframe src="https://openapi-web-mcp.vercel.app" title="Swagger UI WebMCP live demo" loading="lazy"></iframe>
</div>
<p class="ow-note">Prefer a full tab? <a href="https://openapi-web-mcp.vercel.app" target="_blank" rel="noopener">Open the demo</a>. The <a href="./guide/demo">demo guide</a> has a prompt to paste into your agent.</p>

## what it looks like

<div class="ow-shots">
<figure><img src="./media/screenshot-1.png" alt="Swagger UI operation panel for DELETE /projects/{projectId} with an Agent access dropdown set to Read only, next to the Try it out button."><figcaption>Per-operation access control, set live next to Try it out.</figcaption></figure>
<figure><img src="./media/screenshot-2.png" alt="Agent chat panel refusing to list projects because the page owner set GET /projects to Hidden for agents."><figcaption>Hidden operations do not exist for the agent, so it refuses.</figcaption></figure>
<figure><img src="./media/screenshot-3.png" alt="Agent chat panel proposing an archive-then-delete plan and pausing for confirmation, next to Swagger UI's response panel."><figcaption>The agent proposes and pauses; results land in Swagger's own panel.</figcaption></figure>
</div>

## what you get

<dl class="ow-facts">
  <div>
  <dt>the page is the integration</dt>
  <dd>Tools are derived from the loaded OpenAPI document and run through Swagger UI's own <code>specActions.execute</code>, so login, selected server and interceptors are inherited.</dd>
  </div>
  <div>
  <dt>four parties, one lattice</dt>
  <dd>API publisher (<code>x-webmcp</code>), page owner, the person at the page, and the WebMCP client each narrow access. Levels are <code>hidden &lt; read &lt; write</code>; the tightest wins.</dd>
  </div>
  <div>
  <dt>live per-operation locks</dt>
  <dd>A dropdown next to Try it out sets Full access, Read only or Hidden for this tab. It resets on reload, and no tool input can change it.</dd>
  </div>
  <div>
  <dt>untrusted specs stay untrusted</dt>
  <dd>A spec can hide or hold operations at read, but cannot talk a read-only page into writes. Malformed annotations are dropped, not guessed at.</dd>
  </div>
  <div>
  <dt>same panel, agent and human</dt>
  <dd>Agent calls render in Swagger's normal response panels, so you can compare what the agent sent with what you would have sent.</dd>
  </div>
  <div>
  <dt>audit hint</dt>
  <dd>The exported <code>agentExecution</code> lets a page's request interceptor tag agent traffic. It is a hint, not an identity proof.</dd>
  </div>
</dl>

## docs

Start with [Getting started](/guide/getting-started), then read [who decides what an agent may touch](/guide/policy), the [x-webmcp extension](/guide/x-webmcp), [security and limitations](/guide/security), and the [tool reference](/webmcp-tools). Source is on [GitHub](https://github.com/alliecatowo/openapi-web-mcp) (Apache-2.0).
