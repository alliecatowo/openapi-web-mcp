import SwaggerUI from 'swagger-ui';
import SwaggerUIWebMCP, { agentExecution } from 'swagger-ui-webmcp';
import 'swagger-ui/dist/swagger-ui.css';
import './style.css';

const statusText = document.querySelector('#status')!;
const sessionBox = document.querySelector('#session')!;

/**
 * The demo lets you cap direct tools from the URL (`?maxTools=5`) so the large
 * document fallback — discovery tools only — can be shown without editing code.
 */
const params = new URLSearchParams(location.search);
const maxDirectOperationTools = Number(params.get('maxTools')) || 64;
const initialSpec = params.get('spec') || '/openapi.yaml';

async function refreshSession() {
  const response = await fetch('/api/session/me', { credentials: 'include' });

  if (response.ok) {
    const user = await response.json();
    sessionBox.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'Signed in as ';
    const email = document.createElement('strong');
    email.textContent = user.email;
    const signOut = document.createElement('button');
    signOut.type = 'button';
    signOut.textContent = 'Sign out';
    signOut.addEventListener('click', async () => {
      await fetch('/api/session/logout', { method: 'POST', credentials: 'include' });
      location.reload();
    });
    sessionBox.append(label, email, signOut);
    return;
  }

  sessionBox.replaceChildren();
  const label = document.createElement('span');
  label.textContent = 'Demo session: signed out ';
  const signIn = document.createElement('button');
  signIn.type = 'button';
  signIn.id = 'login';
  signIn.textContent = 'Sign in';
  signIn.addEventListener('click', async () => {
    await fetch('/api/session/login', { method: 'POST', credentials: 'include' });
    location.reload();
  });
  sessionBox.append(label, signIn);
}

const ui = SwaggerUI({
  dom_id: '#swagger-ui',
  url: initialSpec,
  withCredentials: true,
  plugins: [SwaggerUIWebMCP],
  // Requests are identical whoever makes them, so the demo tags agent-driven
  // ones to show them apart in the audit log. The plugin only reports which
  // operation it is running; it never touches credentials.
  requestInterceptor: (request: any) => {
    if (agentExecution.current) request.headers['X-Waypoint-Client'] = 'webmcp-agent';
    return request;
  },
  webMcp: {
    enabled: true,
    maxDirectOperationTools,
    // This demo publishes both the page and the document, so `x-webmcp` in the
    // document is authoritative. The safe default is to let it only tighten.
    trustSpecAnnotations: true,
    exposure: 'write'
  },
  onComplete: () => {
    statusText.textContent = (document as any).modelContext
      ? 'WebMCP active'
      : 'Swagger ready · WebMCP activates when the browser supports it';
  }
} as any);

// Exposed for the end-to-end tests to introspect the live Swagger system.
(window as any).__ui = ui;

/** Load a different OpenAPI document into the live Swagger session. */
function loadSpec(url: string) {
  statusText.textContent = 'Loading document…';
  (ui as any).specActions.updateUrl(url);
  (ui as any).specActions.download(url);
  for (const chip of document.querySelectorAll('.chip')) {
    chip.classList.toggle('is-active', chip.getAttribute('data-spec') === url);
  }
}

for (const chip of document.querySelectorAll<HTMLButtonElement>('.chip')) {
  chip.addEventListener('click', () => loadSpec(chip.dataset.spec!));
}

document.querySelector<HTMLFormElement>('#specForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>('#specUrl');
  if (input?.value) loadSpec(input.value);
});

void refreshSession();
