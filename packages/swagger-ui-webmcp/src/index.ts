import { WebMcpRegistry, type RegistryConfig } from './webmcp/registry.js';
import { pageSessionLocks } from './policy/locks.js';
import { ensureLockStyles, wrapInfo, wrapOperation, type LockUi } from './swagger/locks-ui.js';

export interface WebMcpPluginConfig extends RegistryConfig {
  enabled?: boolean;
}

/**
 * Swagger UI plugin entry point.
 *
 * Swagger UI must remain completely usable when WebMCP is absent, so every
 * capability here is feature-detected and every failure path leaves the normal
 * documentation page untouched. Agent activity is visible through Swagger
 * UI's own response panels, and the one UI the plugin adds — the per-operation
 * session-lock control — is normal human chrome: it only narrows what the
 * agent may do, never what the person can do.
 */
export default function SwaggerUIWebMCP(system: any) {
  const readConfig = (): WebMcpPluginConfig => system.getConfigs?.().webMcp || {};

  // Session locks live in the page-session singleton, never in the plugin
  // closure: Swagger UI may evaluate this function more than once while
  // wiring the system, and the rendered controls and the tool gate must read
  // the same map. In-memory page state dies on reload, which is the session
  // scope locks need. The agent cannot mutate locks; it only observes their
  // effect through `agentPolicy`.
  const sessionLocks = pageSessionLocks();
  const lockUi: LockUi = {
    locks: sessionLocks,
    enabled: { current: true },
    onChange: () => {
      const registry = (system as any).__webMcpRegistry as WebMcpRegistry | undefined;
      if (registry) queueMicrotask(() => registry.rebuild());
    }
  };

  function start() {
    const config = readConfig();
    if (config.enabled === false) {
      lockUi.enabled.current = false;
      return;
    }

    ensureLockStyles();

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
          trustSpecAnnotations: live.trustSpecAnnotations,
          sessionLocks
        };
      }
    });

    (system as any).__webMcpRegistry = registry;
    registry.initialize();

    // Server selection, authorization, spec changes — and session locks — all
    // flow through to the capability set; re-derive whenever anything settles.
    // Lock changes already carry their version in the generation identity, so
    // this subscription only needs the store.
    const store = (system as any).getStore?.();
    store?.subscribe?.(() => queueMicrotask(() => registry.rebuild()));
    sessionLocks.subscribe(() => queueMicrotask(() => registry.rebuild()));
  }

  return {
    afterLoad() {
      // Swagger UI is still assembling its configuration while plugins load, so
      // reading `webMcp` here would silently capture defaults. Startup is
      // deferred by one task, and settings are re-read live thereafter.
      if (typeof setTimeout === 'function') setTimeout(start, 0);
      else start();
    },
    wrapComponents: {
      operation: (Original: any) => wrapOperation(Original, lockUi),
      // The API info header is `info` for OpenAPI 2.0/3.0 documents and
      // `OAS31Info` for 3.1 documents: wrap both so the unlock-all reset has
      // a home whatever the document version.
      info: (Original: any) => wrapInfo(Original, lockUi),
      OAS31Info: (Original: any) => wrapInfo(Original, lockUi)
    }
  };
}

export { WebMcpRegistry };
export * from './openapi/types.js';
export * from './policy/index.js';
export { enumerateOperations, compileSchema } from './openapi/compiler.js';
export { agentExecution } from './swagger/state.js';
export { readLiveValues, mergeWithLiveValues } from './swagger/fields.js';
