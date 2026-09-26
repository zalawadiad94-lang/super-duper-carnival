import { formatDay } from "@/lib/format";
import type { BalanceTone } from "@/lib/model";
import { Money } from "@/components/money";

export type LedgerRow = {
  id: string;
  date: string;
  title: string;
  note: string;
  extra?: string;
  gave: number | null;
  got: number | null;
  balance?: { title: string; tone: BalanceTone; amount: number };
  onOpen?: () => void;
};

export function LedgerTable({ rows, showBalance = true }: { rows: LedgerRow[]; showBalance?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-brass-soft text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-3 py-3 font-semibold">Particulars</th>
            <th className="px-3 py-3 text-right font-semibold">You gave</th>
            <th className="px-3 py-3 text-right font-semibold">You got</th>
            {showBalance ? <th className="px-4 py-3 text-right font-semibold">Balance</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={row.onOpen ? 0 : undefined}
              onClick={row.onOpen}
              onKeyDown={(event) => {
                if (!row.onOpen) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  row.onOpen();
                }
              }}
              className={row.onOpen ? "cursor-pointer border-t border-line hover:bg-brass-soft" : "border-t border-line"}
            >
              <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDay(row.date)}</td>
              <td className="px-3 py-3">
                <p className="font-medium text-ink">{row.title}</p>
                <p className="text-xs text-muted">
                  {row.note || "—"}
                  {row.extra ? ` · ${row.extra}` : ""}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                {row.gave ? <Money value={row.gave} tone="give" /> : <span className="text-muted">—</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                {row.got ? <Money value={row.got} tone="get" /> : <span className="text-muted">—</span>}
              </td>
              {showBalance ? (
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {row.balance ? (
                    <>
                      <Money value={row.balance.amount} tone={row.balance.tone} className="block" />
                      <span className="text-xs text-muted">{row.balance.title}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
