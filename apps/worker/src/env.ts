import type { ISODate, UserId } from "@platform/financial-core";
import { isoDate, userId } from "@platform/financial-core";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function platformUser(): UserId {
  return userId(requireEnv("PLATFORM_USER_ID"));
}

/** Today as a UTC calendar date — the single place the worker reads a clock for dates. */
export function todayUtc(): ISODate {
  return isoDate(new Date().toISOString().slice(0, 10));
}
