/**
 * Vercel serverless entry point for the Waypoint Projects demo API.
 * All routing lives in ./_waypoint/router.ts so the Vite dev server and the
 * deployed function serve byte-identical behaviour.
 */

import { handleRequest, type ApiRequest } from './_waypoint/router.js';

interface NodeLikeRequest {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface NodeLikeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

const headerValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(', ') : value;

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/^\/api/, '') || '/';

  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) headers[name.toLowerCase()] = headerValue(value);

  const request: ApiRequest = {
    method: req.method ?? 'GET',
    path,
    query: url.searchParams,
    headers,
    body: req.body
  };

  const result = handleRequest(request);
  const secure = headers['x-forwarded-proto'] === 'https';

  for (const [name, value] of Object.entries(result.headers ?? {})) {
    // `; Secure` — with the separator. Appending " Secure;" instead folded the
    // flag into the Path attribute (`Path=/ Secure`), which never matches a
    // request path, so the browser silently dropped the session cookie.
    res.setHeader(name, name.toLowerCase() === 'set-cookie' && secure ? `${value}; Secure` : value);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = result.status;

  if (result.body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(result.body));
}
