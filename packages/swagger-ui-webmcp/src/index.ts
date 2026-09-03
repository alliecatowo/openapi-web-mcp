import { WebMcpRegistry, type RegistryConfig } from './webmcp/registry.js';
import { mountConsole } from './ui/console.js';
import { snapshot } from './swagger/context.js';

export interface WebMcpPluginConfig extends RegistryConfig {
  enabled?: boolean;
  showConsole?: boolean;
}

/**
 * Swagger UI plugin entry point.
 *
 * Swagger UI must remain completely usable when WebMCP is absent, so every
 * capability here is feature-detected and every failure path leaves the normal
 * documentation page untouched.
 */
export default function SwaggerUIWebMCP(system: any) {
  const readConfig = (): WebMcpPluginConfig => system.getConfigs?.().webMcp || {};

  function start() {
    const config = readConfig();
    if (config.enabled === false) return;

    const agentConsole = mountConsole(config);

    if (typeof document === 'undefined' || !(document as any).modelContext) {
      agentConsole.setStatus('unavailable in this browser');
      agentConsole.note('WebMCP is not available here. Swagger UI is fully functional.');
      return;
    }

    const registry = new WebMcpRegistry(system, {
      console: agentConsole,
      // Read on every use rather than captured once: see RegistryConfig.settings.
      settings: () => {
        const live = readConfig();
        return {
          maxDirectOperationTools: live.maxDirectOperationTools ?? 64,
          maxBatchSteps: live.maxBatchSteps,
          operationFilter: live.operationFilter,
          permissionMode: live.permissionMode || 'ask-for-edits',
          trustSpecAnnotations: live.trustSpecAnnotations
        };
      },
      onSummary: (summary) => {
        const live = readConfig();
        const context = snapshot(system);
        agentConsole.setSummary({
          toolCount: summary.toolCount,
          pageMode: live.permissionMode || 'ask-for-edits',
          server: context.server.effectiveUrl,
          authorized: context.auth.authorizedSchemes.length,
          withCredentials: context.auth.withCredentials,
          allow: summary.allow,
          confirm: summary.confirm,
          blocked: summary.blocked,
          hidden: summary.hidden,
          trustSpecAnnotations: live.trustSpecAnnotations === true
        });
      }
    });

    (system as any).__webMcpRegistry = registry;
    agentConsole.setStatus('loading spec…');
    registry.initialize();

    // Server selection, authorization and spec changes all flow through the
    // Swagger store; re-derive the capability set whenever it settles.
    const store = (system as any).getStore?.();
    store?.subscribe?.(() => queueMicrotask(() => registry.rebuild()));
  }

  return {
    afterLoad() {
      // Swagger UI is still assembling its configuration while plugins load, so
      // reading `webMcp` here would silently capture defaults. Startup is
      // deferred by one task, and settings are re-read live thereafter.
      if (typeof setTimeout === 'function') setTimeout(start, 0);
      else start();
    }
  };
}

export { WebMcpRegistry };
export * from './openapi/types.js';
export * from './policy/index.js';
export { enumerateOperations, compileSchema } from './openapi/compiler.js';
export { agentExecution } from './swagger/state.js';
export type { AgentConsole, ConsentRequest } from './ui/console.js';
