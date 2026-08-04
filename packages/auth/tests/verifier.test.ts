import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createLocalJWKSet } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, type JwtVerifier, createSupabaseJwtVerifier } from "../src/index.js";

const SUPABASE_URL = "https://example.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;

let sign: (mutate?: (jwt: SignJWT) => SignJWT, sub?: string) => Promise<string>;
let verifier: JwtVerifier;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  verifier = createSupabaseJwtVerifier({
    supabaseUrl: SUPABASE_URL,
    getKey: createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256", use: "sig" }] }),
  });
  sign = async (mutate = (j) => j, sub = "4039c55f-bec0-421a-b764-11ce67406a5f") => {
    const jwt = new SignJWT({ email: "cole@twoboxes.com" })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject(sub)
      .setIssuer(ISSUER)
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("5m");
    return mutate(jwt).sign(privateKey);
  };
});

describe("createSupabaseJwtVerifier", () => {
  it("accepts a valid token and extracts user id + email", async () => {
    const user = await verifier.verify(await sign());
    expect(user.userId).toBe("4039c55f-bec0-421a-b764-11ce67406a5f");
    expect(user.email).toBe("cole@twoboxes.com");
  });

  it("rejects a wrong issuer", async () => {
    const token = await sign((j) => j.setIssuer("https://evil.example.com/auth/v1"));
    await expect(verifier.verify(token)).rejects.toThrow(AuthError);
  });

  it("rejects a wrong audience", async () => {
    const token = await sign((j) => j.setAudience("service_role"));
    await expect(verifier.verify(token)).rejects.toThrow(AuthError);
  });

  it("rejects an expired token", async () => {
    const token = await sign((j) => j.setExpirationTime(Math.floor(Date.now() / 1000) - 60));
    await expect(verifier.verify(token)).rejects.toThrow(AuthError);
  });

  it("rejects garbage", async () => {
    await expect(verifier.verify("not-a-jwt")).rejects.toThrow(AuthError);
  });

  it("rejects a missing sub", async () => {
    const token = await sign((j) => j, "");
    await expect(verifier.verify(token)).rejects.toThrow(AuthError);
  });
});
