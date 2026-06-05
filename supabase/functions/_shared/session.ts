// Lightweight HMAC session token for the app's custom auth.
// Format: base64url(payloadJson).base64url(sig)
// payload = { sub, role, shop_id, exp }
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function b64uDecode(s: string): Uint8Array {
  s = s.replaceAll("-", "+").replaceAll("_", "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return await crypto.subtle.importKey(
    "raw",
    enc.encode("kimp-session:" + secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SessionClaims {
  sub: string;        // profile id
  role: string;       // role string
  shop_id?: string | null;
  exp: number;        // unix seconds
}

export async function issueSessionToken(
  claims: Omit<SessionClaims, "exp">,
  ttlSeconds = 60 * 60 * 12,
): Promise<string> {
  const full: SessionClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = b64u(enc.encode(JSON.stringify(full)));
  const key = await getKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${b64u(sig)}`;
}

export async function verifySessionToken(token: string | null | undefined): Promise<SessionClaims | null> {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sigB] = token.split(".");
  if (!payload || !sigB) return null;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify("HMAC", key, b64uDecode(sigB), enc.encode(payload));
    if (!ok) return null;
    const claims = JSON.parse(dec.decode(b64uDecode(payload))) as SessionClaims;
    if (!claims?.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return null;
}
