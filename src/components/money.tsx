import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { BalanceTone } from "@/lib/model";

const toneClass: Record<BalanceTone | "ink", string> = {
  get: "text-get",
  give: "text-give",
  settled: "text-muted",
  ink: "text-ink",
};

export function Money({
  value,
  tone = "ink",
  className,
}: {
  value: number;
  tone?: BalanceTone | "ink";
  className?: string;
}) {
  return (
    <span className={cn("font-display tabular-nums tracking-tight", toneClass[tone], className)}>
      {formatINR(value)}
    </span>
  );
}
