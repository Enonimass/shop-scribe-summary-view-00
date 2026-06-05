// Client-side session helpers. Persists either to localStorage ("remember me")
// or sessionStorage (default). Decodes HMAC token payload to check expiry.
const PERSIST_KEY = 'sessionPersist';

function persistMode(): 'local' | 'session' {
  return (localStorage.getItem(PERSIST_KEY) as any) === 'local' ? 'local' : 'session';
}
function storeFor(mode: 'local' | 'session'): Storage {
  return mode === 'local' ? localStorage : sessionStorage;
}

export function getStored(key: string): string | null {
  // Look in both so a value written by either mode is found.
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}
export function setStored(key: string, value: string, remember: boolean) {
  const mode = remember ? 'local' : 'session';
  localStorage.setItem(PERSIST_KEY, mode);
  storeFor(mode).setItem(key, value);
  // Remove from the other store to keep a single source of truth.
  (mode === 'local' ? sessionStorage : localStorage).removeItem(key);
}
export function clearStored(keys: string[]) {
  keys.forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}
export function rememberPreferred(): boolean {
  return persistMode() === 'local';
}

// Decode the JWT-style payload of our HMAC session token. No signature
// verification on the client — the server re-verifies on every call.
export interface SessionClaims {
  sub: string;
  role: string;
  shop_id?: string | null;
  exp: number;
}
export function decodeSessionToken(token: string | null | undefined): SessionClaims | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const [payload] = token.split('.');
    let s = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const json = atob(s);
    const claims = JSON.parse(json) as SessionClaims;
    if (!claims?.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
export function isTokenValid(token: string | null | undefined): boolean {
  const c = decodeSessionToken(token);
  if (!c) return false;
  return c.exp > Math.floor(Date.now() / 1000);
}

export function clearSession() {
  clearStored(['currentUser', 'sessionToken']);
}
