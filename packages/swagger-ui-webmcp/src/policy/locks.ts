/**
 * Session locks: what a person looking at the documentation page allows the
 * agent to do with one operation, for this page session only.
 *
 * A human viewing the docs can restrict an operation for the agent — an
 * endpoint they do not want the agent to call but do not control the server
 * for, a debugging loop they want to confine to a subset, or noise they want
 * hidden so the agent only sees what is relevant. The levels mirror the
 * server vocabulary exactly:
 *
 * - `view`: the agent sees the operation listed with its spec, but cannot
 *   execute it. Calls fail with a structured `LOCKED` error.
 * - `read`: the agent may execute read-class operations on it only; writes
 *   are denied with `LOCKED`.
 * - `hidden`: the operation is unregistered and unsearchable this session.
 *
 * Locks live in the page-session singleton (`pageSessionLocks`) and die with
 * the page: a reload resets every operation to what the spec declares. They
 * can only tighten what `x-webmcp` allows — a lock never widens exposure
 * (enforced where the lock is applied, in `applySessionLock`, and covered by
 * tests). The agent cannot mutate locks: the singleton is module state owned
 * by the plugin, never placed in the Swagger store or any tool-reachable
 * state, no tool reads or writes it, and no input schema carries a lock
 * field. `agentPolicy` metadata reports the effective exposure (including
 * `locked: true`) so the agent understands a `LOCKED` denial.
 *
 * Authorization gating is not a lock: it stays live login state, read from
 * Swagger UI on every call, with no lock control for it.
 */

/** How far a person has restricted one operation for the agent this session. */
export type SessionLock = 'view' | 'read' | 'hidden';

export const SESSION_LOCKS: readonly SessionLock[] = ['view', 'read', 'hidden'];

export function toSessionLock(value: unknown): SessionLock | undefined {
  return (SESSION_LOCKS as readonly string[]).includes(value as string) ? (value as SessionLock) : undefined;
}

/**
 * The page-session lock set: one per loaded page, shared by every plugin
 * evaluation on it. Swagger UI may evaluate a plugin function more than once
 * while wiring the system, so the store cannot live in the plugin closure —
 * the rendered controls and the tool gate must read the same map. Module
 * state dies with the page, which is exactly the session scope locks need: a
 * reload resets every operation to what the spec declares.
 */
let pageLocks: SessionLocks | undefined;

export function pageSessionLocks(): SessionLocks {
  if (!pageLocks) pageLocks = new SessionLocks();
  return pageLocks;
}

/** Plain in-memory map: nothing survives a reload, and nothing is reachable from tool inputs or outputs. */
export class SessionLocks {
  private locks = new Map<string, SessionLock>();
  private listeners = new Set<() => void>();
  /** Bumped on every change so tool generation can re-derive. */
  version = 0;

  get(key: string): SessionLock | undefined {
    return this.locks.get(key);
  }

  count(): number {
    return this.locks.size;
  }

  keys(): string[] {
    return [...this.locks.keys()];
  }

  /**
   * Set or clear the lock for one operation key (`METHOD /path`).
   * Unknown values clear, so a hostile caller degrades to "no lock".
   */
  set(key: string, lock: SessionLock | undefined): void {
    if (lock !== undefined && !toSessionLock(lock)) lock = undefined;
    const current = this.locks.get(key);
    if (current === lock) return;
    if (lock === undefined) this.locks.delete(key);
    else this.locks.set(key, lock);
    this.version += 1;
    this.emit();
  }

  /** Remove every lock: the unlock-all reset. */
  clear(): void {
    if (!this.locks.size) return;
    this.locks.clear();
    this.version += 1;
    this.emit();
  }

  /** Drop locks for operations no longer in the document. */
  prune(known: readonly string[]): void {
    const keep = new Set(known);
    let changed = false;
    for (const key of this.locks.keys()) {
      if (!keep.has(key)) {
        this.locks.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.version += 1;
      this.emit();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        /* A failing UI listener must not break the gate. */
      }
    }
  }
}

/**
 * Apply one operation's session lock to its spec-resolved policy.
 *
 * Tighten-only by construction:
 * - `hidden` adds invisibility; it cannot remove a spec `hidden`, and a
 *   spec-hidden operation stays hidden however the lock reads.
 * - `view` denies execution but leaves visibility and level reporting alone.
 * - `read` caps the level at `read` via the same tighter-wins rule the page
 *   and document compose with; a spec `hidden` still wins.
 *
 * Nothing here can make an operation more callable than the spec-resolved
 * policy already allowed.
 */
export function applySessionLock<T extends { exposure: 'read' | 'write' | 'hidden'; hidden: boolean; blocked: boolean }>(
  policy: T,
  lock: SessionLock | undefined,
  readOnly: boolean
): T & { locked: boolean; lock: SessionLock | undefined } {
  if (lock === undefined) return { ...policy, locked: false, lock: undefined };
  if (lock === 'hidden') {
    return { ...policy, exposure: 'hidden' as const, hidden: true, blocked: false, locked: true, lock };
  }
  if (lock === 'read') {
    if (policy.hidden) return { ...policy, locked: true, lock };
    const exposure = policy.exposure === 'write' ? ('read' as const) : policy.exposure;
    // Same rule as the spec lattice: a write held at read is visible but not
    // callable; a read-class operation is unaffected.
    return { ...policy, exposure, blocked: !readOnly && exposure === 'read', locked: true, lock };
  }
  // `view`: visible exactly as the spec resolved, but never executable.
  return { ...policy, locked: true, lock };
}
