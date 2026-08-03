import type { Brand } from "./brand.js";

export type UserId = Brand<string, "UserId">;
export type AccountId = Brand<string, "AccountId">;
export type TransactionId = Brand<string, "TransactionId">;
export type GoalId = Brand<string, "GoalId">;
export type ConnectionId = Brand<string, "ConnectionId">;

function id<T extends string>(value: string, kind: string): Brand<string, T> {
  if (value.length === 0) {
    throw new TypeError(`${kind} must not be empty`);
  }
  return value as Brand<string, T>;
}

export const userId = (v: string): UserId => id(v, "UserId");
export const accountId = (v: string): AccountId => id(v, "AccountId");
export const transactionId = (v: string): TransactionId => id(v, "TransactionId");
export const goalId = (v: string): GoalId => id(v, "GoalId");
export const connectionId = (v: string): ConnectionId => id(v, "ConnectionId");
