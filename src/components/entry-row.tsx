import { KIND_META, balanceLabel, type Entry, type Site } from "@/lib/model";
import { formatDay } from "@/lib/format";
import { Money } from "@/components/money";

export function EntryRow({
  entry,
  site,
  running,
  onClick,
}: {
  entry: Entry;
  site?: Site;
  running?: number;
  onClick?: () => void;
}) {
  const meta = KIND_META[entry.kind];
  const tone = meta.direction === "gave" ? "give" : "get";
  const runningLabel = running === undefined ? null : balanceLabel(running);
  const body = (
    <>
      <div className="min-w-0">
        <p className="font-medium text-ink">{meta.label}</p>
        {entry.note ? <p className="mt-0.5 text-sm text-muted">{entry.note}</p> : null}
        <p className="mt-1 text-xs text-muted">
          {formatDay(entry.date)}
          {site ? ` · ${site.name}` : ""}
          {runningLabel ? ` · Balance ${runningLabel.title.toLowerCase()}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Money value={entry.amount} tone={tone} className="text-lg" />
        <p className={`mt-0.5 text-xs font-semibold ${tone === "give" ? "text-give" : "text-get"}`}>
          {meta.direction === "gave" ? "You gave" : "You got"}
        </p>
      </div>
    </>
  );

  if (!onClick) {
    return <div className="flex items-start justify-between gap-3 px-4 py-3">{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
      {body}
    </button>
  );
}
