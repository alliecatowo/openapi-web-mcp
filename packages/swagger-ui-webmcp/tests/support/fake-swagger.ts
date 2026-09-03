/**
 * A stand-in for the parts of the Swagger UI system the plugin actually uses.
 *
 * It mirrors the real contract discovered against Swagger UI 5.32.14:
 *  - arguments are written into the store with `changeParam` / `setRequestBodyValue`
 *  - `execute` needs the resolved operation node and returns nothing useful
 *  - the response is read back out of `responseFor`, as a fresh Immutable-like
 *    value whose identity changes on each execution
 */

export interface RecordedRequest {
  method: string;
  path: string;
  params: Record<string, unknown>;
  body?: unknown;
  contentType?: string;
}

export interface FakeSwagger {
  requests: RecordedRequest[];
  /** Choose the response for the next execution. */
  respondWith: (response: { status: number; body?: unknown; headers?: Record<string, string> }) => void;
  /** Mark schemes authorized, as Swagger UI's authorize dialog would. */
  authorize: (...schemes: Array<{ name: string; type?: string } | string>) => void;
  /** Type into Try-it-out fields exactly as a person would, through the store. */
  typeParam: (path: string, method: string, name: string, location: string, value: unknown) => void;
  typeBody: (path: string, method: string, value: string, contentType?: string) => void;
  system: any;
}

const immutableLike = (value: any): any => ({
  toJS: () => value,
  // Immutable collections expose `size`; the adapter uses it to tell whether
  // an operation's parameters have finished resolving.
  size: Array.isArray(value) ? value.length : undefined,
  getIn: (keyPath: string[]) => {
    let node = value;
    for (const key of keyPath) {
      if (node == null) return undefined;
      node = node[key];
    }
    return node === undefined ? undefined : immutableLike(node);
  }
});

export function fakeSwagger(spec: any, options: { withCredentials?: boolean } = {}): FakeSwagger {
  const requests: RecordedRequest[] = [];
  /** Path items whose parameters have been merged into their operations. */
  const resolvedPaths = new Set<string>();
  const params = new Map<string, unknown>();
  const bodies = new Map<string, { value: string; contentType?: string }>();
  const responses = new Map<string, { toJS: () => any }>();

  let nextResponse: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 200,
    body: { ok: true },
    headers: { 'content-type': 'application/json' }
  };

  let authorized: Record<string, { schema: { type: string } }> = {};

  const key = (path: string, method: string) => `${path}|${method}`;

  /** The spec as Swagger would present it, given what has been resolved so far. */
  function resolvedView() {
    const paths: Record<string, any> = {};
    for (const [path, item] of Object.entries<any>(spec.paths || {})) {
      const shared = resolvedPaths.has(path) ? item.parameters || [] : [];
      const next: Record<string, any> = {};
      for (const [name, node] of Object.entries<any>(item)) {
        if (name === 'parameters') continue;
        next[name] = shared.length ? { ...node, parameters: [...shared, ...(node.parameters || [])] } : node;
      }
      paths[path] = next;
    }
    return { ...spec, paths };
  }

  const system: any = {
    specSelectors: {
      specJson: () => spec,
      // Mirrors Swagger: parameters declared on the path item only appear on the
      // operation once the path item itself has been resolved.
      specJsonWithResolvedSubtrees: () => immutableLike(resolvedView()),
      responseFor: (path: string, method: string) => responses.get(key(path, method)),
      specUrl: () => 'https://docs.test/openapi.yaml',
      // Mirrors Swagger's parameterWithMeta: the value the person typed into
      // the operation's Try-it-out field, if any.
      parameterWithMeta: (pathMethod: string[], name: string, location: string) => ({
        get: (field: string) =>
          field === 'value' ? params.get(`${key(pathMethod[0], pathMethod[1])}|${location}|${name}`) : undefined
      })
    },
    specActions: {
      requestResolvedSubtree: async (keyPath: string[]) => {
        if (keyPath?.[0] === 'paths' && keyPath.length === 2) resolvedPaths.add(keyPath[1]);
      },
      changeParam: (pathMethod: string[], name: string, location: string, value: unknown) => {
        params.set(`${key(pathMethod[0], pathMethod[1])}|${location}|${name}`, value);
      },
      execute: ({ path, method, operation }: any) => {
        // Swagger only sends values for parameters present on the resolved
        // operation, so an unresolved path-level parameter is silently dropped.
        const declared: any[] = operation?.toJS?.()?.parameters || [];
        // The real action throws when handed a plain object here; assert the
        // adapter passes the resolved node so that regression cannot return.
        if (!operation || typeof operation.toJS !== 'function') {
          throw new TypeError('operation.toJS is not a function');
        }

        const prefix = `${key(path, method)}|`;
        const collected: Record<string, unknown> = {};
        for (const [name, value] of params) {
          if (!name.startsWith(prefix)) continue;
          const [location, paramName] = name.slice(prefix.length).split('|');
          if (!declared.some((p) => p.name === paramName && p.in === location)) continue;
          collected[`${location}.${paramName}`] = value;
        }
        const body = bodies.get(key(path, method));

        requests.push({
          method,
          path,
          params: collected,
          body: body ? JSON.parse(body.value) : undefined,
          contentType: body?.contentType
        });

        responses.set(
          key(path, method),
          immutableLike({
            ok: nextResponse.status < 400,
            url: `https://api.test${path}`,
            status: nextResponse.status,
            statusText: 'OK',
            headers: nextResponse.headers,
            body: nextResponse.body
          })
        );
        return undefined;
      }
    },
    oas3Actions: {
      setRequestContentType: ({ value, pathMethod }: any) => {
        const existing = bodies.get(key(pathMethod[0], pathMethod[1]));
        bodies.set(key(pathMethod[0], pathMethod[1]), { value: existing?.value ?? '{}', contentType: value });
      },
      setRequestBodyValue: ({ value, pathMethod }: any) => {
        const existing = bodies.get(key(pathMethod[0], pathMethod[1]));
        bodies.set(key(pathMethod[0], pathMethod[1]), { value, contentType: existing?.contentType });
      }
    },
    oas3Selectors: {
      requestBodyValue: (path: string, method: string) => bodies.get(key(path, method))?.value,
      requestContentType: (path: string, method: string) => bodies.get(key(path, method))?.contentType
    },
    authSelectors: { authorized: () => authorized },
    getConfigs: () => ({ withCredentials: options.withCredentials ?? true })
  };

  return {
    requests,
    respondWith: (response) => {
      nextResponse = {
        status: response.status,
        body: response.body ?? {},
        headers: response.headers ?? { 'content-type': 'application/json' }
      };
    },    authorize: (...schemes) => {
      authorized = Object.fromEntries(
        schemes.map((scheme) =>
          typeof scheme === 'string' ? [scheme, { schema: { type: 'unknown' } }] : [scheme.name, { schema: { type: scheme.type ?? 'unknown' } }]
        )
      );
    },
    typeParam: (path, method, name, location, value) => {
      system.specActions.changeParam([path, method], name, location, value, false);
    },
    typeBody: (path, method, value, contentType) => {
      if (contentType) system.oas3Actions.setRequestContentType({ value: contentType, pathMethod: [path, method] });
      system.oas3Actions.setRequestBodyValue({ value, pathMethod: [path, method] });
    },
    system
  };
}
