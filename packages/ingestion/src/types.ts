import type {
  AccountKind,
  Category,
  CategorySource,
  ConnectionId,
  ISODate,
  TransactionSource,
  UserId,
} from "@platform/financial-core";

/** A provider connection (generalizes the legacy plaid_items row). */
export interface ProviderConnection {
  readonly id: ConnectionId;
  readonly userId: UserId;
  readonly provider: string;
  readonly externalItemId: string;
  readonly institutionName: string | null;
  /** Supabase Vault secret id holding the provider access token. */
  readonly accessTokenSecretId: string;
  readonly cursor: string | null;
  readonly status: "ok" | "login_required" | "error";
}

export interface ConnectionStore {
  list(userId: UserId): Promise<ProviderConnection[]>;
  update(
    id: ConnectionId,
    patch: {
      readonly cursor?: string | null;
      readonly status?: ProviderConnection["status"];
      readonly lastSyncedAt?: Date;
    },
  ): Promise<void>;
}

/** Resolves a Vault secret id to the actual provider access token. */
export interface AccessTokenStore {
  getToken(secretId: string): Promise<string>;
}

/** Account as the provider reports it — minor units, platform sign convention. */
export interface ProviderAccount {
  readonly externalId: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly subtype?: string;
  readonly mask?: string;
  readonly balanceMinor: number | null;
  readonly creditLimitMinor?: number | null;
}

/** Transaction as the provider reports it — minor units, SIGNED, negative = outflow. */
export interface ProviderTransaction {
  readonly externalAccountId: string;
  readonly sourceTxnId: string;
  readonly postedAt: ISODate;
  readonly authorizedAt?: ISODate;
  readonly description: string;
  readonly merchant?: string;
  readonly amountMinor: number;
  readonly pending: boolean;
  readonly sourceCategoryDetailed?: string;
  readonly sourceCategoryPrimary?: string;
}

export interface SyncPage {
  readonly added: readonly ProviderTransaction[];
  readonly modified: readonly ProviderTransaction[];
  readonly removedSourceTxnIds: readonly string[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * The provider abstraction, modeled on Plaid's cursor sync because it is the
 * general shape (CSV imports are a degenerate single page).
 */
export interface TransactionProvider {
  readonly source: TransactionSource;
  fetchAccounts(accessToken: string): Promise<ProviderAccount[]>;
  syncPage(accessToken: string, cursor: string | null): Promise<SyncPage>;
}

/** A learned per-user rule: 'user' origin is a correction (law), 'ai' the scribe's memory. */
export interface UserRule {
  readonly category: Category;
  readonly origin: "ai" | "user";
}

export type CategorizeFn = (
  detailed: string | null,
  primary: string | null,
  merchant: string | null,
  description: string,
) => { category: Category; source: CategorySource };
