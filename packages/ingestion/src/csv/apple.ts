import { createHash } from "node:crypto";
import type {
  AccountId,
  ISODate,
  NewTransaction,
  TransactionRepository,
  UserId,
} from "@platform/financial-core";
import { isoDate, minorFromDecimalString, negate } from "@platform/financial-core";
import type { CategorizeFn } from "../types.js";

/**
 * Apple Card statement CSV importer. Columns (as exported by Wallet):
 * Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD), ...
 *
 * Sign convention: Apple reports purchases as positive and payments as
 * negative; the platform stores negative = outflow, so every amount is negated.
 * sourceTxnId is a content hash of the identifying fields (stable across
 * re-imports of overlapping statements).
 */
export interface AppleCsvRow {
  readonly transactionDate: ISODate;
  readonly description: string;
  readonly merchant: string;
  readonly category: string;
  readonly type: string;
  readonly amountRaw: string;
  readonly sourceTxnId: string;
}

export function parseAppleCardCsv(csvText: string): AppleCsvRow[] {
  const rows = parseCsv(csvText);
  const header = rows[0];
  if (header === undefined) return [];
  const col = (name: string): number => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (i === -1) throw new TypeError(`Apple Card CSV is missing the "${name}" column`);
    return i;
  };
  const iDate = col("Transaction Date");
  const iDesc = col("Description");
  const iMerchant = col("Merchant");
  const iCategory = col("Category");
  const iType = col("Type");
  const iAmount = col("Amount (USD)");

  return rows.slice(1).flatMap((cells) => {
    if (cells.every((c) => c.trim() === "")) return [];
    const rawDate = cells[iDate] ?? "";
    const amountRaw = cells[iAmount] ?? "";
    const description = cells[iDesc] ?? "";
    const merchant = cells[iMerchant] ?? "";
    const row: AppleCsvRow = {
      transactionDate: usDateToIso(rawDate),
      description,
      merchant,
      category: cells[iCategory] ?? "",
      type: cells[iType] ?? "",
      amountRaw,
      sourceTxnId: createHash("sha256")
        .update([rawDate, description, merchant, amountRaw].join("|"))
        .digest("hex"),
    };
    return [row];
  });
}

export async function importAppleCardCsv(
  userId: UserId,
  accountId: AccountId,
  csvText: string,
  categorize: CategorizeFn,
  transactionRepo: TransactionRepository,
): Promise<{ imported: number }> {
  const rows = parseAppleCardCsv(csvText);
  const txns: NewTransaction[] = rows.map((row) => {
    const verdict = categorize(null, row.category, row.merchant, row.description);
    return {
      userId,
      accountId,
      source: "apple_csv",
      sourceTxnId: row.sourceTxnId,
      postedAt: row.transactionDate,
      description: row.description,
      merchant: row.merchant,
      // Apple: positive = purchase (outflow) -> platform: negative = outflow.
      amount: negate(minorFromDecimalString(row.amountRaw)),
      pending: false,
      category: verdict.category,
      categorySource: verdict.source,
      sourceCategory: row.category,
    };
  });
  await transactionRepo.upsertMany(userId, txns);
  return { imported: txns.length };
}

/** "MM/DD/YYYY" -> ISODate. */
function usDateToIso(us: string): ISODate {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us.trim());
  if (!match) throw new TypeError(`Not a MM/DD/YYYY date: "${us}"`);
  return isoDate(`${match[3]}-${match[1]}-${match[2]}`);
}

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF/LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
