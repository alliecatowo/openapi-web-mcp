import { describe, expect, it } from 'vitest';
import { isSensitiveName } from '../../src/openapi/sanitize.js';

/**
 * `isSensitiveName` is the one function every credential-name exclusion in
 * this codebase (parameters, request-body properties, response headers,
 * authorized-header redaction, live-value reads) is built on. A prior code
 * review found it was never applied to request-body properties at all; while
 * fixing that, a second, more basic gap turned up: the function itself never
 * matched the literal word "password", and its "ends in -key" regex only
 * recognized a hyphen/underscore before "key" (fine for header-style names
 * like `X-API-Key`, but JSON body properties are conventionally camelCase,
 * e.g. `apiKey`, with no separator for the regex to find). Both cases below
 * reproduce that: they are exactly the two examples used to motivate the
 * original body-property fix.
 */
describe('isSensitiveName', () => {
  it('matches the literal word "password", standalone or embedded', () => {
    expect(isSensitiveName('password')).toBe(true);
    expect(isSensitiveName('Password')).toBe(true);
    expect(isSensitiveName('userPassword')).toBe(true);
    expect(isSensitiveName('password_confirmation')).toBe(true);
  });

  it('matches camelCase names ending in "Key", not only hyphenated ones', () => {
    expect(isSensitiveName('apiKey')).toBe(true);
    expect(isSensitiveName('api-key')).toBe(true);
    expect(isSensitiveName('api_key')).toBe(true);
    expect(isSensitiveName('X-API-Key')).toBe(true);
    expect(isSensitiveName('secretKey')).toBe(true);
  });

  it('still matches the previously-covered reserved names', () => {
    for (const name of ['authorization', 'Authorization', 'proxy-authorization', 'cookie', 'set-cookie', 'token', 'secret', 'clientSecret']) {
      expect(isSensitiveName(name)).toBe(true);
    }
  });

  it('does not flag ordinary field names that merely contain short substrings', () => {
    expect(isSensitiveName('monkey')).toBe(false);
    expect(isSensitiveName('displayName')).toBe(false);
    expect(isSensitiveName('username')).toBe(false);
    expect(isSensitiveName('title')).toBe(false);
  });
});
