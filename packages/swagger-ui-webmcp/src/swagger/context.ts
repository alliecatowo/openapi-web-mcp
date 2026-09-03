import { enumerateOperations } from '../openapi/enumerate.js';
import { hashTextSync } from '../openapi/hash.js';
import type { SwaggerContextSnapshot } from '../openapi/types.js';

export function js(value: any): any {
  return value?.toJS ? value.toJS() : value;
}

export function getSpec(system: any) {
  return js(system.specSelectors?.specJson?.() || system.specSelectors?.spec?.() || {});
}

/** Identity of the currently loaded document, used to decide when to re-register. */
export function specFingerprint(spec: any): string {
  return hashTextSync(JSON.stringify(spec));
}

export interface PolicyContext {
  pageMode: string;
  trustSpecAnnotations: boolean;
  allow: number;
  confirm: number;
  blocked: number;
  hidden: number;
}

export function snapshot(system: any, direct = 0, limit?: number, policy?: PolicyContext): SwaggerContextSnapshot {
  const spec = getSpec(system);

  let effective: any;
  try {
    const selected = system.oas3Selectors?.selectedServer?.();
    effective = system.oas3Selectors?.serverEffectiveValue?.(selected);
  } catch {
    /* Swagger 2.0 documents have no oas3 selectors. */
  }
  if (!effective) effective = spec.servers?.[0]?.url;

  const auth = js(system.authSelectors?.authorized?.() || {});
  const schemes = Object.entries(auth).map(([name, value]: any) => ({ name, type: value?.schema?.type || value?.type }));

  // Enumerated once and reused; this runs on every context call.
  const operations = enumerateOperations(spec);

  return {
    spec: {
      title: spec.info?.title,
      version: spec.info?.version,
      openapiVersion: spec.openapi,
      sourceUrl: system.specSelectors?.specUrl?.() || system.specSelectors?.url?.(),
      fingerprint: specFingerprint(spec)
    },
    server: { effectiveUrl: effective },
    auth: {
      authorizedSchemes: schemes,
      withCredentials: Boolean(system.getConfigs?.()?.withCredentials)
    },
    operations: {
      total: operations.length,
      supported: operations.filter((op) => op.supported).length,
      directToolsRegistered: direct,
      directToolLimit: limit
    },
    policy: policy ?? { pageMode: 'ask-for-edits', trustSpecAnnotations: false, allow: 0, confirm: 0, blocked: 0, hidden: 0 }
  };
}
