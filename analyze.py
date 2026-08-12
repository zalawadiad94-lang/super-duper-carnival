#!/usr/bin/env python3
"""Command-line entry point.

    python3 analyze.py --csv gold.csv --symbol GOLDM --timeframe daily \
        --capital 500000

Ratio mode compares the two metals:

    python3 analyze.py --csv gold.csv --silver-csv silver.csv \
        --symbol GOLDM --timeframe daily
"""

from __future__ import annotations

import argparse
import sys

from analyzer import load_csv, analyse, render
from analyzer.contracts import CONTRACTS, MAX_RISK_PCT, resolve
from analyzer.data import INTRADAY

TIMEFRAMES = sorted(INTRADAY) + ["daily", "weekly", "monthly"]


def ratio_report(gold_closes: list[float], silver_closes: list[float]) -> str:
    """Gold/silver ratio and its direction over the recent window.

    A falling ratio means silver is outpacing gold, which typically
    accompanies broader risk appetite. A rising ratio means gold is leading,
    more often a defensive move. The ratio trends for long stretches, so it
    describes relative strength — it is not a timing signal on its own.
    """
    n = min(len(gold_closes), len(silver_closes))
    if n < 2:
        return "Gold/silver ratio: insufficient overlapping data."

    g, s = gold_closes[-n:], silver_closes[-n:]
    current = g[-1] / s[-1]
    window = min(20, n - 1)
    past = g[-1 - window] / s[-1 - window]
    change = (current - past) / past * 100

    if change > 1.5:
        lead = "gold is outperforming silver (defensive tone)"
    elif change < -1.5:
        lead = "silver is outperforming gold (risk-on tone)"
    else:
        lead = "both metals moving broadly together"

    return (
        f"Gold/silver ratio: {current:.2f} "
        f"({change:+.2f}% over {window} bars) — {lead}.\n"
        f"    Note: both series must share the same currency and quote unit "
        f"for this ratio to be meaningful."
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Technical analysis for gold and silver.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Known symbols: " + ", ".join(sorted(CONTRACTS)),
    )
    p.add_argument("--csv", required=True, help="OHLC CSV for the instrument")
    p.add_argument("--symbol", required=True, help="e.g. GOLDM, SILVERM, XAUUSD")
    p.add_argument("--timeframe", required=True, choices=TIMEFRAMES)
    p.add_argument("--capital", type=float, default=None,
                   help="Account capital, enables position sizing")
    p.add_argument("--risk-pct", type=float, default=MAX_RISK_PCT,
                   help=f"Risk per trade, capped at {MAX_RISK_PCT}%%")
    p.add_argument("--silver-csv", default=None,
                   help="Second CSV to compute the gold/silver ratio")

    args = p.parse_args(argv)

    if resolve(args.symbol) is None:
        print(f"Unknown symbol {args.symbol!r}. Known: "
              f"{', '.join(sorted(CONTRACTS))}", file=sys.stderr)
        return 2

    try:
        series = load_csv(args.csv)
    except (OSError, ValueError) as exc:
        print(f"Could not read {args.csv}: {exc}", file=sys.stderr)
        return 1

    analysis = analyse(series, args.symbol.upper(), args.timeframe,
                       args.capital, args.risk_pct)
    print(render(analysis))

    if args.silver_csv:
        try:
            silver = load_csv(args.silver_csv)
        except (OSError, ValueError) as exc:
            print(f"\nCould not read {args.silver_csv}: {exc}", file=sys.stderr)
            return 1
        print()
        print(ratio_report(series.closes, silver.closes))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
