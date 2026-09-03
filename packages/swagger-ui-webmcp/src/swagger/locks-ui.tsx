import React, { useSyncExternalStore } from 'react';
import { SessionLocks, type SessionLock } from '../policy/locks.js';

/**
 * The docs-page side of session locks: normal human chrome, no agent
 * branding. A person looking at an operation can restrict what an agent
 * using this page may do with it — view only, read only, or hidden — for
 * this session only. Nothing here is reachable from tools: the control
 * writes to the in-memory `SessionLocks` store owned by the plugin closure,
 * and lock changes re-derive the tool set through the normal generation
 * mechanism.
 *
 * Two integration points, both ordinary Swagger UI extension points:
 * - the `operation` wrapper adds one compact row to every operation block,
 *   next to Try-it-out territory;
 * - the `info` wrapper adds a session bar with the unlock-all reset, shown
 *   only while at least one lock is active.
 *
 * The person is never locked out by these controls: they touch only the
 * agent's capability set. An operation hidden from the agent stays fully
 * operable by hand.
 */

export interface LockUi {
  locks: SessionLocks;
  /** Flip to false when the plugin is disabled after wrappers registered. */
  enabled: { current: boolean };
  /** Called after every lock change so the tool set is re-derived. */
  onChange: () => void;
}

const LEVEL_LABEL: Record<SessionLock, string> = {
  view: 'View only',
  read: 'Read only',
  hidden: 'Hidden'
};

function useLockVersion(locks: SessionLocks): number {
  return useSyncExternalStore(
    (notify) => locks.subscribe(notify),
    () => locks.version
  );
}

function LockSelect({ opKey, ui }: { opKey: string; ui: LockUi }) {
  useLockVersion(ui.locks);
  const current = ui.locks.get(opKey);

  return (
    <span className="sw-webmcp-lockrow">
      <label className="sw-webmcp-locklabel">
        Agent access
        <select
          className="sw-webmcp-lockselect"
          aria-label={`Agent access for ${opKey}. Session only; reloading the page resets it.`}
          title="Restrict what an agent using this page can do with this operation. Session only — reloading the page resets it. You are never restricted."
          value={current ?? 'full'}
          onChange={(event) => {
            const value = event.target.value;
            ui.locks.set(opKey, value === 'full' ? undefined : (value as SessionLock));
            ui.onChange();
          }}
        >
          <option value="full">Full access</option>
          <option value="view">View only — listed, not executable</option>
          <option value="read">Read only — reads run, writes denied</option>
          <option value="hidden">Hidden — invisible to the agent</option>
        </select>
      </label>
      {current && <span className="sw-webmcp-locknote">Session only · reload resets · {LEVEL_LABEL[current]}</span>}
    </span>
  );
}

/** The wrapped `operation` prop is an Immutable record (or a plain object in tests). */
function opKeyOf(props: any): string | undefined {
  const record = props?.operation;
  if (!record) return undefined;
  const read = (field: string): unknown =>
    typeof record.get === 'function' ? record.get(field) : record[field];
  const method = read('method');
  const path = read('path');
  if (typeof method !== 'string' || typeof path !== 'string') return undefined;
  return `${method.toUpperCase()} ${path}`;
}

/**
 * Wrap Swagger UI's `operation` component: the original block renders
 * untouched, followed by one compact access row. Rendering below the block
 * keeps the control visible whether the operation is expanded or not.
 */
export function wrapOperation(Original: any, ui: LockUi) {
  return function OperationWithSessionLock(props: any) {
    const opKey = opKeyOf(props);

    return (
      <React.Fragment>
        <Original {...props} />
        {ui.enabled.current && opKey && (
          <div className="sw-webmcp-lockwrap" data-webmcp-lock={opKey}>
            <LockSelect opKey={opKey} ui={ui} />
          </div>
        )}
      </React.Fragment>
    );
  };
}

/**
 * Wrap Swagger UI's `info` component: while locks are active, a slim bar
 * under the API info names the count and offers the unlock-all reset.
 */
export function wrapInfo(Original: any, ui: LockUi) {
  return function InfoWithSessionUnlock(props: any) {
    const version = useLockVersion(ui.locks);
    void version;
    const active = ui.enabled.current ? ui.locks.count() : 0;

    return (
      <React.Fragment>
        <Original {...props} />
        {active > 0 && (
          <div className="sw-webmcp-sessionbar" data-webmcp-session-locks={active}>
            <span>
              Agent access restricted on {active} operation{active === 1 ? '' : 's'} this session. Reloading the page
              resets every lock; nothing here limits what you can do by hand.
            </span>
            <button
              type="button"
              className="sw-webmcp-resetbtn"
              onClick={() => {
                ui.locks.clear();
                ui.onChange();
              }}
            >
              Reset all locks
            </button>
          </div>
        )}
      </React.Fragment>
    );
  };
}

let styleInjected = false;

/** Minimal Swagger-like styling for the lock chrome. Injected once. */
export function ensureLockStyles(): void {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-webmcp-locks', '');
  style.textContent = [
    '.sw-webmcp-lockwrap{display:flex;justify-content:flex-end;padding:2px 0 10px}',
    '.sw-webmcp-lockrow{display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:12px;color:#3b4151}',
    '.sw-webmcp-locklabel{display:inline-flex;align-items:center;gap:6px}',
    '.sw-webmcp-lockselect{font:inherit;color:inherit;background:#fff;border:1px solid #d9d9d9;border-radius:4px;padding:2px 6px;max-width:260px}',
    '.sw-webmcp-locknote{color:#8a8e99}',
    '.sw-webmcp-sessionbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:8px 0 0;padding:8px 12px;font-family:inherit;font-size:12px;color:#3b4151;background:#f7f7f7;border:1px solid #e8e8e8;border-radius:4px}',
    '.sw-webmcp-resetbtn{font:inherit;color:#4990e2;background:transparent;border:1px solid #4990e2;border-radius:4px;padding:2px 10px;cursor:pointer}',
    '.sw-webmcp-resetbtn:hover{background:#4990e2;color:#fff}'
  ].join('\n');
  document.head.appendChild(style);
}
