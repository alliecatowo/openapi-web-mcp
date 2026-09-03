/**
 * The single choke point between an agent's intent and a real API call.
 *
 * Direct operation tools, the generic executor and the batch executor all pass
 * through `authorize`, so there is exactly one place where policy is evaluated
 * and exactly one place a human is asked.
 */

import type { CompiledOperation } from '../openapi/types.js';
import { resolvePolicy, type PermissionMode, type ResolvedPolicy } from '../policy/index.js';
import type { AgentConsole, ConsentRequest } from '../ui/console.js';
import { toolError } from './errors.js';

export interface GateContext {
  pageMode: PermissionMode;
  trustSpecAnnotations: boolean;
  console: AgentConsole;
  /** Operation keys a human approved for the rest of this page session. */
  remembered: Set<string>;
}

export function policyFor(op: CompiledOperation, ctx: GateContext): ResolvedPolicy {
  return resolvePolicy({
    pageMode: ctx.pageMode,
    documentDefault: op.documentAnnotation,
    operation: op.annotation,
    readOnly: op.readOnly,
    trustSpecAnnotations: ctx.trustSpecAnnotations
  });
}

export const operationLabel = (op: CompiledOperation) => `${op.method.toUpperCase()} ${op.path}`;

function blockedError(op: CompiledOperation, policy: ResolvedPolicy) {
  if (policy.hidden) {
    return toolError('OPERATION_DENIED', `${operationLabel(op)} is not available to agents on this page.`);
  }
  if (!op.readOnly) {
    return toolError('READ_ONLY_MODE', 'Write operations are disabled by the current WebMCP permission mode.');
  }
  return toolError('POLICY_BLOCKED', `${operationLabel(op)} is blocked by the permission policy for this page.`);
}

/** Describe what the agent is asking for, in terms a person can check. */
export function describeInvocation(input: any): string[] {
  const lines: string[] = [];
  const group = (name: string, label: string) => {
    const value = input?.[name];
    if (value && typeof value === 'object' && Object.keys(value).length) {
      lines.push(`${label}: ${Object.entries(value).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
    }
  };
  group('path', 'Path');
  group('query', 'Query');
  group('headers', 'Headers');
  if (input?.body !== undefined) {
    const keys = input.body && typeof input.body === 'object' ? Object.keys(input.body) : [];
    lines.push(keys.length ? `Body fields: ${keys.join(', ')}` : 'Body: (scalar value)');
  }
  return lines;
}

export type Authorization = { ok: true; policy: ResolvedPolicy } | { ok: false; error: ReturnType<typeof toolError> };

/**
 * Resolve policy for one operation and, when required, block on a human.
 * Returns the resolved policy so callers can label the activity log correctly.
 */
export async function authorize(op: CompiledOperation, input: any, ctx: GateContext): Promise<Authorization> {
  const policy = policyFor(op, ctx);

  if (policy.decision === 'block') {
    ctx.console.note(`${operationLabel(op)} refused by policy`, 'deny');
    return { ok: false, error: blockedError(op, policy) };
  }

  if (policy.decision === 'confirm' && !ctx.remembered.has(op.key)) {
    const request: ConsentRequest = {
      title: operationLabel(op),
      lines: describeInvocation(input),
      reason: policy.reason,
      destructive: policy.destructive,
      args: input,
      // An irreversible call is always worth asking about again.
      allowRemember: !policy.destructive
    };
    const outcome = await ctx.console.requestConsent(request);
    if (outcome === 'deny') {
      ctx.console.note(`${operationLabel(op)} denied by the user`, 'deny');
      return { ok: false, error: toolError('PERMISSION_REQUIRED', 'A person declined this operation in the page.') };
    }
    if (outcome === 'always') ctx.remembered.add(op.key);
  }

  return { ok: true, policy };
}

/**
 * Authorize a whole batch under one prompt. Every step is resolved before any
 * step runs, so a batch never executes half of a plan the user would refuse.
 */
export async function authorizeBatch(
  steps: Array<{ op: CompiledOperation; input: any }>,
  ctx: GateContext
): Promise<Authorization> {
  const policies = steps.map((step) => policyFor(step.op, ctx));

  const blockedAt = policies.findIndex((policy) => policy.decision === 'block');
  if (blockedAt >= 0) {
    const step = steps[blockedAt];
    ctx.console.note(`Batch refused: ${operationLabel(step.op)} is blocked`, 'deny');
    return { ok: false, error: blockedError(step.op, policies[blockedAt]) };
  }

  const needsConsent = steps.some((step, index) => policies[index].decision === 'confirm' && !ctx.remembered.has(step.op.key));
  const destructive = policies.some((policy) => policy.destructive);

  if (needsConsent) {
    const reasons = [...new Set(policies.map((policy) => policy.reason).filter(Boolean))] as string[];
    const outcome = await ctx.console.requestConsent({
      title: `Batch · ${steps.length} operation${steps.length === 1 ? '' : 's'}`,
      lines: steps.map((step, index) => `${index + 1}. ${operationLabel(step.op)}`),
      reason: reasons.length ? reasons.join(' ') : undefined,
      destructive,
      args: steps.map((step) => ({ operation: operationLabel(step.op), ...step.input })),
      allowRemember: false
    });
    if (outcome === 'deny') {
      ctx.console.note('Batch denied by the user', 'deny');
      return { ok: false, error: toolError('PERMISSION_REQUIRED', 'A person declined this batch in the page.') };
    }
  }

  return {
    ok: true,
    policy: {
      decision: needsConsent ? 'confirm' : 'allow',
      destructive,
      hidden: false,
      source: 'page'
    }
  };
}
