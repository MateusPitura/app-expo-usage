import type { ServiceAccount } from './types';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Signs `signingInput` with RS256 and returns the signature as base64url. */
export type Rs256Signer = (signingInput: string, privateKeyPem: string) => string | Promise<string>;

export interface AuthDeps {
  fetch: typeof fetch;
  sign: Rs256Signer;
  /** epoch seconds; injectable for tests */
  nowSeconds?: () => number;
}

/** Parses and validates a service-account key file (the JSON you download from Google Cloud). */
export function parseServiceAccount(json: string): ServiceAccount {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That is not valid JSON. Paste the full contents of the service-account key file.');
  }
  if (!data || typeof data !== 'object') throw new Error('Unexpected JSON structure.');
  if (data.type && data.type !== 'service_account') {
    throw new Error(`This key has type "${data.type}", expected "service_account".`);
  }
  const email = typeof data.client_email === 'string' ? data.client_email.trim() : '';
  let key = typeof data.private_key === 'string' ? data.private_key : '';
  if (!email) throw new Error('The JSON has no "client_email".');
  if (!key) throw new Error('The JSON has no "private_key".');
  // Tolerate keys whose newlines were escaped twice when copy-pasted.
  key = key.replace(/\\n/g, '\n').trim();
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(key)) {
    throw new Error('"private_key" is not a PEM private key.');
  }
  return { client_email: email, private_key: key };
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Dependency-free base64url of a string's UTF-8 bytes (no btoa/TextEncoder needed). */
export function b64urlFromString(s: string): string {
  const bytes: number[] = [];
  const utf8 = unescape(encodeURIComponent(s)); // JS string -> UTF-8 "binary" string
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

export async function buildSignedJwt(sa: ServiceAccount, sign: Rs256Signer, iat: number): Promise<string> {
  const header = b64urlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlFromString(
    JSON.stringify({
      iss: sa.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    })
  );
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${await sign(signingInput, sa.private_key)}`;
}

interface CachedToken {
  email: string;
  token: string;
  expiresAt: number; // epoch seconds
}
let cache: CachedToken | null = null;

export function clearTokenCache() {
  cache = null;
}

/** Exchanges a signed JWT for an OAuth access token (cached until shortly before expiry). */
export async function getAccessToken(sa: ServiceAccount, deps: AuthDeps): Promise<string> {
  const now = (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))();
  if (cache && cache.email === sa.client_email && cache.expiresAt - 60 > now) return cache.token;

  const assertion = await buildSignedJwt(sa, deps.sign, now);
  const res = await deps.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=' +
      encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' +
      encodeURIComponent(assertion),
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok || !body.access_token) {
    const detail = body.error_description || body.error || text.slice(0, 200);
    throw new Error(`Google sign-in failed (${res.status}): ${detail}`);
  }
  cache = {
    email: sa.client_email,
    token: body.access_token,
    expiresAt: now + (Number(body.expires_in) || 3600),
  };
  return cache.token;
}
