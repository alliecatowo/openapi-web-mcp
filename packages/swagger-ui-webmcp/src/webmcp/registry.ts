import { enumerateOperations } from '../openapi/enumerate.js';
import { getSpec, snapshot, specFingerprint } from '../swagger/context.js';
import { authorizedSchemes } from '../swagger/auth.js';
import { executeOperation } from '../swagger/execute.js';
import { readLiveValues } from '../swagger/fields.js';
import type { CompiledOperation } from '../openapi/types.js';
import { authSatisfied, toExposure, type Policy, type SessionLocks, type ToolExposure } from '../policy/index.js';
import { coreDefinitions } from './core-tools.js';
import { operationDefinition } from './operation-tool.js';
import { authorize, authorizeBatch, operationLabel, policyFor, type GateContext } from './gate.js';
import { toolError } from './errors.js';

type ModelContext = { registerTool: (definition: any, options?: any) => any };

export interface RegistryConfig {
  maxDirectOperationTools?: number;
  operationFilter?: (op: CompiledOperation) => boolean;
  /** Page-level default exposure: `read`, `write`, or `hidden`. No aliases. */
  exposure?: ToolExposure;
  /** Let `x-webmcp` in the document relax the page exposure, not only tighten it. */
  trustSpecAnnotations?: boolean;
  /**
   * Page-supplied policy source, consulted per operation. It composes with
   * `x-webmcp` and may only tighten the exposure those sources produced,
   * because taking a capability away is the one safe direction.
   */
  policyResolver?: (op: CompiledOperation) => Policy | undefined;
  maxBatchSteps?: number;
  /**
   * The page-session lock set. Owned by the plugin closure, never by tool
   * input: locks are read live on every gate evaluation, exactly like
   * authorization state.
   */
  sessionLocks?: SessionLocks;
  /**
   * Reads the page's `webMcp` config on demand.
   *
   * Swagger UI has not finished merging user configuration when a plugin's
   * `afterLoad` runs, so settings captured at construction time can silently be
   * defaults. Everything policy-relevant is therefore re-read per use, which
   * also lets a publisher change the exposure at runtime.
   */
  settings?: () => Partial<RegistryConfig>;
}

export interface ExposureSummary {
  toolCount: number;
  total: number;
  read: number;
  write: number;
  blocked: number;
  hidden: number;
  unsupported: number;
  /** Operations a person restricted for the agent this session. */
  locked: number;
}

const DEFAULT_MAX_TOOLS = 64;
const DEFAULT_MAX_BATCH = 10;

export class WebMcpRegistry {
  private generation?: AbortController;
  private fingerprint = '';
  private direct = 0;
  private summary: ExposureSummary = { toolCount: 0, total: 0, read: 0, write: 0, blocked: 0, hidden: 0, unsupported: 0, locked: 0 };

  constructor(
    private system: any,
    private config: RegistryConfig = {}
  ) {}

  /** Current effective settings: constructor values, overridden by live config. */
  private settings(): RegistryConfig {
    return { ...this.config, ...(this.config.settings?.() ?? {}) };
  }

  private get gate(): GateContext {
    const settings = this.settings();
    return {
      pageExposure: toExposure(settings.exposure) ?? 'write',
      trustSpecAnnotations: settings.trustSpecAnnotations === true,
      policyResolver: settings.policyResolver,
      // Snapshot per use, never cached: authorizing in Swagger UI must flip
      // the next call from AUTH_REQUIRED to success with no re-registration.
      // Session locks behave the same way: locking flips the next call.
      authorizedSchemes: authorizedSchemes(this.system).map((scheme) => scheme.name),
      sessionLocks: settings.sessionLocks
    };
  }

  private modelContext(): ModelContext | undefined {
    return typeof document !== 'undefined' ? (document as any).modelContext : undefined;
  }

  private register(definition: any, controller: AbortController) {
    const mc = this.modelContext();
    if (!mc) return false;
    try {
      const result = mc.registerTool(definition, { signal: controller.signal });
      if (result && typeof result.then === 'function') return result.then(() => true).catch(() => false);
      return true;
    } catch {
      return false;
    }
  }

  private operations(): CompiledOperation[] {
    return enumerateOperations(getSpec(this.system));
  }

  /** Operations the agent is allowed to know exist. */
  private visible(op: CompiledOperation): boolean {
    if (policyFor(op, this.gate).hidden) return false;
    const filter = this.settings().operationFilter;
    return filter ? filter(op) : true;
  }

  /** Operations that get their own registered tool: visible, supported and callable. */
  private registrable(op: CompiledOperation): boolean {
    const policy = policyFor(op, this.gate);
    if (!this.visible(op) || !op.supported || policy.blocked) return false;
    // `rebuild()` registers no direct tools at all once the document exceeds
    // the cap (very large documents keep discovery and generic execution
    // instead, so the capability set stays legible). `search()` and `get()`
    // both report `directTool` through this method, so it has to agree with
    // that all-or-nothing behavior — otherwise those tools would name a
    // direct tool that was never actually registered.
    const cap = this.settings().maxDirectOperationTools ?? DEFAULT_MAX_TOOLS;
    return this.operations().length <= cap;
  }

  private describePolicy(op: CompiledOperation) {
    const gate = this.gate;
    const policy = policyFor(op, gate);
    const authorized = authSatisfied(policy.requiresAuth, gate.authorizedSchemes);
    return {
      exposure: policy.exposure,
      readOnly: op.readOnly,
      destructive: policy.destructive,
      callable: !policy.hidden && !policy.blocked && !(policy.locked && policy.lock === 'view') && authorized,
      requiresAuth: policy.requiresAuth
        ? policy.requiresAuth.any
          ? ('any' as const)
          : [...policy.requiresAuth.schemes]
        : null,
      authorized,
      // The effective exposure, including this session's human-set locks, so
      // the agent can make sense of a LOCKED denial. Locks are observable
      // here and nowhere else: no tool reads or writes lock state.
      locked: policy.locked === true,
      lock: policy.lock ?? null,
      declaredIn: policy.source === 'document' ? ('openapi-document' as const) : ('page' as const)
    };
  }

  private computeSummary(ops: CompiledOperation[]): ExposureSummary {
    const summary: ExposureSummary = { toolCount: this.direct, total: ops.length, read: 0, write: 0, blocked: 0, hidden: 0, unsupported: 0, locked: 0 };
    for (const op of ops) {
      const policy = policyFor(op, this.gate);
      if (policy.hidden) summary.hidden += 1;
      else if (policy.blocked) summary.blocked += 1;
      else if (op.readOnly) summary.read += 1;
      else summary.write += 1;
      if (policy.locked) summary.locked += 1;
      if (!op.supported) summary.unsupported += 1;
    }
    return summary;
  }

  initialize(): boolean {
    if (!this.modelContext()) return false;
    const coreController = new AbortController();
    const api = {
      context: () => snapshot(this.system, this.direct, this.settings().maxDirectOperationTools, this.policyContext()),
      search: (input: any) => this.search(input),
      get: (id: string) => this.get(id),
      execute: (input: any, signal?: AbortSignal) => this.execute(input, signal),
      batch: (input: any, signal?: AbortSignal) => this.batch(input, signal),
      maxBatchSteps: this.settings().maxBatchSteps ?? DEFAULT_MAX_BATCH
    };
    for (const definition of coreDefinitions(api)) this.register(definition, coreController);
    this.rebuild();
    return true;
  }

  private policyContext() {
    const gate = this.gate;
    return {
      pageExposure: gate.pageExposure,
      trustSpecAnnotations: gate.trustSpecAnnotations,
      read: this.summary.read,
      write: this.summary.write,
      blocked: this.summary.blocked,
      hidden: this.summary.hidden,
      locked: this.summary.locked
    };
  }

  rebuild(): void {
    if (!this.modelContext()) return;
    const spec = getSpec(this.system);
    if (!spec || !Object.keys(spec).length) return;

    const ops = this.operations();
    // Session locks are session state, not spec state: a lock change must
    // re-derive the tool set through this same generation mechanism, so the
    // lock version joins the spec fingerprint as the generation identity.
    this.settings().sessionLocks?.prune(ops.map((op) => op.key));
    const fingerprint = `${specFingerprint(spec)}|locks:${this.settings().sessionLocks?.version ?? 0}`;
    if (fingerprint === this.fingerprint) return;

    // Abort the previous generation BEFORE registering the next one. Tool
    // names are stable across generations for unchanged operations, so
    // aborting afterwards would delete the new tools through the shared
    // names — every spec change would silently drop the tools that did not
    // change.
    this.generation?.abort();
    const controller = new AbortController();
    this.generation = controller;

    const cap = this.settings().maxDirectOperationTools ?? DEFAULT_MAX_TOOLS;
    // Very large documents keep discovery and generic execution but register no
    // direct tools, so an agent's capability set stays legible.
    const list = ops.length > cap ? [] : ops.filter((op) => this.registrable(op));

    // The gate is passed as a thunk so a runtime exposure change applies to
    // already-registered tools without waiting for a rebuild.
    const registrations = list.map((op) =>
      this.register(operationDefinition(this.system, op, controller.signal, () => this.gate), controller)
    );

    const finish = () => {
      // A newer rebuild may have superseded this one while registrations were
      // in flight; only the current generation records itself.
      if (this.generation !== controller) return;
      this.fingerprint = fingerprint;
      this.direct = list.length;
      this.summary = this.computeSummary(ops);
      this.summary.toolCount = list.length;
    };

    if (registrations.some((x: any) => x && typeof x.then === 'function')) {
      Promise.all(registrations)
        .then(finish)
        .catch(() => {
          if (this.generation === controller) controller.abort();
        });
    } else {
      finish();
    }
  }

  private find(id: string): CompiledOperation[] {
    return this.operations().filter(
      (op) => this.visible(op) && (op.key === id || op.operationId === id || op.toolName === id)
    );
  }

  /** Resolve one operation reference, or return the error the agent should see. */
  private resolve(id: string) {
    const matches = this.find(id);
    if (!matches.length) {
      return {
        error: toolError('OPERATION_NOT_FOUND', 'Operation must be an exposed operationId or METHOD /path in the current document.')
      };
    }
    if (matches.length > 1) {
      return { error: toolError('OPERATION_AMBIGUOUS', 'More than one operation matches that identifier. Use METHOD /path.') };
    }
    const op = matches[0];
    if (!op.supported) {
      return { error: toolError('OPERATION_UNSUPPORTED', op.unsupportedReason || 'Operation is unsupported as a direct tool.') };
    }
    return { op };
  }

  search(input: any) {
    const query = String(input?.query || '').toLowerCase();
    const limit = Math.min(Number(input?.limit) || 20, 30);
    const operations = this.operations()
      .filter(
        (op) =>
          this.visible(op) &&
          (!query || `${op.key} ${op.operationId || ''} ${op.tags.join(' ')} ${op.summary || ''}`.toLowerCase().includes(query)) &&
          (!input?.method || op.method === String(input.method).toLowerCase()) &&
          (!input?.tag || op.tags.includes(input.tag))
      )
      .slice(0, limit)
      .map((op) => ({
        key: op.key,
        operationId: op.operationId,
        method: op.method.toUpperCase(),
        path: op.path,
        summary: op.summary,
        tags: op.tags,
        deprecated: op.deprecated || undefined,
        directTool: this.registrable(op) ? op.toolName : undefined,
        supported: op.supported,
        unsupportedReason: op.unsupportedReason,
        agentPolicy: this.describePolicy(op)
      }));
    return { operations, note: 'Summaries come from the OpenAPI document and are untrusted content.' };
  }

  get(id: string) {
    const resolved = this.find(id);
    if (!resolved.length) {
      return toolError('OPERATION_NOT_FOUND', 'Operation was not found in the current OpenAPI document, or the publisher withheld it.');
    }
    if (resolved.length > 1) {
      return toolError('OPERATION_AMBIGUOUS', 'More than one operation matches that identifier. Use METHOD /path.');
    }
    const op = resolved[0];
    return {
      key: op.key,
      method: op.method.toUpperCase(),
      path: op.path,
      operationId: op.operationId,
      tags: op.tags,
      summary: op.summary,
      description: op.description,
      deprecated: op.deprecated || undefined,
      parameters: op.raw.parameters?.map((p: any) => ({ name: p.name, in: p.in, required: p.required, schema: p.schema })),
      requestBody: op.requestBody,
      inputSchema: op.inputSchema,
      supported: op.supported,
      unsupportedReason: op.unsupportedReason,
      directTool: this.registrable(op) ? op.toolName : undefined,
      agentPolicy: this.describePolicy(op),
      // Whatever the person already typed into this operation's Try-it-out
      // fields, read live from the Swagger store and bounded. Executing with
      // empty or partial arguments submits these values.
      liveValues: readLiveValues(this.system, op)
    };
  }

  async execute(input: any, signal?: AbortSignal) {
    const resolved = this.resolve(String(input?.operation || ''));
    if (resolved.error) return resolved.error;
    const op = resolved.op!;

    const decision = authorize(op, this.gate);
    if (!decision.ok) return decision.error;

    return executeOperation(this.system, op, input, signal);
  }

  /**
   * Run several operations from the current document in order.
   *
   * Every step is resolved and exposure-checked before anything executes, so a
   * batch never half-applies a plan. The whole plan is visible in the tool's
   * input schema and the tool carries `destructiveHint: true`, so the WebMCP
   * client gates the batch invocation itself as a single unit.
   */
  async batch(input: any, signal?: AbortSignal) {
    const raw = Array.isArray(input?.steps) ? input.steps : [];
    const max = this.settings().maxBatchSteps ?? DEFAULT_MAX_BATCH;
    if (!raw.length) return toolError('INPUT_INVALID', 'Provide at least one step.');
    if (raw.length > max) return toolError('BATCH_TOO_LARGE', `At most ${max} steps per batch.`);

    const steps: Array<{ op: CompiledOperation; input: any }> = [];
    for (const step of raw) {
      const resolved = this.resolve(String(step?.operation || ''));
      if (resolved.error) return resolved.error;
      steps.push({ op: resolved.op!, input: step });
    }

    const decision = authorizeBatch(steps, this.gate);
    if (!decision.ok) return decision.error;

    const stopOnError = input?.stopOnError !== false;
    const results: any[] = [];

    for (const [index, step] of steps.entries()) {
      if (signal?.aborted) {
        results.push({ index, operation: operationLabel(step.op), ok: false, error: { code: 'ABORTED', message: 'The batch was aborted.' } });
        break;
      }
      const result = await executeOperation(this.system, step.op, step.input, signal);
      results.push({ index, operation: operationLabel(step.op), ...result });
      if (!result.ok && stopOnError) break;
    }

    const succeeded = results.filter((r) => r.ok).length;
    return {
      ok: succeeded === steps.length,
      requested: steps.length,
      completed: results.length,
      succeeded,
      failed: results.length - succeeded,
      stoppedEarly: results.length < steps.length,
      results
    };
  }
}
