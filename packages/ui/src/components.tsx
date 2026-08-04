import type { ReactNode } from "react";
import { fmtMoney } from "./format.js";
import type { ApiMoney } from "./types.js";

/** Theme-agnostic primitives; products supply their look via classNames. */

export function Section({
  title,
  children,
  headingClassName = "mb-3 text-lg font-semibold",
}: {
  title: string;
  children: ReactNode;
  headingClassName?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className={headingClassName}>{title}</h2>
      {children}
    </section>
  );
}

export function Amount({
  m,
  signed = false,
  positiveClassName = "text-emerald-600",
}: {
  m: ApiMoney;
  signed?: boolean;
  positiveClassName?: string;
}) {
  const cls = signed && m.amountMinor > 0 ? positiveClassName : "";
  return <span className={`tabular-nums ${cls}`}>{fmtMoney(m)}</span>;
}

export function Table({
  rows,
  empty,
  borderClassName = "border-zinc-200 dark:border-zinc-800",
  emptyClassName = "text-sm opacity-60",
}: {
  rows: ReactNode[][];
  empty: string;
  borderClassName?: string;
  emptyClassName?: string;
}) {
  if (rows.length === 0) {
    return empty ? <p className={emptyClassName}>{empty}</p> : null;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((cells, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: display-only rows
          <tr key={i} className={`border-b last:border-0 ${borderClassName}`}>
            {cells.map((c, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: display-only cells
              <td key={j} className={`py-2 pr-3 ${j === cells.length - 1 ? "text-right" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
