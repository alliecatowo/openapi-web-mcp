/**
 * Agent permission policy for a single OpenAPI operation.
 *
 * Two independent sources describe what an agent may do:
 *
 *   1. The page.  `webMcp.permissionMode` is chosen by whoever installs the
 *      plugin, and applies to every operation.
 *   2. The OpenAPI document.  An `x-webmcp` object on the document root or on
 *      an individual operation lets the team that publishes the API state the
 *      policy per endpoint, where it lives next to the endpoint itself.
 *
 * An OpenAPI document is untrusted input. By default a spec annotation may
 * therefore only *tighten* the page's decision, never loosen it: both sources
 * are reduced to a decision on the lattice allow < confirm < block, and the
 * stricter one wins. A publisher who authors both the page and the document can
 * set `webMcp.trustSpecAnnotations` to let the document be authoritative.
 *
 * `deny` always removes the operation from the capability set, from either
 * source and under either setting, because refusing exposure is never a
 * privilege escalation. A page mode of `deny` is therefore an absolute kill
 * switch that a trusted document cannot talk its way out of.
 */

/** Permission modes, usable at page level and in `x-webmcp.policy`. */
export type PermissionMode = 'no-prompt' | 'ask-for-edits' | 'ask-first' | 'read-only' | 'deny';

/** What actually happens when the agent calls the operation. */
export type PolicyDecision = 'allow' | 'confirm' | 'block';

export const PERMISSION_MODES: readonly PermissionMode[] = ['no-prompt', 'ask-for-edits', 'ask-first', 'read-only', 'deny'];

const RANK: Record<PolicyDecision, number> = { allow: 0, confirm: 1, block: 2 };

/** Maximum length of publisher prose surfaced in the consent UI. */
const MAX_REASON = 240;

export interface SpecAnnotation {
  policy?: PermissionMode;
  destructive?: boolean;
  /** Publisher prose. Untrusted: shown to a human, never placed in tool metadata. */
  reason?: string;
}

export interface ResolvedPolicy {
  decision: PolicyDecision;
  destructive: boolean;
  /** True when the publisher asked for the operation to be omitted entirely. */
  hidden: boolean;
  /** Untrusted publisher prose for the consent UI only. */
  reason?: string;
  /** Which input produced the final decision, for the status UI and tests. */
  source: 'page' | 'document' | 'destructive';
}

export const isStricter = (a: PolicyDecision, b: PolicyDecision): boolean => RANK[a] > RANK[b];

const strictest = (...decisions: PolicyDecision[]): PolicyDecision =>
  decisions.reduce((worst, next) => (RANK[next] > RANK[worst] ? next : worst), 'allow' as PolicyDecision);

/** Reduce a permission mode to a decision about one operation. */
export function decide(mode: PermissionMode, readOnly: boolean): PolicyDecision {
  switch (mode) {
    case 'no-prompt':
      return 'allow';
    case 'ask-for-edits':
      return readOnly ? 'allow' : 'confirm';
    case 'ask-first':
      return 'confirm';
    case 'read-only':
      return readOnly ? 'allow' : 'block';
    case 'deny':
      return 'block';
  }
}

/**
 * Read an `x-webmcp` object, keeping only values this version understands.
 * Anything unrecognised is dropped rather than guessed at, so a malformed or
 * hostile annotation degrades to "no annotation" instead of to a weaker policy.
 */
export function readAnnotation(node: unknown): SpecAnnotation | undefined {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
  const raw = node as Record<string, unknown>;
  const annotation: SpecAnnotation = {};

  if (typeof raw.policy === 'string' && (PERMISSION_MODES as readonly string[]).includes(raw.policy)) {
    annotation.policy = raw.policy as PermissionMode;
  }
  if (raw.destructive === true) annotation.destructive = true;
  if (typeof raw.reason === 'string' && raw.reason.trim()) {
    annotation.reason = raw.reason.trim().slice(0, MAX_REASON);
  }

  return Object.keys(annotation).length ? annotation : undefined;
}

export interface PolicyInputs {
  /** Page-level `webMcp.permissionMode`. */
  pageMode: PermissionMode;
  /** `x-webmcp` on the OpenAPI document root. */
  documentDefault?: SpecAnnotation;
  /** `x-webmcp` on the operation. */
  operation?: SpecAnnotation;
  readOnly: boolean;
  /** Let document annotations relax the page decision as well as tighten it. */
  trustSpecAnnotations?: boolean;
}

export function resolvePolicy(inputs: PolicyInputs): ResolvedPolicy {
  const { pageMode, documentDefault, operation, readOnly, trustSpecAnnotations } = inputs;

  const pageDecision = decide(pageMode, readOnly);
  const documentMode = operation?.policy ?? documentDefault?.policy;
  const documentDecision = documentMode ? decide(documentMode, readOnly) : undefined;
  const destructive = operation?.destructive === true || documentDefault?.destructive === true;

  // Trusted documents replace the page decision; untrusted ones may only tighten it.
  let decision: PolicyDecision;
  let source: ResolvedPolicy['source'];
  if (trustSpecAnnotations && documentDecision !== undefined) {
    decision = documentDecision;
    source = 'document';
  } else {
    decision = strictest(pageDecision, documentDecision ?? 'allow');
    source = documentDecision !== undefined && isStricter(documentDecision, pageDecision) ? 'document' : 'page';
  }

  // `deny` is a refusal to expose, so it survives every setting.
  let hidden = false;
  if (documentMode === 'deny') {
    decision = 'block';
    source = 'document';
    hidden = true;
  }
  if (pageMode === 'deny') {
    decision = 'block';
    source = 'page';
    hidden = true;
  }

  // A destructive operation is never silent, whatever the modes say.
  if (destructive && decision === 'allow') {
    decision = 'confirm';
    source = 'destructive';
  }

  return {
    decision,
    destructive,
    hidden,
    reason: operation?.reason ?? documentDefault?.reason,
    source
  };
}
