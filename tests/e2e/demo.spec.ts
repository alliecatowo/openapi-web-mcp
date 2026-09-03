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

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('#session')).toContainText('dev@waypoint.local');
}

/** The demo store is per server process, so tests reseed it to stay independent. */
async function resetDemoData(page: Page) {
  const response = await page.request.post('/api/sandbox/admin/reset-demo', { data: { environment: 'sandbox' } });
  expect(response.status()).toBe(200);
}

const console_ = (page: Page) => page.locator('[data-swagger-webmcp-status]');

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
    await expect(console_(page)).toContainText('WebMCP');
    await expect(console_(page)).toContainText('tools');

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

  test('withholds operations the document marks deny, everywhere', async ({ page }) => {
    await page.goto('/');
    await expect(console_(page)).toContainText('tools');

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
    await signIn(page);
    const direct = await page.request.post('/api/sandbox/billing/charges', { data: { amountCents: 500 } });
    expect(direct.status()).toBe(201);
  });

  test('excludes binary uploads from direct tools but explains why', async ({ page }) => {
    await page.goto('/');
    await expect(console_(page)).toContainText('tools');

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
    await expect(console_(page)).toContainText('tools');

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

test.describe('Human approval', () => {
  test.beforeEach(async ({ page }) => {
    await withWebMcp(page);
    await page.goto('/');
    await expect(console_(page)).toContainText('tools');
    await signIn(page);
    await resetDemoData(page);
    await expect(console_(page)).toContainText('tools');
  });

  test('runs a publisher-waived write with no prompt and logs it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const name = (window as any).__findTool('api.createTask.');
      const tool = (window as any).__webmcpTools.get(name);
      return tool.execute({ path: { projectId: 'prj_alpha' }, body: { title: 'From the agent', priority: 'high' } }, {});
    });

    expect(result.ok).toBe(true);
    expect(result.response.status).toBe(201);
    await expect(console_(page).locator('.log li').first()).toContainText('POST /projects/{projectId}/tasks');
  });

  test('stops an ungated write on a consent card and runs it once approved', async ({ page }) => {
    await page.evaluate(() => {
      const name = (window as any).__findTool('api.createProject.');
      return (window as any).__invoke(name, { body: { name: 'Agent proposed project', priority: 'high' } });
    });

    const card = console_(page).locator('.consent');
    await expect(card).toBeVisible();
    await expect(card.locator('h4')).toContainText('POST /projects');
    await expect(card).toContainText('Body fields: name, priority');

    await card.getByRole('button', { name: 'Allow once' }).click();

    const result = await page.evaluate(() => (window as any).__result);
    expect(result.ok).toBe(true);
    expect(result.response.status).toBe(201);
    await expect(card).toHaveCount(0);
  });

  test('never touches the API when a person denies', async ({ page }) => {
    const before = await page.request.get('/api/sandbox/projects');
    const countBefore = (await before.json()).pagination.total;

    await page.evaluate(() => {
      const name = (window as any).__findTool('api.createProject.');
      return (window as any).__invoke(name, { body: { name: 'Should never exist' } });
    });

    await console_(page).locator('.consent').getByRole('button', { name: 'Deny' }).click();

    const result = await page.evaluate(() => (window as any).__result);
    expect(result.error.code).toBe('PERMISSION_REQUIRED');

    const after = await page.request.get('/api/sandbox/projects');
    expect((await after.json()).pagination.total).toBe(countBefore);
  });

  test('shows the publisher reason and refuses to remember a destructive call', async ({ page }) => {
    await page.evaluate(() => {
      const name = (window as any).__findTool('api.deleteProject.');
      return (window as any).__invoke(name, { path: { projectId: 'prj_delta' } });
    });

    const card = console_(page).locator('.consent');
    await expect(card).toContainText('Permanently removes a project');
    await expect(card).toContainText('Stated by the API document');
    await expect(card.locator('.badge')).toHaveText('destructive');
    await expect(card.getByRole('button', { name: 'Always allow' })).toHaveCount(0);

    await card.getByRole('button', { name: 'Deny' }).click();
  });

  test('asks once for a batch and applies every step in order', async ({ page }) => {
    await page.evaluate(() => {
      const tool = (window as any).__webmcpTools.get('openapi_execute_batch');
      (window as any).__result = tool.execute(
        {
          steps: [
            { operation: 'createProject', body: { name: 'Q3 Launch', priority: 'high' } },
            { operation: 'listProjects', query: { q: 'Q3 Launch' } }
          ]
        },
        {}
      );
      return true;
    });

    const card = console_(page).locator('.consent');
    await expect(card.locator('h4')).toContainText('Batch · 2 operations');
    await expect(card).toContainText('1. POST /projects');
    await expect(card).toContainText('2. GET /projects');

    await card.getByRole('button', { name: 'Allow once' }).click();

    const result = await page.evaluate(() => (window as any).__result);
    expect(result.succeeded).toBe(2);
    expect(result.results[1].response.body.projects[0].name).toBe('Q3 Launch');
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
    await expect(console_(page)).toContainText('tools');
    await signIn(page);

    // Without `x-webmcp`, the operation the annotated document waived is gated again.
    await page.evaluate(() => {
      const name = (window as any).__findTool('api.createTask.');
      return (window as any).__invoke(name, {
        path: { projectId: 'prj_alpha' },
        body: { title: 'Now needs approval', priority: 'low' }
      });
    });

    const card = console_(page).locator('.consent');
    await expect(card).toBeVisible();
    await expect(card.locator('h4')).toContainText('POST /projects/{projectId}/tasks');

    // And the operations the annotated document withheld are now merely gated.
    const names = await toolNames(page);
    expect(names.some((name: string) => name.startsWith('api.createCharge.'))).toBe(true);

    await card.getByRole('button', { name: 'Deny' }).click();
  });
});
