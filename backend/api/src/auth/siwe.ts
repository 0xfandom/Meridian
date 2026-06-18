import { verifyMessage } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import type { Address } from "../state/types.js";

/// In-memory single-use nonce store. Nonces are issued for SIWE challenges and consumed on verify,
/// so a captured signature cannot be replayed. Bounded by TTL; a distributed store replaces this in
/// a multi-instance deployment.
export class NonceStore {
  private readonly nonces = new Map<string, number>();

  issue(now: number, ttlSeconds: number): string {
    this.sweep(now);
    const nonce = generateSiweNonce();
    this.nonces.set(nonce, now + ttlSeconds);
    return nonce;
  }

  consume(nonce: string, now: number): boolean {
    const expiry = this.nonces.get(nonce);
    if (expiry === undefined) return false;
    this.nonces.delete(nonce);
    return expiry >= now;
  }

  private sweep(now: number): void {
    for (const [nonce, expiry] of this.nonces) {
      if (expiry < now) this.nonces.delete(nonce);
    }
  }
}

export interface SiweResult {
  ok: boolean;
  address?: Address;
  reason?: string;
}

/// Validates a SIWE login: parses the message, enforces domain / chain / single-use nonce, and
/// recovers the signer for an externally-owned account. Smart-contract (ERC-1271) accounts, which
/// need a chain client, are a deliberate follow-up.
export async function verifySiwe(params: {
  message: string;
  signature: `0x${string}`;
  domain: string;
  chainId: number;
  nonces: NonceStore;
  now: number;
}): Promise<SiweResult> {
  let fields: ReturnType<typeof parseSiweMessage>;
  try {
    fields = parseSiweMessage(params.message);
  } catch {
    return { ok: false, reason: "unparseable message" };
  }

  if (!fields.address) return { ok: false, reason: "missing address" };
  if (fields.domain !== params.domain) return { ok: false, reason: "domain mismatch" };
  if (fields.chainId !== params.chainId) return { ok: false, reason: "chain mismatch" };
  if (!fields.nonce || !params.nonces.consume(fields.nonce, params.now)) {
    return { ok: false, reason: "invalid or used nonce" };
  }
  if (fields.expirationTime && fields.expirationTime.getTime() < params.now * 1000) {
    return { ok: false, reason: "message expired" };
  }

  const valid = await verifyMessage({
    address: fields.address,
    message: params.message,
    signature: params.signature,
  });
  if (!valid) return { ok: false, reason: "bad signature" };

  return { ok: true, address: fields.address };
}
