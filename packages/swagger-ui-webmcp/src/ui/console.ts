/**
 * The Agent Console: the human half of the human-agent loop.
 *
 * Everything an agent does on this page is visible here, and anything the
 * policy marks `confirm` stops here until a person approves it. The panel lives
 * in a shadow root so Swagger UI's stylesheet cannot reach it and it cannot
 * leak styles back.
 *
 * Consent is deliberately in-page rather than `window.confirm`: a native dialog
 * blocks the event loop (which would stall the agent's own tool call), shows no
 * arguments, and offers no "always allow" without re-prompting every time.
 */

import type { PolicyDecision } from '../policy/index.js';

export type ConsentOutcome = 'once' | 'always' | 'deny';

export interface ConsentRequest {
  /** Short label, e.g. `POST /projects` or `Batch · 3 operations`. */
  title: string;
  /** Structural lines rendered as text. Never HTML. */
  lines: string[];
  /** Untrusted publisher prose from `x-webmcp.reason`. */
  reason?: string;
  destructive?: boolean;
  /** Arguments the agent proposed, pretty-printed for review. */
  args?: unknown;
  /** Hide the "always allow" affordance for irreversible calls. */
  allowRemember?: boolean;
}

export interface ConsoleSummary {
  toolCount: number;
  pageMode: string;
  server?: string;
  authorized: number;
  withCredentials: boolean;
  allow: number;
  confirm: number;
  blocked: number;
  hidden: number;
  trustSpecAnnotations: boolean;
}

export interface AgentConsole {
  setStatus(text: string): void;
  setSummary(summary: ConsoleSummary): void;
  requestConsent(request: ConsentRequest): Promise<ConsentOutcome>;
  /** Records the start of a call; returns a finish callback. */
  beginCall(label: string, decision: PolicyDecision): (outcome: string, ok: boolean) => void;
  note(text: string, tone?: 'info' | 'deny'): void;
  element: HTMLElement | undefined;
}

const NOOP_CONSOLE: AgentConsole = {
  setStatus: () => {},
  setSummary: () => {},
  requestConsent: async () => 'deny',
  beginCall: () => () => {},
  note: () => {},
  element: undefined
};

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.panel {
  position: fixed; right: 16px; bottom: 16px; width: 380px; max-width: calc(100vw - 32px);
  max-height: min(620px, calc(100vh - 32px)); display: flex; flex-direction: column;
  background: #ffffff; color: #1d2733; border: 1px solid #d5dfeb; border-radius: 12px;
  box-shadow: 0 18px 48px rgba(16, 32, 52, .18); overflow: hidden; z-index: 2147483000;
  font-size: 13px; line-height: 1.45;
}
.panel[data-collapsed="true"] .body { display: none; }
.head {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer;
  background: #10233b; color: #eef4fb; border: 0; width: 100%; text-align: left; font-size: 13px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #46d39a; flex: none; }
.dot[data-state="idle"] { background: #6b8199; }
.dot[data-state="busy"] { background: #ffc247; animation: pulse 1s ease-in-out infinite; }
.dot[data-state="wait"] { background: #ff8a5b; animation: pulse .7s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none !important; } }
.head strong { font-weight: 650; letter-spacing: .01em; }
.head .count { margin-left: auto; font-variant-numeric: tabular-nums; opacity: .75; font-size: 12px; }
.chev { opacity: .7; font-size: 11px; }
.body { overflow-y: auto; padding: 0; }
.summary { padding: 10px 12px; border-bottom: 1px solid #e8eef5; background: #f8fafc; }
.summary dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; }
.summary dt { color: #64748b; font-size: 11.5px; }
.summary dd { margin: 0; font-size: 11.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ledger { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.pill { font-size: 11px; padding: 2px 7px; border-radius: 20px; border: 1px solid transparent; }
.pill.allow { background: #e6f8f0; color: #146c4a; border-color: #b6e6d2; }
.pill.confirm { background: #fff4e0; color: #8a5a09; border-color: #f5dcae; }
.pill.block { background: #fdeaea; color: #9b2222; border-color: #f3c9c9; }
.pill.hidden { background: #eef1f5; color: #55637a; border-color: #dbe2ec; }
.section-title { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #7a8899; }
.consent { margin: 0 12px 10px; border: 1px solid #f0c98d; background: #fffaf1; border-radius: 9px; padding: 10px; }
.consent[data-destructive="true"] { border-color: #eda9a9; background: #fff6f6; }
.consent h4 { margin: 0 0 6px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.consent .badge { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 1px 6px; border-radius: 4px; background: #c0392b; color: #fff; margin-left: 6px; vertical-align: 1px; }
.consent p { margin: 0 0 6px; }
.consent .quoted { border-left: 3px solid #e2cba0; padding-left: 8px; color: #6a5a3d; font-style: italic; }
.consent .origin { display: block; font-style: normal; font-size: 10.5px; color: #93805c; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
.consent ul { margin: 0 0 8px; padding-left: 16px; }
.consent li { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
details { margin-bottom: 8px; }
summary { cursor: pointer; font-size: 11.5px; color: #4a5b70; }
pre { margin: 6px 0 0; padding: 8px; background: #10233b; color: #dbe7f5; border-radius: 6px; overflow: auto; max-height: 160px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
button.act { font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 6px; border: 1px solid #c8d4e2; background: #fff; color: #1d2733; cursor: pointer; }
button.act:hover { border-color: #9fb2c8; }
button.act.primary { background: #10233b; border-color: #10233b; color: #fff; }
button.act.danger { background: #b02a2a; border-color: #b02a2a; color: #fff; }
button.act:focus-visible, .head:focus-visible { outline: 2px solid #2f6fd0; outline-offset: 2px; }
.log { list-style: none; margin: 0; padding: 0 12px 12px; }
.log li { display: flex; gap: 8px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; }
.log li:last-child { border-bottom: 0; }
.log .what { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: 1; word-break: break-all; }
.log .res { font-variant-numeric: tabular-nums; color: #5a6b80; }
.log li[data-ok="false"] .res { color: #b02a2a; }
.log .tag { font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; padding: 1px 5px; border-radius: 3px; background: #eef2f7; color: #5a6b80; }
.empty { padding: 0 12px 12px; color: #8695a8; font-size: 12px; }
`;

const text = (tag: string, className: string, value: string): HTMLElement => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value; // textContent, never innerHTML: spec prose is untrusted.
  return el;
};

export function mountConsole(config: any): AgentConsole {
  if (typeof document === 'undefined' || config?.showConsole === false) return NOOP_CONSOLE;

  const host = document.createElement('div');
  host.dataset.swaggerWebmcpStatus = '';
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.dataset.collapsed = 'false';

  const head = document.createElement('button');
  head.className = 'head';
  head.type = 'button';
  head.setAttribute('aria-expanded', 'true');
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.dataset.state = 'idle';
  const heading = text('strong', '', 'WebMCP');
  const statusText = text('span', 'count', 'starting');
  const chevron = text('span', 'chev', '▾');
  head.append(dot, heading, statusText, chevron);

  const body = document.createElement('div');
  body.className = 'body';

  const summaryBox = document.createElement('div');
  summaryBox.className = 'summary';

  const consentZone = document.createElement('div');
  const logTitle = text('div', 'section-title', 'Agent activity');
  const log = document.createElement('ul');
  log.className = 'log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  const empty = text('div', 'empty', 'No agent calls yet. Tools are registered and idle.');

  body.append(summaryBox, consentZone, logTitle, log, empty);
  panel.append(head, body);
  root.append(style, panel);

  head.addEventListener('click', () => {
    const collapsed = panel.dataset.collapsed === 'true';
    panel.dataset.collapsed = collapsed ? 'false' : 'true';
    head.setAttribute('aria-expanded', String(collapsed));
    chevron.textContent = collapsed ? '▾' : '▸';
  });

  (document.body || document.documentElement).append(host);

  let pending = 0;
  let busy = 0;

  const refreshDot = () => {
    dot.dataset.state = pending > 0 ? 'wait' : busy > 0 ? 'busy' : 'idle';
  };

  const appendLog = (node: HTMLElement) => {
    empty.style.display = 'none';
    log.prepend(node);
    while (log.children.length > 30) log.lastElementChild?.remove();
  };

  return {
    element: host,

    setStatus(value: string) {
      statusText.textContent = value;
    },

    setSummary(summary: ConsoleSummary) {
      summaryBox.replaceChildren();
      const list = document.createElement('dl');
      const rows: Array<[string, string]> = [
        ['Server', summary.server || 'not selected'],
        ['Page mode', summary.pageMode],
        ['Spec policy', summary.trustSpecAnnotations ? 'authoritative' : 'may only tighten'],
        [
          'Session',
          summary.authorized > 0
            ? `${summary.authorized} scheme(s)`
            : summary.withCredentials
              ? 'browser cookies'
              : 'none'
        ]
      ];
      for (const [term, value] of rows) {
        list.append(text('dt', '', term), text('dd', '', value));
      }
      const ledger = document.createElement('div');
      ledger.className = 'ledger';
      ledger.append(
        text('span', 'pill allow', `${summary.allow} direct`),
        text('span', 'pill confirm', `${summary.confirm} ask first`),
        text('span', 'pill block', `${summary.blocked} blocked`),
        text('span', 'pill hidden', `${summary.hidden} withheld`)
      );
      summaryBox.append(list, ledger);
      statusText.textContent = `${summary.toolCount} tools`;
    },

    requestConsent(request: ConsentRequest) {
      pending += 1;
      refreshDot();

      return new Promise<ConsentOutcome>((resolve) => {
        const card = document.createElement('div');
        card.className = 'consent';
        card.dataset.destructive = String(Boolean(request.destructive));
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', `Approval required: ${request.title}`);

        const title = text('h4', '', request.title);
        if (request.destructive) title.append(text('span', 'badge', 'destructive'));
        card.append(title);

        if (request.reason) {
          const quoted = document.createElement('p');
          quoted.className = 'quoted';
          quoted.append(
            text('span', 'origin', 'Stated by the API document'),
            document.createTextNode(request.reason)
          );
          card.append(quoted);
        }

        if (request.lines.length) {
          const list = document.createElement('ul');
          for (const line of request.lines) list.append(text('li', '', line));
          card.append(list);
        }

        if (request.args !== undefined) {
          const details = document.createElement('details');
          details.append(text('summary', '', 'Review arguments'));
          let rendered: string;
          try {
            rendered = JSON.stringify(request.args, null, 2) ?? String(request.args);
          } catch {
            rendered = '[arguments could not be displayed]';
          }
          details.append(text('pre', '', rendered.slice(0, 4000)));
          card.append(details);
        }

        const actions = document.createElement('div');
        actions.className = 'actions';

        const settle = (outcome: ConsentOutcome) => {
          pending -= 1;
          refreshDot();
          card.remove();
          resolve(outcome);
        };

        const approve = document.createElement('button') as HTMLButtonElement;
        approve.className = 'act primary';
        approve.type = 'button';
        approve.textContent = 'Allow once';
        approve.addEventListener('click', () => settle('once'));
        actions.append(approve);

        if (request.allowRemember !== false) {
          const always = document.createElement('button') as HTMLButtonElement;
          always.className = 'act';
          always.type = 'button';
          always.textContent = 'Always allow';
          always.title = 'Approve this operation for the rest of this page session.';
          always.addEventListener('click', () => settle('always'));
          actions.append(always);
        }

        const deny = document.createElement('button') as HTMLButtonElement;
        deny.className = request.destructive ? 'act danger' : 'act';
        deny.type = 'button';
        deny.textContent = 'Deny';
        deny.addEventListener('click', () => settle('deny'));
        actions.append(deny);

        card.append(actions);

        // Expand the panel so a queued approval can never be missed.
        panel.dataset.collapsed = 'false';
        head.setAttribute('aria-expanded', 'true');
        consentZone.append(card);
        approve.focus({ preventScroll: true });
      });
    },

    beginCall(label: string, decision: PolicyDecision) {
      busy += 1;
      refreshDot();
      const started = Date.now();

      const row = document.createElement('li');
      row.append(
        text('span', 'tag', decision === 'confirm' ? 'approved' : 'auto'),
        text('span', 'what', label),
        text('span', 'res', '…')
      );
      appendLog(row);

      return (outcome: string, ok: boolean) => {
        busy -= 1;
        refreshDot();
        row.dataset.ok = String(ok);
        const result = row.querySelector('.res');
        if (result) result.textContent = `${outcome} · ${Date.now() - started}ms`;
      };
    },

    note(value: string, tone: 'info' | 'deny' = 'info') {
      const row = document.createElement('li');
      row.dataset.ok = String(tone !== 'deny');
      row.append(text('span', 'tag', tone === 'deny' ? 'blocked' : 'note'), text('span', 'what', value));
      appendLog(row);
    }
  };
}
