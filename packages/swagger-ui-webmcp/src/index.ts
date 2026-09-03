import { WebMcpRegistry, type RegistryConfig } from './webmcp/registry.js';

export interface WebMcpPluginConfig extends RegistryConfig {
  enabled?: boolean;
}

/**
 * Swagger UI plugin entry point.
 *
 * Swagger UI must remain completely usable when WebMCP is absent, so every
 * capability here is feature-detected and every failure path leaves the normal
 * documentation page untouched. The plugin adds no UI of its own: the page
 * stays an ordinary Swagger UI, and agent activity is visible through Swagger
 * UI's own response panels.
 */
export default function SwaggerUIWebMCP(system: any) {
  const readConfig = (): WebMcpPluginConfig => system.getConfigs?.().webMcp || {};

  function start() {
    const config = readConfig();
    if (config.enabled === false) return;

    if (typeof document === 'undefined' || !(document as any).modelContext) return;

    const registry = new WebMcpRegistry(system, {
      // Read on every use rather than captured once: see RegistryConfig.settings.
      settings: () => {
        const live = readConfig();
        return {
          maxDirectOperationTools: live.maxDirectOperationTools ?? 64,
          maxBatchSteps: live.maxBatchSteps,
          operationFilter: live.operationFilter,
          policyResolver: live.policyResolver,
          exposure: live.exposure,
          trustSpecAnnotations: live.trustSpecAnnotations
        };
      }
    });

    (system as any).__webMcpRegistry = registry;
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
