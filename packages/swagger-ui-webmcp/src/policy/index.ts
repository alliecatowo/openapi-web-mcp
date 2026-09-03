/**
 * Agent exposure policy for a single OpenAPI operation.
 *
 * The publisher — not the page, and not the agent — declares what an agent may
 * do with an API, in the OpenAPI document itself, with an `x-webmcp` object on
 * the document root (the default) or on an individual operation (the override):
 *
 * ```yaml
 * x-webmcp:
 *   tool: read | write | hidden
 *   requiresAuth: true | bearerAuth | [bearerAuth, waypointKey]
 *   destructive: true
 * ```
 *
 * - `tool` states what the operation is for agents: a READ tool, a WRITE tool,
 *   or HIDDEN (never registered, never searchable).
 * - `requiresAuth` gates the CALL on the client's live auth state: `true` needs
 *   any authorization present in Swagger UI, a scheme name (or list of names)
 *   needs one of those schemes authorized. An unauthenticated agent still SEES
 *   the operation — registered, listed, correctly annotated — but calling it
 *   returns a structured AUTH_REQUIRED error. The human authorizes through
 *   Swagger UI's normal authorize dialog and the same call then succeeds.
 *   Several names mean ANY of them (mirroring OpenAPI `security` alternatives).
 * - `destructive` marks an irreversible operation. It becomes
 *   `destructiveHint` on the registered tool so the WebMCP client can gate it.
 *
 * Two sources describe the level:
 *
 *   1. The page. `webMcp.exposure` is chosen by whoever installs the plugin,
 *      and applies to every operation.
 *   2. The document. `x-webmcp.tool` on the root or the operation.
 *
 * An OpenAPI document is untrusted input. By default a document annotation may
 * therefore only *tighten* the page's exposure, never loosen it: both sources
 * reduce to a level on the lattice hidden < read < write, and the tighter one
 * wins. A publisher who authors both the page and the document can set
 * `webMcp.trustSpecAnnotations` to let the document be authoritative.
 *
 * `hidden` always removes the operation from the capability set, from either
 * source and under either setting, because refusing exposure is never a
 * privilege escalation. A page exposure of `hidden` is therefore an absolute
 * kill switch that a trusted document cannot talk its way out of.
 *
 * Permission UX — prompts, allow-once, allow-always, client-side locking — is
 * the WebMCP client's job, never the page's. The page's interface to the
 * client is registration visibility plus MCP annotations plus structured
 * errors: reads are registered with `readOnlyHint`, writes without it,
 * `destructive: true` becomes `destructiveHint`, and gated calls fail with
 * AUTH_REQUIRED or READ_ONLY_MODE instead of prompting.
 */

/** What an agent may do with an operation. Ordered hidden < read < write. */
export type ToolExposure = 'read' | 'write' | 'hidden';

export const TOOL_EXPOSURES: readonly ToolExposure[] = ['read', 'write', 'hidden'];

/**
 * An authorization gate declared by `x-webmcp.requiresAuth`.
 * `any` means some authorization must be present; `schemes` names the schemes
 * of which at least one must be authorized. Only one shape ever survives
 * parsing (see `readAuthGate`), so both fields are never set together.
 */
export interface AuthGate {
  any: boolean;
  schemes: string[];
}

/** The publisher policy object: the shape of `x-webmcp` after parsing. */
export interface SpecAnnotation {
  tool?: ToolExposure;
  requiresAuth?: AuthGate;
  destructive?: boolean;
}

/**
 * The page-supplied policy source. Identical in shape to the document
 * annotation: page code composing with `x-webmcp`, still tighten-only.
 */
export type Policy = SpecAnnotation;

const RANK: Record<ToolExposure, number> = { hidden: 0, read: 1, write: 2 };

export const isTighter = (a: ToolExposure, b: ToolExposure): boolean => RANK[a] < RANK[b];

const tightest = (...levels: ToolExposure[]): ToolExposure =>
  levels.reduce((best, next) => (RANK[next] < RANK[best] ? next : best), 'write' as ToolExposure);

/** Map an exposure level name onto a level. Anything else is not a level. */
export function toExposure(value: unknown): ToolExposure | undefined {
  if (typeof value !== 'string') return undefined;
  return (TOOL_EXPOSURES as readonly string[]).includes(value) ? (value as ToolExposure) : undefined;
}

/**
 * Parse `x-webmcp.requiresAuth`: `true` (any live authorization), one scheme
 * name, or a non-empty list of scheme names. Anything else is dropped rather
 * than guessed at.
 */
export function readAuthGate(value: unknown): AuthGate | undefined {
  if (value === true) return { any: true, schemes: [] };
  if (typeof value === 'string') {
    return value.length ? { any: false, schemes: [value] } : undefined;
  }
  if (Array.isArray(value)) {
    const schemes = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    return schemes.length ? { any: false, schemes } : undefined;
  }
  return undefined;
}

/**
 * Read an `x-webmcp` object, keeping only values this version understands.
 * Anything unrecognised is dropped rather than guessed at, so a malformed or
 * hostile annotation degrades to "no annotation" instead of a weaker policy.
 * There are no legacy aliases: `allow`, `confirm`, `block`, `policy`,
 * `agent`, `reason`, and the old permission-mode names are all ignored.
 */
export function readAnnotation(node: unknown): SpecAnnotation | undefined {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
  const raw = node as Record<string, unknown>;
  const annotation: SpecAnnotation = {};

  const tool = toExposure(raw.tool);
  if (tool) annotation.tool = tool;
  const requiresAuth = readAuthGate(raw.requiresAuth);
  if (requiresAuth) annotation.requiresAuth = requiresAuth;
  if (raw.destructive === true) annotation.destructive = true;

  return Object.keys(annotation).length ? annotation : undefined;
}

export interface PolicyInputs {
  /** Page-level `webMcp.exposure`. */
  pageExposure: ToolExposure;
  /** `x-webmcp` on the OpenAPI document root. */
  documentDefault?: SpecAnnotation;
  /** `x-webmcp` on the operation. */
  operation?: SpecAnnotation;
  /** Page-supplied resolver annotation; page code, so it may only tighten. */
  resolver?: SpecAnnotation;
  readOnly: boolean;
  /** Let document annotations relax the page exposure as well as tighten it. */
  trustSpecAnnotations?: boolean;
}

export interface ResolvedPolicy {
  /** Effective exposure after every source has been combined. */
  exposure: ToolExposure;
  /** True when the operation must be absent from the capability set entirely. */
  hidden: boolean;
  /** True when the operation is visible but not callable: a write held at read. */
  blocked: boolean;
  /** Effective authorization gate: every listed scheme group must hold. */
  requiresAuth?: AuthGate;
  destructive: boolean;
  /** Which source produced the level, for context reporting and tests. */
  source: 'page' | 'document';
  /**
   * True when a person restricted this operation for the agent in the docs UI
   * this session. Set by `applySessionLock` in the gate, never here: session
   * locks compose after every spec source and can only tighten.
   */
  locked?: boolean;
  /** Which session lock produced the restriction, when `locked` is true. */
  lock?: import('./locks.js').SessionLock;
}

export { applySessionLock, SessionLocks, toSessionLock, type SessionLock } from './locks.js';

/**
 * Of two authorization gates, return the tighter one: no gate < any
 * authorization < named schemes, and among named schemes a subset is tighter
 * (needing bearerAuth is stricter than needing bearerAuth-or-key). Gates that
 * are incomparable keep the first, so a resolver can never loosen the document
 * by naming something different — only tighten it or leave it alone.
 */
export function tighterGate(first: AuthGate | undefined, second: AuthGate | undefined): AuthGate | undefined {
  if (!first) return second;
  if (!second) return first;
  if (second.any && !first.any) return first;
  if (first.any && !second.any) return second;
  if (!first.any && !second.any) {
    if (second.schemes.every((scheme) => first.schemes.includes(scheme))) return second;
    if (first.schemes.every((scheme) => second.schemes.includes(scheme))) return first;
    return first;
  }
  return first;
}

/** True when the client's live authorized schemes satisfy the gate. */
export function authSatisfied(gate: AuthGate | undefined, authorizedSchemes: readonly string[]): boolean {
  if (!gate) return true;
  if (gate.any && authorizedSchemes.length === 0) return false;
  if (gate.schemes.length > 0 && !gate.schemes.some((scheme) => authorizedSchemes.includes(scheme))) return false;
  return true;
}

export function resolvePolicy(inputs: PolicyInputs): ResolvedPolicy {
  const { pageExposure, documentDefault, operation, resolver, readOnly, trustSpecAnnotations } = inputs;

  const documentTool = operation?.tool ?? documentDefault?.tool;

  // Trusted documents replace the page level; untrusted ones may only tighten it.
  let exposure: ToolExposure;
  let source: ResolvedPolicy['source'];
  if (trustSpecAnnotations && documentTool) {
    exposure = documentTool;
    source = 'document';
  } else {
    exposure = documentTool ? tightest(pageExposure, documentTool) : pageExposure;
    source = documentTool !== undefined && isTighter(documentTool, pageExposure) ? 'document' : 'page';
  }

  // `hidden` is a refusal to expose, so it survives every setting.
  if (documentTool === 'hidden') {
    exposure = 'hidden';
    source = 'document';
  }
  if (pageExposure === 'hidden') {
    exposure = 'hidden';
    source = 'page';
  }

  // A page-supplied resolver is page code: it may only take capability away.
  if (resolver?.tool && isTighter(resolver.tool, exposure)) {
    exposure = resolver.tool;
    source = 'page';
  }

  // The operation's gate wins over the document default; the resolver's gate
  // composes tighten-only, exactly like its level.
  const documentGate = operation?.requiresAuth ?? documentDefault?.requiresAuth;
  const requiresAuth = tighterGate(documentGate, resolver?.requiresAuth);

  return {
    exposure,
    hidden: exposure === 'hidden',
    blocked: !readOnly && exposure === 'read',
    requiresAuth,
    destructive: operation?.destructive === true || documentDefault?.destructive === true || resolver?.destructive === true,
    source
  };
}
