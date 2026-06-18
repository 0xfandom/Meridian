import { describe, expect, it } from "vitest";
import { issueSession, verifySession } from "./session.js";

const SECRET = "test-secret";
const NOW = 1_700_000_000;

describe("session tokens", () => {
  it("round-trips an issued session", () => {
    const token = issueSession("0xAbC0000000000000000000000000000000000001", 3600, SECRET, NOW);
    const session = verifySession(token, SECRET, NOW);
    expect(session).not.toBeNull();
    expect(session!.address).toBe("0xabc0000000000000000000000000000000000001"); // lowercased
    expect(session!.exp).toBe(NOW + 3600);
  });

  it("rejects a tampered payload", () => {
    const token = issueSession("0xabc0000000000000000000000000000000000001", 3600, SECRET, NOW);
    const tampered = token.replace(
      /^[^.]+/,
      Buffer.from('{"address":"0xevil","exp":9999999999}').toString("base64url"),
    );
    expect(verifySession(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects the wrong secret and expired tokens", () => {
    const token = issueSession("0xabc0000000000000000000000000000000000001", 3600, SECRET, NOW);
    expect(verifySession(token, "other-secret", NOW)).toBeNull();
    expect(verifySession(token, SECRET, NOW + 3601)).toBeNull();
  });
});
