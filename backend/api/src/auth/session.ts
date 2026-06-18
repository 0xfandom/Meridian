import { createHmac, timingSafeEqual } from "node:crypto";

export interface Session {
  address: string;
  exp: number; // unix seconds
}

/// Issues a stateless session token: base64url(payload).hmac, signed with the server secret. The
/// caller supplies `now` (unix seconds) so issuance and verification are deterministic in tests.
export function issueSession(
  address: string,
  ttlSeconds: number,
  secret: string,
  now: number,
): string {
  const payload: Session = { address: address.toLowerCase(), exp: now + ttlSeconds };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string, secret: string, now: number): Session | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(body, secret))) return null;

  let payload: Session;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
