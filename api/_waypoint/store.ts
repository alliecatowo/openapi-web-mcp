/**
 * In-memory demo data for the Waypoint Projects API.
 *
 * Each environment (sandbox / production) gets its own isolated store so the
 * Swagger server dropdown visibly changes what an operation returns. State is
 * per-process and resets on cold start; POST /admin/reset-demo reseeds it.
 */

export type Environment = 'sandbox' | 'production';

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'archived';
  priority: 'low' | 'medium' | 'high';
  owner: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'blocked' | 'done';
  assignee?: string;
  labels: string[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  source: 'swagger-ui' | 'webmcp-agent' | 'system';
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secretConfigured: boolean;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  progress: number;
  format: 'csv' | 'json' | 'ndjson';
  scope: string;
  createdAt: string;
  completedAt?: string;
  downloadPath?: string;
}

export interface EnvironmentStore {
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  audit: AuditEvent[];
  webhooks: Webhook[];
  exports: ExportJob[];
  counter: number;
}

const EPOCH = Date.parse('2026-08-01T09:00:00.000Z');

/** Deterministic timestamps keep demo output stable across reseeds. */
const at = (offsetMinutes: number) => new Date(EPOCH + offsetMinutes * 60_000).toISOString();

function seedProjects(environment: Environment): Project[] {
  const sandbox: Array<Partial<Project>> = [
    { id: 'prj_alpha', key: 'WEB', name: 'Website Redesign', description: 'Marketing site refresh and design system rollout.', status: 'active', priority: 'high', tags: ['design', 'frontend'] },
    { id: 'prj_beta', key: 'MOB', name: 'Mobile Prototype', description: 'Exploratory React Native client for field teams.', status: 'active', priority: 'medium', tags: ['mobile'] },
    { id: 'prj_gamma', key: 'DAT', name: 'Data Warehouse Cutover', description: 'Move reporting off the legacy replica.', status: 'paused', priority: 'medium', tags: ['data', 'infra'] },
    { id: 'prj_delta', key: 'OLD', name: 'Legacy Importer', description: 'Retired batch importer kept for reference.', status: 'archived', priority: 'low', tags: ['data'] }
  ];
  const production: Array<Partial<Project>> = [
    { id: 'prj_alpha', key: 'CHK', name: 'Checkout Reliability', description: 'Reduce payment failures at peak traffic.', status: 'active', priority: 'high', tags: ['payments', 'reliability'] },
    { id: 'prj_beta', key: 'BIL', name: 'Billing Migration', description: 'Move invoicing onto the new ledger service.', status: 'active', priority: 'high', tags: ['payments'] },
    { id: 'prj_gamma', key: 'SEC', name: 'SOC 2 Evidence', description: 'Continuous control evidence collection.', status: 'active', priority: 'medium', tags: ['compliance'] },
    { id: 'prj_delta', key: 'CDN', name: 'Edge Cache Rollout', description: 'Completed edge caching migration.', status: 'archived', priority: 'low', tags: ['infra'] }
  ];

  const rows = environment === 'sandbox' ? sandbox : production;
  return rows.map((row, index) => ({
    owner: 'dev@waypoint.local',
    version: 1,
    // Newest first, so the lead project heads a default `updatedAt` sort.
    createdAt: at(-index * 90),
    updatedAt: at(-index * 90 + 30),
    ...row
  }) as Project);
}

function seedTasks(environment: Environment): Task[] {
  const rows: Array<Partial<Task> & { projectId: string; title: string }> = environment === 'sandbox'
    ? [
        { projectId: 'prj_alpha', title: 'Audit color contrast on marketing pages', priority: 'high', status: 'in_progress', assignee: 'rae@waypoint.local', labels: ['a11y'] },
        { projectId: 'prj_alpha', title: 'Ship new navigation component', priority: 'medium', status: 'open', assignee: 'kim@waypoint.local', labels: ['frontend'] },
        { projectId: 'prj_alpha', title: 'Remove unused Tailwind layers', priority: 'low', status: 'done', labels: ['cleanup'] },
        { projectId: 'prj_beta', title: 'Spike offline sync strategy', priority: 'high', status: 'open', assignee: 'rae@waypoint.local', labels: ['mobile', 'spike'] },
        { projectId: 'prj_beta', title: 'Wire crash reporting', priority: 'medium', status: 'blocked', labels: ['mobile'] },
        { projectId: 'prj_gamma', title: 'Backfill 2025 fact tables', priority: 'urgent', status: 'open', assignee: 'sam@waypoint.local', labels: ['data'] }
      ]
    : [
        { projectId: 'prj_alpha', title: 'Investigate 3DS timeout spike', priority: 'urgent', status: 'in_progress', assignee: 'sam@waypoint.local', labels: ['payments', 'incident'] },
        { projectId: 'prj_alpha', title: 'Add retry budget to card authorizations', priority: 'high', status: 'open', assignee: 'rae@waypoint.local', labels: ['payments'] },
        { projectId: 'prj_alpha', title: 'Publish checkout SLO dashboard', priority: 'medium', status: 'done', labels: ['reliability'] },
        { projectId: 'prj_beta', title: 'Dual-write invoices to the new ledger', priority: 'high', status: 'in_progress', assignee: 'kim@waypoint.local', labels: ['payments'] },
        { projectId: 'prj_beta', title: 'Reconcile August invoice drift', priority: 'urgent', status: 'blocked', labels: ['payments', 'finance'] },
        { projectId: 'prj_gamma', title: 'Collect Q3 access review evidence', priority: 'medium', status: 'open', assignee: 'sam@waypoint.local', labels: ['compliance'] }
      ];

  return rows.map((row, index) => ({
    id: `tsk_${String(index + 1).padStart(3, '0')}`,
    description: undefined,
    labels: [],
    dueDate: at(index * 240 + 2880),
    createdAt: at(index * 45),
    updatedAt: at(index * 45 + 15),
    ...row
  }) as Task);
}

function seedComments(environment: Environment): Comment[] {
  const first = environment === 'sandbox'
    ? 'Contrast ratios fail on the pricing hero. Needs a token change, not a one-off.'
    : 'Timeouts cluster on one acquirer. Opening a ticket with them now.';
  return [
    { id: 'cmt_001', taskId: 'tsk_001', author: 'rae@waypoint.local', body: first, createdAt: at(120) },
    { id: 'cmt_002', taskId: 'tsk_001', author: 'kim@waypoint.local', body: 'Agreed — tracking it as a design system fix.', createdAt: at(150) }
  ];
}

function seedAudit(environment: Environment): AuditEvent[] {
  // Index 0 is the most recent event: the list endpoint returns newest first.
  return Array.from({ length: 12 }, (_, index) => ({
    id: `evt_${String(index + 1).padStart(4, '0')}`,
    at: at(-index * 25),
    actor: index % 3 === 0 ? 'sam@waypoint.local' : 'dev@waypoint.local',
    action: ['project.updated', 'task.created', 'task.status_changed', 'webhook.delivered'][index % 4],
    target: index % 2 === 0 ? 'prj_alpha' : 'tsk_001',
    source: (['swagger-ui', 'system', 'swagger-ui'] as const)[index % 3]
  })).concat(
    environment === 'production'
      ? [{ id: 'evt_0013', at: at(-400), actor: 'sam@waypoint.local', action: 'billing.charge_created', target: 'chg_9001', source: 'system' }]
      : []
  );
}

function seedWebhooks(): Webhook[] {
  return [
    { id: 'whk_001', url: 'https://hooks.waypoint.local/task-events', events: ['task.created', 'task.status_changed'], active: true, secretConfigured: true, createdAt: at(10) }
  ];
}

export function createStore(environment: Environment): EnvironmentStore {
  return {
    projects: seedProjects(environment),
    tasks: seedTasks(environment),
    comments: seedComments(environment),
    audit: seedAudit(environment),
    webhooks: seedWebhooks(),
    exports: [],
    counter: 100
  };
}

const stores = new Map<Environment, EnvironmentStore>();

export function storeFor(environment: Environment): EnvironmentStore {
  let store = stores.get(environment);
  if (!store) {
    store = createStore(environment);
    stores.set(environment, store);
  }
  return store;
}

export function resetStore(environment: Environment): EnvironmentStore {
  const store = createStore(environment);
  stores.set(environment, store);
  return store;
}

export function nextId(store: EnvironmentStore, prefix: string): string {
  store.counter += 1;
  return `${prefix}_${store.counter}`;
}

export function recordAudit(
  store: EnvironmentStore,
  event: Omit<AuditEvent, 'id' | 'at'> & { at?: string }
): AuditEvent {
  const entry: AuditEvent = {
    id: nextId(store, 'evt'),
    at: event.at ?? new Date().toISOString(),
    actor: event.actor,
    action: event.action,
    target: event.target,
    source: event.source
  };
  store.audit.unshift(entry);
  return entry;
}
