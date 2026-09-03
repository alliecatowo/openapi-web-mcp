import { test, expect, type Page } from '@playwright/test';

/**
 * Installs a minimal `document.modelContext` before the page scripts run, so
 * the real plugin registers against a real capability surface. The shim is a
 * test double for the browser agent, never shipped to production.
 */
async function withWebMcp(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, any>();
    (window as any).__webmcpTools = tools;
    (document as any).modelContext = {
      registerTool: async (definition: any, options: any = {}) => {
        tools.set(definition.name, definition);
        options.signal?.addEventListener('abort', () => tools.delete(definition.name), { once: true });
      }
    };
    // Start a tool call and park its promise for the test to await later.
    (window as any).__invoke = (name: string, input: any) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`no tool named ${name}`);
      (window as any).__result = tool.execute(input, {});
      return true;
    };
    (window as any).__findTool = (prefix: string) => [...tools.keys()].find((n) => n.startsWith(prefix));
  });
}

const toolNames = (page: Page) => page.evaluate(() => [...(window as any).__webmcpTools.keys()]);

async function webmcpReady(page: Page) {
  await page.waitForFunction(() => (window as any).__webmcpTools?.has('openapi_search_operations'), null, {
    timeout: 15000
  });
}

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#session')).toContainText('dev@waypoint.local');
}

async function signInWithWebmcp(page: Page) {
  await signIn(page);
  // Signing in reloads the page, so the capability set is re-registered.
  await webmcpReady(page);
}

/** The demo store is per server process, so tests reseed it to stay independent. */
async function resetDemoData(page: Page) {
  const response = await page.request.post('/api/sandbox/admin/reset-demo', { data: { environment: 'sandbox' } });
  expect(response.status()).toBe(200);
}

const DEMO_TOKENS = {
  bearerAuth: 'waypoint-demo-bearer',
  waypointKey: 'waypoint-demo-key',
  waypointQueryKey: 'waypoint-demo-query-key'
} as const;

/** Authorize one scheme through Swagger UI's own authorize dialog. */
async function authorizeScheme(page: Page, scheme: keyof typeof DEMO_TOKENS) {
  await page.locator('.auth-wrapper .authorize').first().click();
  const container = page.locator('.auth-container', { has: page.locator(`h4 code:text-is("${scheme}")`) });
  await expect(container).toBeVisible();
  await container.locator('input').fill(DEMO_TOKENS[scheme]);
  // The submit button's aria-label ("Apply credentials") overrides its text.
  await container.locator('button.authorize').click();
  await expect(container.locator('button:has-text("Logout")')).toBeVisible();
  await page.locator('.dialog-ux .close-modal').click();
}

/** Revoke one scheme through Swagger UI's own authorize dialog. */
async function logoutScheme(page: Page, scheme: keyof typeof DEMO_TOKENS) {
  await page.locator('.auth-wrapper .authorize').first().click();
  const container = page.locator('.auth-container', { has: page.locator(`h4 code:text-is("${scheme}")`) });
  await container.locator('button:has-text("Logout")').click();
  await expect(container.locator('button.authorize')).toBeVisible();
  await page.locator('.dialog-ux .close-modal').click();
}

async function agentExecute(page: Page, name: string, input: any) {
  return page.evaluate(
    ([toolName, args]) => (window as any).__webmcpTools.get(toolName).execute(args, {}),
    [name, input] as const
  );
}

test.describe('Swagger UI without WebMCP', () => {
  test('remains an ordinary, fully usable documentation page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero h1')).toHaveText('Waypoint Projects API');
    await expect(page.locator('.swagger-ui')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#session')).toContainText('signed out');

    expect((await page.request.get('/api/sandbox/projects')).status()).toBe(401);
    await signIn(page);
    const me = await page.evaluate(async () => {
      const response = await fetch('/api/sandbox/me', { credentials: 'include' });
      return response.json();
    });
    expect(me.environment).toBe('sandbox');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.locator('#session')).toContainText('signed out');
  });

  test('server selection changes which environment answers', async ({ page }) => {
    await page.goto('/');
    await signIn(page);

    const server = page.locator('.servers select');
    await expect(server).toBeVisible();
    await expect(server).toHaveValue('/api/sandbox');
    await server.selectOption('/api/production');

    const result = await page.evaluate(async () => {
      const response = await fetch('/api/production/projects', { credentials: 'include' });
      return response.json();
    });
    expect(result.environment).toBe('production');
  });
});

test.describe('WebMCP capability set', () => {
  test.beforeEach(async ({ page }) => {
    await withWebMcp(page);
  });

  test('registers the stable tools and one tool per eligible operation', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    const names = await toolNames(page);
    expect(names).toEqual(
      expect.arrayContaining([
        'openapi_get_context',
        'openapi_search_operations',
        'openapi_get_operation',
        'openapi_execute_operation',
        'openapi_execute_batch'
      ])
    );
    expect(names.some((name: string) => name.startsWith('api.listProjects.'))).toBe(true);
    expect(names.some((name: string) => name.startsWith('api.createTask.'))).toBe(true);
  });

  test('ships no agent-only UI: nothing exists solely for agents', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    // The consent-era console is gone: no shadow-DOM panel, no consent cards,
    // no session memory controls. Agent activity surfaces through Swagger
    // UI's own response panels instead.
    expect(await page.locator('[data-swagger-webmcp-status]').count()).toBe(0);
    expect(await page.locator('.consent').count()).toBe(0);
  });

  test('registers tools with honest MCP annotations', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    const annotations = await page.evaluate(() => {
      const tools = (window as any).__webmcpTools as Map<string, any>;
      const pick = (prefix: string) => tools.get([...tools.keys()].find((n) => n.startsWith(prefix))!);
      return {
        read: pick('api.listProjects.').annotations,
        write: pick('api.createTask.').annotations,
        destructive: pick('api.deleteProject.').annotations,
        batch: tools.get('openapi_execute_batch').annotations
      };
    });

    expect(annotations.read).toEqual({ readOnlyHint: true, destructiveHint: false, untrustedContentHint: true });
    expect(annotations.write).toEqual({ readOnlyHint: false, destructiveHint: false, untrustedContentHint: true });
    expect(annotations.destructive).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      untrustedContentHint: true
    });
    expect(annotations.batch).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  test('withholds operations the document marks hidden, everywhere', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.createCharge.'))).toBe(false);
    expect(names.some((name: string) => name.startsWith('api.listApiKeys.'))).toBe(false);

    const search = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_search_operations');
      return tool.execute({ query: 'charge' }, {});
    });
    expect(search.operations).toHaveLength(0);

    const attempt = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_execute_operation');
      return tool.execute({ operation: 'createCharge', body: { amountCents: 500 } }, {});
    });
    expect(attempt.error.code).toBe('OPERATION_NOT_FOUND');

    // Still reachable by a signed-in human through normal Swagger UI.
    await signInWithWebmcp(page);
    const direct = await page.request.post('/api/sandbox/billing/charges', { data: { amountCents: 500 } });
    expect(direct.status()).toBe(201);
  });

  test('keeps a held write visible but not callable', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    const detail = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_get_operation');
      return tool.execute({ operation: 'bulkUpdateTasks' }, {});
    });
    expect(detail.agentPolicy).toMatchObject({ exposure: 'read', callable: false });

    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.bulkUpdateTasks.'))).toBe(false);

    const attempt = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_execute_operation');
      return tool.execute({ operation: 'bulkUpdateTasks', body: { operations: [] } }, {});
    });
    expect(attempt.error.code).toBe('READ_ONLY_MODE');
  });

  test('excludes binary uploads from direct tools but explains why', async ({ page }) => {
    await page.goto('/');
    await webmcpReady(page);

    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.uploadProjectAttachment.'))).toBe(false);

    const detail = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_get_operation');
      return tool.execute({ operation: 'uploadProjectAttachment' }, {});
    });
    expect(detail.supported).toBe(false);
    expect(detail.unsupportedReason).toMatch(/binary/);
  });

  test('falls back to discovery only when a document exceeds the tool cap', async ({ page }) => {
    await page.goto('/?maxTools=5');
    await webmcpReady(page);

    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.'))).toBe(false);
    expect(names).toContain('openapi_search_operations');

    const search = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_search_operations');
      return tool.execute({ query: 'projects' }, {});
    });
    expect(search.operations.length).toBeGreaterThan(0);
  });
});

test.describe('SEE vs CALL through Swagger auth UI', () => {
  test.beforeEach(async ({ page }) => {
    await withWebMcp(page);
    await page.goto('/');
    await webmcpReady(page);
  });

  test('bearer: listed while signed out, AUTH_REQUIRED, then 200 after authorizing', async ({ page }) => {
    const search = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_search_operations');
      return tool.execute({ query: 'usage report' }, {});
    });
    const usage = search.operations.find((op: any) => op.operationId === 'getUsageReport');
    expect(usage.agentPolicy).toMatchObject({ requiresAuth: ['bearerAuth'], authorized: false, callable: false });

    const before = await agentExecute(page, 'openapi_execute_operation', { operation: 'getUsageReport' });
    expect(before.error.code).toBe('AUTH_REQUIRED');

    await authorizeScheme(page, 'bearerAuth');

    const after = await agentExecute(page, 'openapi_execute_operation', { operation: 'getUsageReport' });
    expect(after.ok).toBe(true);
    expect(after.response.status).toBe(200);
    expect(after.displayedInSwaggerUi).toBe(true);
  });

  test('header key: agent creates an export only after the human authorizes', async ({ page }) => {
    const before = await agentExecute(page, 'openapi_execute_operation', {
      operation: 'createExport',
      body: { format: 'json', scope: 'projects' }
    });
    expect(before.error.code).toBe('AUTH_REQUIRED');

    await authorizeScheme(page, 'waypointKey');

    const after = await agentExecute(page, 'openapi_execute_operation', {
      operation: 'createExport',
      body: { format: 'json', scope: 'projects' }
    });
    expect(after.ok).toBe(true);
    expect(after.response.status).toBe(202);
    expect(after.displayedInSwaggerUi).toBe(true);
  });

  test('query key: export status polls only after its own scheme is authorized', async ({ page }) => {
    await authorizeScheme(page, 'waypointKey');
    const created = await agentExecute(page, 'openapi_execute_operation', {
      operation: 'createExport',
      body: { format: 'json', scope: 'projects' }
    });
    expect(created.ok).toBe(true);
    const jobId = created.response.body.id as string;

    const before = await agentExecute(page, 'openapi_execute_operation', {
      operation: 'getExport',
      path: { jobId }
    });
    expect(before.error.code).toBe('AUTH_REQUIRED');

    await authorizeScheme(page, 'waypointQueryKey');

    const after = await agentExecute(page, 'openapi_execute_operation', {
      operation: 'getExport',
      path: { jobId }
    });
    expect(after.ok).toBe(true);
    expect(after.response.status).toBe(200);
    expect(after.response.body.id).toBe(jobId);
  });

  test('revoking in Swagger UI flips the same call back to AUTH_REQUIRED', async ({ page }) => {
    await authorizeScheme(page, 'bearerAuth');
    const authed = await agentExecute(page, 'openapi_execute_operation', { operation: 'getUsageReport' });
    expect(authed.ok).toBe(true);

    await logoutScheme(page, 'bearerAuth');

    const revoked = await agentExecute(page, 'openapi_execute_operation', { operation: 'getUsageReport' });
    expect(revoked.error.code).toBe('AUTH_REQUIRED');
  });

  test('direct tools enforce the live gate too', async ({ page }) => {
    const name = await page.evaluate(() => (window as any).__findTool('api.getUsageReport.'));
    expect(name).toBeTruthy();

    const before = await agentExecute(page, name, {});
    expect(before.error.code).toBe('AUTH_REQUIRED');

    await authorizeScheme(page, 'bearerAuth');

    const after = await agentExecute(page, name, {});
    expect(after.ok).toBe(true);
    expect(after.response.status).toBe(200);
  });
});

test.describe('Shared state, no prompts', () => {
  test.beforeEach(async ({ page }) => {
    await withWebMcp(page);
    await page.goto('/');
    await webmcpReady(page);
    await signInWithWebmcp(page);
    await resetDemoData(page);
  });

  test('runs reads and writes with no prompt and receipts in Swagger UI', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const name = (window as any).__findTool('api.createTask.');
      const tool = (window as any).__webmcpTools.get(name);
      return tool.execute({ path: { projectId: 'prj_alpha' }, body: { title: 'From the agent', priority: 'high' } }, {});
    });

    expect(result.ok).toBe(true);
    expect(result.response.status).toBe(201);
    expect(result.displayedInSwaggerUi).toBe(true);
  });

  test('marks agent-driven writes in the audit log', async ({ page }) => {
    await page.evaluate(async () => {
      const name = (window as any).__findTool('api.createTask.');
      return (window as any).__webmcpTools.get(name).execute(
        { path: { projectId: 'prj_alpha' }, body: { title: 'Traced to the agent', priority: 'low' } },
        {}
      );
    });

    const events = await page.evaluate(async () => {
      const response = await fetch('/api/sandbox/audit-events?limit=1', { credentials: 'include' });
      return response.json();
    });
    expect(events.events[0]).toMatchObject({ action: 'task.created', source: 'webmcp-agent' });
  });

  test('runs a batch with no approval stop and refuses a bad plan whole', async ({ page }) => {
    const good = await agentExecute(page, 'openapi_execute_batch', {
      steps: [
        { operation: 'createProject', body: { name: 'Q3 Launch', priority: 'high' } },
        { operation: 'listProjects', query: { q: 'Q3 Launch' } }
      ]
    });
    expect(good.succeeded).toBe(2);
    expect(good.results[1].response.body.projects[0].name).toBe('Q3 Launch');

    const countBefore = good.results[1].response.body.pagination.total;

    const bad = await agentExecute(page, 'openapi_execute_batch', {
      steps: [
        { operation: 'createProject', body: { name: 'Should never exist' } },
        { operation: 'createCharge', body: { amountCents: 1000 } }
      ]
    });
    expect(bad.error.code).toBe('OPERATION_NOT_FOUND');

    const after = await agentExecute(page, 'openapi_execute_operation', { operation: 'listProjects' });
    expect(after.response.body.pagination.total).toBe(countBefore);
  });

  test('refuses a batch containing an unauthorized step before running anything', async ({ page }) => {
    const result = await agentExecute(page, 'openapi_execute_batch', {
      steps: [{ operation: 'listProjects' }, { operation: 'getUsageReport' }]
    });
    expect(result.error.code).toBe('AUTH_REQUIRED');
  });

  test('follows the server dropdown without re-registering tools', async ({ page }) => {
    const before = await page.evaluate(() => {
      const name = (window as any).__findTool('api.listProjects.');
      return (window as any).__webmcpTools.get(name).execute({}, {});
    });
    expect(before.response.body.environment).toBe('sandbox');

    await page.locator('.servers select').selectOption('/api/production');

    const after = await page.evaluate(() => {
      const name = (window as any).__findTool('api.listProjects.');
      return (window as any).__webmcpTools.get(name).execute({}, {});
    });
    expect(after.response.body.environment).toBe('production');
  });
});

test.describe('Document-declared policy', () => {
  test('an unannotated copy of the same API falls back to the page default', async ({ page }) => {
    await withWebMcp(page);
    await page.goto('/?spec=/openapi-unannotated.yaml');
    await webmcpReady(page);

    // Without `x-webmcp`, nothing is hidden and nothing is held: the page
    // default decides, and this page exposes writes.
    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.createCharge.'))).toBe(true);
    expect(names.some((name: string) => name.startsWith('api.bulkUpdateTasks.'))).toBe(true);

    const detail = await page.evaluate(async () => {
      const tool = (window as any).__webmcpTools.get('openapi_get_operation');
      return tool.execute({ operation: 'bulkUpdateTasks' }, {});
    });
    expect(detail.agentPolicy).toMatchObject({ callable: true, declaredIn: 'page' });
  });
});
