import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRequest, type ApiRequest } from '../../api/_waypoint/router.js';

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('json')) {
        try {
          return resolve(JSON.parse(raw));
        } catch {
          return resolve(undefined);
        }
      }
      if (contentType.includes('x-www-form-urlencoded')) {
        return resolve(Object.fromEntries(new URLSearchParams(raw)));
      }
      resolve(raw);
    });
    req.on('error', () => resolve(undefined));
  });
}

/**
 * Serves the demo API in `npm run dev` through the exact router the deployed
 * Vercel function uses, so local and hosted demos cannot diverge.
 */
const waypointApi: Plugin = {
  name: 'waypoint-demo-api',
  configureServer(server) {
    server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next();

      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
      }

      const request: ApiRequest = {
        method: req.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, '') || '/',
        query: url.searchParams,
        headers,
        body: await readBody(req)
      };

      const result = handleRequest(request);
      for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = result.status;
      if (result.body === undefined) return res.end();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result.body));
    });
  }
};

/**
 * Writes a copy of the demo document with every `x-webmcp` block removed.
 *
 * The demo can then load the same API twice — annotated and not — to show what
 * the plugin does with an ordinary third-party spec that knows nothing about
 * WebMCP. Deriving it at build time keeps the two from drifting apart.
 */
const deriveUnannotatedSpec: Plugin = {
  name: 'waypoint-unannotated-spec',
  buildStart() {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(dir, 'public/openapi.yaml'), 'utf8').split('\n');
    const output: string[] = [];

    for (let index = 0; index < source.length; index += 1) {
      const line = source[index];
      const opening = /^(\s*)x-webmcp:\s*$/.exec(line);
      if (!opening) {
        output.push(line);
        continue;
      }
      // Skip the block's own indented body.
      const indent = opening[1].length;
      while (index + 1 < source.length) {
        const next = source[index + 1];
        const blank = next.trim() === '';
        const deeper = next.search(/\S/) > indent;
        if (!blank && !deeper) break;
        if (blank && !(source[index + 2] ?? '').startsWith(' '.repeat(indent + 1))) break;
        index += 1;
      }
    }

    // Re-title the copy and drop the prose that promises annotations, so the
    // variant does not describe features it no longer has.
    const derived = output
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace('title: Waypoint Projects API', 'title: Waypoint Projects API (no x-webmcp)')
      .replace(
        /  description: \|\n(?:    .*\n)+/,
        '  description: The same API published without any WebMCP annotations, as an ordinary OpenAPI document.\n'
      );

    fs.writeFileSync(path.join(dir, 'public/openapi-unannotated.yaml'), derived);
  }
};

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [deriveUnannotatedSpec, waypointApi],
  resolve: {
    alias: {
      react: path.resolve(root, '../../node_modules/react/index.js'),
      'react-dom': path.resolve(root, '../../node_modules/react-dom/index.js')
    }
  },
  server: { port: 4173 },
  build: { outDir: 'dist' }
});
