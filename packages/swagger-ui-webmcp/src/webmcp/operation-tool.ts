import type { CompiledOperation } from '../openapi/types.js';
import { executeOperation } from '../swagger/execute.js';
import { authorize, operationLabel, policyFor, type GateContext } from './gate.js';

/**
 * Build the WebMCP tool definition for one OpenAPI operation.
 *
 * The description is assembled from structural facts only — method, path, and
 * where execution happens. OpenAPI prose is untrusted and never lands here.
 *
 * Annotations are the publisher's permission statement to the WebMCP client:
 * reads carry `readOnlyHint: true`, writes carry no `readOnlyHint` and gain
 * `destructiveHint: true` when the publisher marked them destructive, and
 * `costHint: true` (plus a `costNote` string, when the publisher gave one)
 * when the publisher marked them costly or consequential. The client decides
 * what to ask a person; the page never does.
 */
export function operationDefinition(
  system: any,
  op: CompiledOperation,
  signal: AbortSignal,
  gate: () => GateContext
) {
  const policy = policyFor(op, gate());
  return {
    name: op.toolName,
    title: op.displayTitle,
    description:
      `Execute ${operationLabel(op)} from the OpenAPI document currently loaded in Swagger UI. ` +
      `Uses the page's current server and authorization state.`,
    inputSchema: op.inputSchema,
    annotations: {
      readOnlyHint: op.readOnly,
      destructiveHint: policy.destructive,
      costHint: policy.costHint !== undefined,
      ...(policy.costHint?.note ? { costNote: policy.costHint.note } : {}),
      untrustedContentHint: true
    },
    execute: async (input: any, callCtx: any = {}) => {
      const decision = authorize(op, gate());
      if (!decision.ok) return decision.error;
      return executeOperation(system, op, input, callCtx.signal || signal);
    }
  };
}
