import type { CompiledOperation } from '../openapi/types.js';
import { executeOperation } from '../swagger/execute.js';
import { authorize, operationLabel, type GateContext } from './gate.js';

export type { PermissionMode } from '../policy/index.js';

/**
 * Build the WebMCP tool definition for one OpenAPI operation.
 *
 * The description is assembled from structural facts only — method, path, and
 * where execution happens. OpenAPI prose is untrusted and never lands here;
 * it reaches a person through the consent card instead.
 */
export function operationDefinition(
  system: any,
  op: CompiledOperation,
  signal: AbortSignal,
  gate: () => GateContext
) {
  return {
    name: op.toolName,
    title: op.displayTitle,
    description:
      `Execute ${operationLabel(op)} from the OpenAPI document currently loaded in Swagger UI. ` +
      `Uses the page's current server and authorization state.`,
    inputSchema: op.inputSchema,
    annotations: {
      readOnlyHint: op.readOnly,
      destructiveHint: op.annotation?.destructive === true,
      untrustedContentHint: true
    },
    execute: async (input: any, callCtx: any = {}) => {
      const ctx = gate();
      const decision = await authorize(op, input, ctx);
      if (!decision.ok) return decision.error;

      const finish = ctx.console.beginCall(operationLabel(op), decision.policy.decision);
      try {
        const result = await executeOperation(system, op, input, callCtx.signal || signal);
        finish(result.ok ? String(result.response?.status ?? 'ok') : (result.error?.code ?? 'failed'), result.ok);
        return result;
      } catch (error) {
        finish('error', false);
        throw error;
      }
    }
  };
}
