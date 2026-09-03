/**
 * Transport-agnostic router for the Waypoint Projects demo API.
 *
 * The same handler backs the Vite dev middleware and the Vercel function, so
 * `npm run dev` and the deployed demo cannot drift apart.
 */

import {
  nextId,
  recordAudit,
  resetStore,
  storeFor,
  type Comment,
  type Environment,
  type ExportJob,
  type Project,
  type Task,
  type Webhook
} from './store.js';

export interface ApiRequest {
  method: string;
  /** Path with the `/api` prefix already removed, e.g. `/sandbox/projects`. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

const SESSION_COOKIE = 'waypoint_session=demo';
const ENVIRONMENTS: Environment[] = ['sandbox', 'production'];
const ACTOR = 'dev@waypoint.local';

/**
 * Demo credentials for the three machine-authorizable schemes in the OpenAPI
 * document (`bearerAuth`, `waypointKey`, `waypointQueryKey`). They are printed
 * on the demo page next to the authorize instructions, so a human can paste
 * them into Swagger UI's authorize dialog. Nothing real is protected by them.
 */
export const DEMO_BEARER_TOKEN = 'waypoint-demo-bearer';
export const DEMO_HEADER_KEY = 'waypoint-demo-key';
export const DEMO_QUERY_KEY = 'waypoint-demo-query-key';

const bearerOk = (req: ApiRequest) => req.headers.authorization === `Bearer ${DEMO_BEARER_TOKEN}`;
const headerKeyOk = (req: ApiRequest) => req.headers['x-waypoint-key'] === DEMO_HEADER_KEY;
const queryKeyOk = (req: ApiRequest) => req.query.get('key') === DEMO_QUERY_KEY;

const schemeFail = (scheme: string, hint: string): ApiResponse =>
  fail(401, 'WAYPOINT_AUTH_REQUIRED', `This endpoint needs ${scheme}. ${hint}`);

const json = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({ status, body, headers });

const fail = (status: number, code: string, message: string, details?: unknown): ApiResponse =>
  json(status, { error: { code, message, ...(details === undefined ? {} : { details }) } });

const signedIn = (req: ApiRequest) => Boolean(req.headers.cookie?.includes(SESSION_COOKIE));

/**
 * Which pipeline served this request, for the audit log. The plugin marks its
 * own invocations (see `agentExecution`): the demo page's request interceptor
 * tags those requests `X-Waypoint-Client: webmcp-agent`, and everything else
 * — a person using Try it out — arrives untagged. The comparison is
 * case-insensitive so a proxy that rewrites header casing cannot silently
 * reclassify traffic. This distinguishes pipeline paths within the demo; it
 * is an audit hint, not an identity proof — any client can send the header.
 */
const sourceOf = (req: ApiRequest) =>
  (req.headers['x-waypoint-client'] ?? '').trim().toLowerCase() === 'webmcp-agent'
    ? ('webmcp-agent' as const)
    : ('swagger-ui' as const);

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

function paginate<T>(rows: T[], query: URLSearchParams, defaultLimit = 20) {
  const rawLimit = Number(query.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.trunc(rawLimit), 100) : defaultLimit;
  const cursor = query.get('cursor');
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const offset = Number.isFinite(start) && start > 0 ? start : 0;
  const page = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? String(offset + limit) : null;
  return { items: page, nextCursor: next, total: rows.length, limit };
}

function requireString(value: unknown, field: string): string | ApiResponse {
  if (typeof value !== 'string' || !value.trim()) {
    return fail(422, 'VALIDATION_FAILED', `Field "${field}" is required and must be a non-empty string.`, { field });
  }
  return value.trim();
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[], fallback?: T): T | ApiResponse {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    return fail(422, 'VALIDATION_FAILED', `Field "${field}" is required.`, { field, allowed });
  }
  if (!allowed.includes(value as T)) {
    return fail(422, 'VALIDATION_FAILED', `Field "${field}" must be one of: ${allowed.join(', ')}.`, { field, allowed });
  }
  return value as T;
}

const isResponse = (value: unknown): value is ApiResponse =>
  typeof value === 'object' && value !== null && 'status' in (value as Record<string, unknown>);

const TASK_STATUSES = ['open', 'in_progress', 'blocked', 'done'] as const;
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
const PROJECT_PRIORITIES = ['low', 'medium', 'high'] as const;

/** Export jobs advance on wall-clock time so an agent can genuinely poll one. */
function refreshJob(job: ExportJob): ExportJob {
  if (job.status === 'complete' || job.status === 'failed') return job;
  const elapsed = Date.now() - Date.parse(job.createdAt);
  if (elapsed < 2000) {
    job.status = 'queued';
    job.progress = 0;
  } else if (elapsed < 8000) {
    job.status = 'running';
    job.progress = Math.min(95, Math.round(((elapsed - 2000) / 6000) * 100));
  } else {
    job.status = 'complete';
    job.progress = 100;
    job.completedAt = new Date().toISOString();
    job.downloadPath = `/exports/${job.id}/download`;
  }
  return job;
}

export function handleRequest(req: ApiRequest): ApiResponse {
  const parts = segments(req.path);
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    return { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' } };
  }

  // --- Unauthenticated routes -------------------------------------------------
  if (parts[0] === 'health') {
    return json(200, { status: 'ok', service: 'waypoint-projects-api', time: new Date().toISOString() });
  }

  if (parts[0] === 'session') {
    if (parts[1] === 'login' && method === 'POST') {
      return { status: 204, headers: { 'Set-Cookie': 'waypoint_session=demo; HttpOnly; SameSite=Lax; Path=/' } };
    }
    if (parts[1] === 'logout' && method === 'POST') {
      return { status: 204, headers: { 'Set-Cookie': 'waypoint_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' } };
    }
    if (parts[1] === 'me' && method === 'GET') {
      if (!signedIn(req)) return fail(401, 'NOT_AUTHENTICATED', 'Sign in to the demo to use this endpoint.');
      return json(200, { id: 'usr_001', email: ACTOR, name: 'Demo Developer' });
    }
    return fail(404, 'NOT_FOUND', 'Unknown session route.');
  }

  // --- Environment-scoped routes ---------------------------------------------
  const environment = parts[0] as Environment;
  if (!ENVIRONMENTS.includes(environment)) {
    return fail(404, 'NOT_FOUND', 'Unknown environment. Use the sandbox or production server.');
  }
  const rest = parts.slice(1);

  // Three operations are gated on machine-authorizable schemes instead of the
  // demo session, so the SEE-vs-CALL story can be shown with Swagger UI's own
  // authorize dialog: the agent sees the tool, calls it, gets AUTH_REQUIRED,
  // the human authorizes, and the same call succeeds. Everything else still
  // needs the session cookie from the page's Sign in button.
  const gatedScheme =
    rest[0] === 'reports' && rest[1] === 'usage' && method === 'GET' ? 'bearer'
    : rest[0] === 'exports' && rest.length === 1 && method === 'POST' ? 'header-key'
    : rest[0] === 'exports' && rest.length === 2 && method === 'GET' ? 'query-key'
    : null;
  if (!gatedScheme && !signedIn(req)) {
    return fail(401, 'NOT_AUTHENTICATED', 'Sign in to the demo to use this endpoint.');
  }

  const store = storeFor(environment);
  const source = sourceOf(req);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const project = (id: string): Project | undefined => store.projects.find((p) => p.id === id || p.key === id);
  const task = (id: string): Task | undefined => store.tasks.find((t) => t.id === id);

  switch (rest[0]) {
    case 'me': {
      if (method !== 'GET') break;
      return json(200, {
        id: 'usr_001',
        email: ACTOR,
        name: 'Demo Developer',
        role: environment === 'production' ? 'engineer' : 'admin',
        environment,
        permissions: environment === 'production' ? ['projects:read', 'tasks:write'] : ['projects:write', 'tasks:write', 'admin:write']
      });
    }

    case 'projects': {
      // /projects
      if (rest.length === 1) {
        if (method === 'GET') {
          const status = req.query.get('status');
          const q = (req.query.get('q') ?? '').toLowerCase();
          const tags = asArray(req.query.getAll('tag'));
          const sort = req.query.get('sort') ?? 'updatedAt';
          let rows = store.projects.filter((p) =>
            (!status || p.status === status) &&
            (!q || `${p.name} ${p.description} ${p.key}`.toLowerCase().includes(q)) &&
            (!tags.length || tags.some((tag) => p.tags.includes(tag)))
          );
          rows = [...rows].sort((a, b) =>
            sort === 'name' ? a.name.localeCompare(b.name)
            : sort === 'createdAt' ? b.createdAt.localeCompare(a.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt)
          );
          const page = paginate(rows, req.query);
          return json(200, {
            projects: page.items.map((p) => ({ ...p, taskCount: store.tasks.filter((t) => t.projectId === p.id).length })),
            pagination: { total: page.total, limit: page.limit, nextCursor: page.nextCursor },
            environment
          });
        }
        if (method === 'POST') {
          const name = requireString(body.name, 'name');
          if (isResponse(name)) return name;
          const priority = requireEnum(body.priority, 'priority', PROJECT_PRIORITIES, 'medium');
          if (isResponse(priority)) return priority;
          const now = new Date().toISOString();
          const created: Project = {
            id: nextId(store, 'prj'),
            key: (typeof body.key === 'string' && body.key ? body.key : name.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, ''),
            name,
            description: typeof body.description === 'string' ? body.description : '',
            status: 'active',
            priority,
            owner: ACTOR,
            tags: asArray(body.tags),
            version: 1,
            createdAt: now,
            updatedAt: now
          };
          store.projects.push(created);
          recordAudit(store, { actor: ACTOR, action: 'project.created', target: created.id, source });
          return json(201, created, { Location: `/api/${environment}/projects/${created.id}` });
        }
        break;
      }

      const found = project(rest[1]);

      // /projects/{projectId}
      if (rest.length === 2) {
        if (!found) return fail(404, 'NOT_FOUND', `No project with id "${rest[1]}" in ${environment}.`);
        if (method === 'GET') {
          return json(200, { ...found, taskCount: store.tasks.filter((t) => t.projectId === found.id).length }, { ETag: `"${found.version}"` });
        }
        if (method === 'PATCH') {
          // Optimistic concurrency: If-Match is optional, but a stale value is a 409.
          const ifMatch = req.headers['if-match'];
          if (ifMatch && ifMatch.replace(/"/g, '') !== String(found.version)) {
            return fail(409, 'VERSION_CONFLICT', `Project has moved on to version ${found.version}. Re-read it and retry.`, { currentVersion: found.version });
          }
          if (body.name !== undefined) {
            const name = requireString(body.name, 'name');
            if (isResponse(name)) return name;
            found.name = name;
          }
          if (body.status !== undefined) {
            const status = requireEnum(body.status, 'status', PROJECT_STATUSES);
            if (isResponse(status)) return status;
            found.status = status;
          }
          if (body.priority !== undefined) {
            const priority = requireEnum(body.priority, 'priority', PROJECT_PRIORITIES);
            if (isResponse(priority)) return priority;
            found.priority = priority;
          }
          if (typeof body.description === 'string') found.description = body.description;
          if (body.tags !== undefined) found.tags = asArray(body.tags);
          found.version += 1;
          found.updatedAt = new Date().toISOString();
          recordAudit(store, { actor: ACTOR, action: 'project.updated', target: found.id, source });
          return json(200, found, { ETag: `"${found.version}"` });
        }
        if (method === 'DELETE') {
          if (found.status !== 'archived') {
            return fail(409, 'PRECONDITION_FAILED', 'Archive the project before deleting it.', { status: found.status });
          }
          store.projects = store.projects.filter((p) => p.id !== found.id);
          store.tasks = store.tasks.filter((t) => t.projectId !== found.id);
          recordAudit(store, { actor: ACTOR, action: 'project.deleted', target: found.id, source });
          return { status: 204 };
        }
        break;
      }

      if (!found) return fail(404, 'NOT_FOUND', `No project with id "${rest[1]}" in ${environment}.`);

      // /projects/{projectId}/archive
      if (rest[2] === 'archive' && rest.length === 3) {
        if (method !== 'POST') break;
        found.status = 'archived';
        found.version += 1;
        found.updatedAt = new Date().toISOString();
        recordAudit(store, { actor: ACTOR, action: 'project.archived', target: found.id, source });
        return json(200, found);
      }

      // /projects/{projectId}/attachments  (multipart — deliberately unsupported as a direct tool)
      if (rest[2] === 'attachments' && rest.length === 3) {
        if (method !== 'POST') break;
        return json(201, {
          id: nextId(store, 'att'),
          projectId: found.id,
          filename: 'upload.bin',
          bytes: 0,
          note: 'Binary bodies are accepted by Swagger UI Try it out but are not exposed as direct WebMCP tools in v1.'
        });
      }

      // /projects/{projectId}/tasks
      if (rest[2] === 'tasks') {
        if (rest.length === 3) {
          if (method === 'GET') {
            const status = req.query.get('status');
            const assignee = req.query.get('assignee');
            const rows = store.tasks.filter((t) =>
              t.projectId === found.id &&
              (!status || t.status === status) &&
              (!assignee || t.assignee === assignee)
            );
            const page = paginate(rows, req.query);
            return json(200, { tasks: page.items, pagination: { total: page.total, limit: page.limit, nextCursor: page.nextCursor } });
          }
          if (method === 'POST') {
            const title = requireString(body.title, 'title');
            if (isResponse(title)) return title;
            const priority = requireEnum(body.priority, 'priority', TASK_PRIORITIES);
            if (isResponse(priority)) return priority;
            const status = requireEnum(body.status, 'status', TASK_STATUSES, 'open');
            if (isResponse(status)) return status;
            const now = new Date().toISOString();
            const created: Task = {
              id: nextId(store, 'tsk'),
              projectId: found.id,
              title,
              description: typeof body.description === 'string' ? body.description : undefined,
              priority,
              status,
              assignee: typeof body.assignee === 'string' ? body.assignee : undefined,
              labels: asArray(body.labels),
              dueDate: typeof body.dueDate === 'string' ? body.dueDate : undefined,
              createdAt: now,
              updatedAt: now
            };
            store.tasks.push(created);
            recordAudit(store, { actor: ACTOR, action: 'task.created', target: created.id, source });
            return json(201, created, { Location: `/api/${environment}/projects/${found.id}/tasks/${created.id}` });
          }
          break;
        }

        // /projects/{projectId}/tasks/{taskId}
        if (rest.length === 4) {
          const target = task(rest[3]);
          if (!target || target.projectId !== found.id) {
            return fail(404, 'NOT_FOUND', `No task with id "${rest[3]}" in project ${found.id}.`);
          }
          if (method === 'GET') return json(200, target);
          if (method === 'PATCH') {
            if (body.title !== undefined) {
              const title = requireString(body.title, 'title');
              if (isResponse(title)) return title;
              target.title = title;
            }
            if (body.status !== undefined) {
              const status = requireEnum(body.status, 'status', TASK_STATUSES);
              if (isResponse(status)) return status;
              target.status = status;
            }
            if (body.priority !== undefined) {
              const priority = requireEnum(body.priority, 'priority', TASK_PRIORITIES);
              if (isResponse(priority)) return priority;
              target.priority = priority;
            }
            if (body.assignee !== undefined) target.assignee = body.assignee === null ? undefined : String(body.assignee);
            if (body.labels !== undefined) target.labels = asArray(body.labels);
            if (typeof body.dueDate === 'string') target.dueDate = body.dueDate;
            if (typeof body.description === 'string') target.description = body.description;
            target.updatedAt = new Date().toISOString();
            recordAudit(store, { actor: ACTOR, action: 'task.updated', target: target.id, source });
            return json(200, target);
          }
          if (method === 'DELETE') {
            store.tasks = store.tasks.filter((t) => t.id !== target.id);
            store.comments = store.comments.filter((c) => c.taskId !== target.id);
            recordAudit(store, { actor: ACTOR, action: 'task.deleted', target: target.id, source });
            return { status: 204 };
          }
        }
      }
      break;
    }

    case 'tasks': {
      // /tasks  — cross-project search with an array query parameter and a header parameter
      if (rest.length === 1 && method === 'GET') {
        const labels = asArray(req.query.getAll('label'));
        const status = req.query.get('status');
        const priority = req.query.get('priority');
        const q = (req.query.get('q') ?? '').toLowerCase();
        const rows = store.tasks.filter((t) =>
          (!status || t.status === status) &&
          (!priority || t.priority === priority) &&
          (!labels.length || labels.some((label) => t.labels.includes(label))) &&
          (!q || t.title.toLowerCase().includes(q))
        );
        const page = paginate(rows, req.query);
        return json(200, {
          tasks: page.items,
          pagination: { total: page.total, limit: page.limit, nextCursor: page.nextCursor },
          requestId: req.headers['x-request-id'] ?? null
        });
      }

      // /tasks/bulk — array request body
      if (rest[1] === 'bulk' && rest.length === 2 && method === 'POST') {
        const operations = Array.isArray(body.operations) ? body.operations : null;
        if (!operations) return fail(422, 'VALIDATION_FAILED', 'Field "operations" must be an array.', { field: 'operations' });
        if (operations.length > 25) return fail(422, 'VALIDATION_FAILED', 'At most 25 bulk operations per request.', { limit: 25 });
        const results = operations.map((raw: any, index: number) => {
          const target = task(String(raw?.taskId ?? ''));
          if (!target) return { index, ok: false, error: { code: 'NOT_FOUND', message: `No task "${raw?.taskId}".` } };
          if (raw.status && !TASK_STATUSES.includes(raw.status)) {
            return { index, ok: false, error: { code: 'VALIDATION_FAILED', message: 'Unknown status.' } };
          }
          if (raw.status) target.status = raw.status;
          if (raw.priority && TASK_PRIORITIES.includes(raw.priority)) target.priority = raw.priority;
          if (typeof raw.assignee === 'string') target.assignee = raw.assignee;
          target.updatedAt = new Date().toISOString();
          recordAudit(store, { actor: ACTOR, action: 'task.updated', target: target.id, source });
          return { index, ok: true, task: target };
        });
        const applied = results.filter((r: any) => r.ok).length;
        return json(207, { applied, failed: results.length - applied, results });
      }

      // /tasks/{taskId}/comments
      if (rest[2] === 'comments' && rest.length === 3) {
        const target = task(rest[1]);
        if (!target) return fail(404, 'NOT_FOUND', `No task with id "${rest[1]}".`);
        if (method === 'GET') {
          const rows = store.comments.filter((c) => c.taskId === target.id);
          return json(200, { comments: rows, total: rows.length });
        }
        if (method === 'POST') {
          const text = requireString(body.body, 'body');
          if (isResponse(text)) return text;
          const created: Comment = {
            id: nextId(store, 'cmt'),
            taskId: target.id,
            author: ACTOR,
            body: text,
            createdAt: new Date().toISOString()
          };
          store.comments.push(created);
          recordAudit(store, { actor: ACTOR, action: 'comment.created', target: created.id, source });
          return json(201, created);
        }
      }
      break;
    }

    case 'audit-events': {
      if (method !== 'GET' || rest.length !== 1) break;
      const action = req.query.get('action');
      const rows = store.audit.filter((e) => !action || e.action === action);
      const page = paginate(rows, req.query, 10);
      return json(200, { events: page.items, pagination: { total: page.total, limit: page.limit, nextCursor: page.nextCursor } });
    }

    case 'reports': {
      if (rest[1] !== 'usage' || method !== 'GET') break;
      if (!bearerOk(req)) {
        return schemeFail('bearerAuth', 'Authorize bearerAuth in Swagger UI with the demo bearer token.');
      }
      const days = Math.min(Math.max(Number(req.query.get('days')) || 14, 1), 90);
      const series = Array.from({ length: days }, (_, index) => ({
        date: new Date(Date.now() - (days - index - 1) * 86_400_000).toISOString().slice(0, 10),
        requests: 1200 + ((index * 37) % 400),
        errors: (index * 7) % 19,
        p95Ms: 180 + ((index * 13) % 90)
      }));
      return json(200, {
        environment,
        window: { days, from: series[0]?.date, to: series[series.length - 1]?.date },
        totals: {
          requests: series.reduce((sum, row) => sum + row.requests, 0),
          errors: series.reduce((sum, row) => sum + row.errors, 0),
          projects: store.projects.length,
          openTasks: store.tasks.filter((t) => t.status !== 'done').length
        },
        series
      });
    }

    case 'exports': {
      if (rest.length === 1 && method === 'POST') {
        if (!headerKeyOk(req)) {
          return schemeFail('waypointKey', 'Authorize waypointKey in Swagger UI with the demo header key.');
        }
        const format = requireEnum(body.format, 'format', ['csv', 'json', 'ndjson'] as const, 'json');
        if (isResponse(format)) return format;
        const job: ExportJob = {
          id: nextId(store, 'exp'),
          status: 'queued',
          progress: 0,
          format,
          scope: typeof body.scope === 'string' ? body.scope : 'projects',
          createdAt: new Date().toISOString()
        };
        store.exports.push(job);
        recordAudit(store, { actor: ACTOR, action: 'export.requested', target: job.id, source });
        return json(202, { ...job, pollPath: `/exports/${job.id}` }, { Location: `/api/${environment}/exports/${job.id}` });
      }
      if (rest.length === 2 && method === 'GET') {
        if (!queryKeyOk(req)) {
          return schemeFail('waypointQueryKey', 'Authorize waypointQueryKey in Swagger UI with the demo query key.');
        }
        const job = store.exports.find((j) => j.id === rest[1]);
        if (!job) return fail(404, 'NOT_FOUND', `No export job "${rest[1]}".`);
        return json(200, refreshJob(job));
      }
      break;
    }

    case 'webhooks': {
      if (rest.length === 1) {
        if (method === 'GET') return json(200, { webhooks: store.webhooks, total: store.webhooks.length });
        if (method === 'POST') {
          const url = requireString(body.url, 'url');
          if (isResponse(url)) return url;
          if (!/^https:\/\//.test(url)) {
            return fail(422, 'VALIDATION_FAILED', 'Webhook URLs must use https.', { field: 'url' });
          }
          const created: Webhook = {
            id: nextId(store, 'whk'),
            url,
            events: asArray(body.events).length ? asArray(body.events) : ['task.created'],
            active: body.active !== false,
            secretConfigured: typeof body.secret === 'string' && body.secret.length > 0,
            createdAt: new Date().toISOString()
          };
          store.webhooks.push(created);
          recordAudit(store, { actor: ACTOR, action: 'webhook.created', target: created.id, source });
          // The submitted secret is intentionally never echoed back.
          return json(201, created);
        }
        break;
      }
      if (rest.length === 2 && method === 'DELETE') {
        const before = store.webhooks.length;
        store.webhooks = store.webhooks.filter((w) => w.id !== rest[1]);
        if (store.webhooks.length === before) return fail(404, 'NOT_FOUND', `No webhook "${rest[1]}".`);
        recordAudit(store, { actor: ACTOR, action: 'webhook.deleted', target: rest[1], source });
        return { status: 204 };
      }
      break;
    }

    case 'billing': {
      if (rest[1] !== 'charges' || method !== 'POST') break;
      // Reachable through normal Swagger UI Try it out; locked out of WebMCP by x-webmcp.
      const amount = Number(body.amountCents);
      if (!Number.isFinite(amount) || amount <= 0) {
        return fail(422, 'VALIDATION_FAILED', 'Field "amountCents" must be a positive integer.', { field: 'amountCents' });
      }
      recordAudit(store, { actor: ACTOR, action: 'billing.charge_created', target: 'chg_demo', source });
      return json(201, { id: 'chg_demo', amountCents: Math.trunc(amount), currency: 'usd', status: 'succeeded', note: 'No real money moves in this demo.' });
    }

    case 'admin': {
      if (rest[1] === 'api-keys' && method === 'GET') {
        // Locked out of WebMCP entirely; still visible to a signed-in human in Swagger UI.
        return json(200, {
          keys: [
            { id: 'key_live_1', label: 'CI deploy key', lastFour: '8f2a', createdAt: '2026-06-01T00:00:00.000Z' },
            { id: 'key_live_2', label: 'Reporting exporter', lastFour: '01bd', createdAt: '2026-07-14T00:00:00.000Z' }
          ],
          note: 'Key material is never returned by this endpoint.'
        });
      }
      if (rest[1] === 'reset-demo' && method === 'POST') {
        const target = requireEnum(body.environment, 'environment', ENVIRONMENTS, environment);
        if (isResponse(target)) return target;
        resetStore(target);
        return json(200, { reset: target, at: new Date().toISOString() });
      }
      break;
    }
  }

  return fail(404, 'NOT_FOUND', `No operation matches ${method} ${req.path}.`);
}
