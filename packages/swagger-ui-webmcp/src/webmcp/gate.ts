/**
 * The single choke point between an agent's intent and a real API call.
 *
 * Direct operation tools, the generic executor and the batch executor all pass
 * through `authorize`, so there is exactly one place where exposure is
 * enforced. Enforcement is declarative and evaluated at CALL time against
 * Swagger UI's live state: the page never prompts. Permissioning is the
 * WebMCP client's job, driven by the annotations each tool was registered
 * with; the page's job ended at declaring exposure.
 *
 * SEE vs CALL: an operation gated by `x-webmcp.requiresAuth` stays registered
 * and listed while unauthorized — the agent can see it exists and which
 * schemes it needs — but calling it returns AUTH_REQUIRED. The human
 * authorizes through Swagger UI's normal authorize dialog (shared client
 * state), and the same tool call then succeeds with no re-registration.
 */

import type { CompiledOperation } from '../openapi/types.js';
import {
  authSatisfied,
  resolvePolicy,
  type Policy,
  type ResolvedPolicy,
  type ToolExposure
} from '../policy/index.js';
import { toolError } from './errors.js';

export interface GateContext {
  pageExposure: ToolExposure;
  trustSpecAnnotations: boolean;
  policyResolver?: (op: CompiledOperation) => Policy | undefined;
  /** Scheme names currently authorized in Swagger UI. Read live per call. */
  authorizedSchemes: readonly string[];
}

export function policyFor(op: CompiledOperation, ctx: GateContext): ResolvedPolicy {
  return resolvePolicy({
    pageExposure: ctx.pageExposure,
    documentDefault: op.documentAnnotation,
    operation: op.annotation,
    resolver: ctx.policyResolver?.(op),
    readOnly: op.readOnly,
    trustSpecAnnotations: ctx.trustSpecAnnotations
  });
}

export const operationLabel = (op: CompiledOperation) => `${op.method.toUpperCase()} ${op.path}`;

function refusedError(op: CompiledOperation, policy: ResolvedPolicy) {
  if (policy.hidden) {
    return toolError('OPERATION_DENIED', `${operationLabel(op)} is not available to agents on this page.`);
  }
  return toolError('READ_ONLY_MODE', 'Write operations are not exposed to agents by this page or document.');
}

function authError(op: CompiledOperation, policy: ResolvedPolicy) {
  const gate = policy.requiresAuth;
  const needed =
    gate && !gate.any && gate.schemes.length ? ` (${gate.schemes.join(', ')})` : '';
  return toolError(
    'AUTH_REQUIRED',
    `${operationLabel(op)} requires authorization${needed}. ` +
      'Authorize in Swagger UI, then call again. The operation is listed but not callable until then.'
  );
}

export type Authorization = { ok: true; policy: ResolvedPolicy } | { ok: false; error: ReturnType<typeof toolError> };

/**
 * Resolve exposure for one operation against live client state. There is
 * deliberately no waiting on a human here: the client gates invocations using
 * the annotations the tool was registered with, and the page's job ended at
 * declaring exposure.
 */
export function authorize(op: CompiledOperation, ctx: GateContext): Authorization {
  const policy = policyFor(op, ctx);
  if (policy.hidden || policy.blocked) return { ok: false, error: refusedError(op, policy) };
  if (!authSatisfied(policy.requiresAuth, ctx.authorizedSchemes)) return { ok: false, error: authError(op, policy) };
  return { ok: true, policy };
}

/**
 * Check a whole batch before anything runs, so a batch never half-applies a
 * plan containing an operation that is not exposed — or not authorized. The
 * batch tool itself is registered with `destructiveHint: true` and its full
 * plan is visible in the input schema, so the client gates the invocation as
 * one unit.
 */
export function authorizeBatch(steps: Array<{ op: CompiledOperation }>, ctx: GateContext): Authorization {
  for (const step of steps) {
    const decision = authorize(step.op, ctx);
    if (!decision.ok) return decision;
  }
  const write = steps.some((step) => !step.op.readOnly);
  const destructive = steps.some((step) => policyFor(step.op, ctx).destructive);
  return {
    ok: true,
    policy: {
      exposure: write ? 'write' : 'read',
      hidden: false,
      blocked: false,
      destructive,
      source: 'page'
    }
  };
}
