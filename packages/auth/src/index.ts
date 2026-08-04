import type { UserId } from "@platform/financial-core";
import { userId } from "@platform/financial-core";
import type { JWTVerifyGetKey } from "jose";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthenticatedUser {
  readonly userId: UserId;
  readonly email?: string;
}

export interface JwtVerifier {
  /** Verifies a bearer token; throws on anything invalid. */
  verify(token: string): Promise<AuthenticatedUser>;
}

export class AuthError extends Error {}

export interface SupabaseVerifierOptions {
  /** Project base URL, e.g. https://xxxx.supabase.co */
  readonly supabaseUrl: string;
  /** Injectable key resolver for tests; defaults to the project's remote JWKS. */
  readonly getKey?: JWTVerifyGetKey;
}

/**
 * Verifies Supabase Auth JWTs against the project's JWKS (asymmetric signing
 * keys — ES256). The shared HS256 secret never leaves Supabase.
 */
export function createSupabaseJwtVerifier(options: SupabaseVerifierOptions): JwtVerifier {
  const issuer = `${options.supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
  const getKey = options.getKey ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return {
    async verify(token: string) {
      let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
      try {
        ({ payload } = await jwtVerify(token, getKey, {
          issuer,
          audience: "authenticated",
        }));
      } catch (error) {
        throw new AuthError(`Invalid token: ${error instanceof Error ? error.message : error}`);
      }
      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new AuthError("Invalid token: missing sub");
      }
      return {
        userId: userId(payload.sub),
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
      };
    },
  };
}
