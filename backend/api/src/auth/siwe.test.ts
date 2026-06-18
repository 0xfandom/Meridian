import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { NonceStore, verifySiwe } from "./siwe.js";

const NOW = 1_700_000_000;
const DOMAIN = "example.com";
const CHAIN = 1;

// Deterministic local test keys (anvil defaults), never used outside tests.
const user = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const other = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

function message(nonce: string): string {
  return createSiweMessage({
    address: user.address,
    domain: DOMAIN,
    uri: "https://example.com",
    version: "1",
    chainId: CHAIN,
    nonce,
    issuedAt: new Date(NOW * 1000),
  });
}

describe("verifySiwe", () => {
  it("accepts a valid signed message and consumes the nonce", async () => {
    const nonces = new NonceStore();
    const nonce = nonces.issue(NOW, 300);
    const msg = message(nonce);
    const signature = await user.signMessage({ message: msg });

    const res = await verifySiwe({
      message: msg,
      signature,
      domain: DOMAIN,
      chainId: CHAIN,
      nonces,
      now: NOW,
    });
    expect(res.ok).toBe(true);
    expect(res.address?.toLowerCase()).toBe(user.address.toLowerCase());

    const replay = await verifySiwe({
      message: msg,
      signature,
      domain: DOMAIN,
      chainId: CHAIN,
      nonces,
      now: NOW,
    });
    expect(replay.ok).toBe(false); // nonce already consumed
  });

  it("rejects a domain mismatch", async () => {
    const nonces = new NonceStore();
    const nonce = nonces.issue(NOW, 300);
    const msg = message(nonce);
    const signature = await user.signMessage({ message: msg });

    const res = await verifySiwe({
      message: msg,
      signature,
      domain: "evil.com",
      chainId: CHAIN,
      nonces,
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown nonce", async () => {
    const nonces = new NonceStore();
    const msg = message("neverissuednonce");
    const signature = await user.signMessage({ message: msg });

    const res = await verifySiwe({
      message: msg,
      signature,
      domain: DOMAIN,
      chainId: CHAIN,
      nonces,
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a signature from the wrong signer", async () => {
    const nonces = new NonceStore();
    const nonce = nonces.issue(NOW, 300);
    const msg = message(nonce);
    const wrong = await other.signMessage({ message: msg });

    const res = await verifySiwe({
      message: msg,
      signature: wrong,
      domain: DOMAIN,
      chainId: CHAIN,
      nonces,
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });
});
