import { describe, expect, it } from "vitest";
import { TOTP, Secret } from "otpauth";
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode } from "./totp";

describe("generateTotpSecret", () => {
  it("generates a fresh base32 secret every time", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+=*$/);
  });
});

describe("buildOtpauthUri", () => {
  it("builds an otpauth:// URI carrying the issuer and the user's email", () => {
    const uri = buildOtpauthUri(generateTotpSecret(), "fabio@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent("Personal Money Manager"));
    expect(uri).toContain(encodeURIComponent("fabio@example.com"));
  });
});

describe("verifyTotpCode", () => {
  it("accepts the code an authenticator app would currently show for this secret", () => {
    const secret = generateTotpSecret();
    const code = new TOTP({ digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
    expect(verifyTotpCode(secret, "fabio@example.com", code)).toBe(true);
  });

  it("rejects a code that doesn't match the secret at all", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "fabio@example.com", "000000")).toBe(false);
  });

  it("rejects a valid-looking code generated from a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = new TOTP({ digits: 6, period: 30, secret: Secret.fromBase32(secretB) }).generate();
    expect(verifyTotpCode(secretA, "fabio@example.com", codeForB)).toBe(false);
  });
});
