#!/usr/bin/env python3
"""Command-line entry point.

Single chart from an export:

    python3 analyze.py --csv gold.csv --symbol GOLDM --timeframe daily \
        --capital 500000

Live or delayed provider:

    python3 analyze.py --provider yahoo --symbol RELIANCE --timeframe daily
    python3 analyze.py --provider angelone --symbol CRUDEOIL --timeframe 15m

Watchlist scan:

    python3 analyze.py --provider yahoo --timeframe daily \
        --scan GOLDM,SILVERM,RELIANCE,TCS

For a browser interface, run `python3 app.py` instead.
"""

from __future__ import annotations

import argparse
import sys

from analyzer import chart, feeds, instruments, scanner
from analyzer.data import INTRADAY, load_csv
from analyzer.engine import analyse
from analyzer.report import render

TIMEFRAMES = sorted(INTRADAY) + ["daily", "weekly", "monthly"]


def ratio_report(a_closes: list[float], b_closes: list[float],
                 label: str = "Gold/silver") -> str:
    """Relative strength between two instruments over the recent window.

    A falling gold/silver ratio means silver is outpacing gold, which usually
    accompanies broader risk appetite; a rising ratio is more often defensive.
    The ratio trends for long stretches, so it describes relative strength and
    is not a timing signal on its own.
    """
    n = min(len(a_closes), len(b_closes))
    if n < 2:
        return f"{label} ratio: insufficient overlapping data."

    a, b = a_closes[-n:], b_closes[-n:]
    current = a[-1] / b[-1]
    window = min(20, n - 1)
    past = a[-1 - window] / b[-1 - window]
    change = (current - past) / past * 100

    if change > 1.5:
        lead = "first instrument outperforming (defensive tone for metals)"
    elif change < -1.5:
        lead = "second instrument outperforming (risk-on tone for metals)"
    else:
        lead = "both moving broadly together"

    return (f"{label} ratio: {current:.2f} ({change:+.2f}% over {window} bars) "
            f"— {lead}.\n    Both series must share a currency and quote unit "
            f"for this to be meaningful.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Technical analysis for commodities, MCX and stocks.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Known symbols: " + ", ".join(sorted(instruments.INSTRUMENTS)) +
               "\nAny other symbol is treated as an equity, sized in shares.",
    )
    p.add_argument("--symbol", help="e.g. GOLDM, CRUDEOIL, RELIANCE")
    p.add_argument("--timeframe", required=True, choices=TIMEFRAMES)
    p.add_argument("--provider", default="csv",
                   choices=sorted(feeds.PROVIDERS),
                   help="csv (offline), yahoo (delayed), angelone (live)")
    p.add_argument("--csv", help="OHLC CSV when --provider csv")
    p.add_argument("--exchange", default="MCX",
                   help="Exchange segment for broker feeds (MCX, NSE)")
    p.add_argument("--capital", type=float, default=None,
                   help="Account capital, enables position sizing")
    p.add_argument("--risk-pct", type=float, default=instruments.MAX_RISK_PCT,
                   help=f"Risk per trade, capped at {instruments.MAX_RISK_PCT}%%")
    p.add_argument("--lot-size", type=float, default=None,
                   help="Override the contract multiplier (index/stock F&O)")
    p.add_argument("--compare-csv", default=None,
                   help="Second CSV for a relative-strength ratio")
    p.add_argument("--scan", default=None,
                   help="Comma-separated watchlist; scans instead of one chart")
    p.add_argument("--scan-dir", default=None,
                   help="Directory of CSVs to scan, symbol taken from filename")
    p.add_argument("--svg", default=None, help="Write an SVG chart to this path")
    p.add_argument("--check-feed", action="store_true",
                   help="Verify the provider returns bars, then exit")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    # --- Watchlist modes ---
    if args.scan_dir:
        try:
            rows = scanner.scan_directory(args.scan_dir, args.timeframe,
                                          args.capital, args.risk_pct)
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 1
        print(scanner.render_table(rows))
        return 0

    if args.scan:
        symbols = [s.strip() for s in args.scan.split(",") if s.strip()]
        try:
            feed = feeds.build(args.provider, args.csv, args.exchange)
        except feeds.FeedError as exc:
            print(exc, file=sys.stderr)
            return 1
        rows = scanner.scan_feed(feed, symbols, args.timeframe,
                                 args.capital, args.risk_pct)
        print(scanner.render_table(rows))
        return 0

    # --- Single instrument ---
    if not args.symbol:
        print("--symbol is required unless scanning.", file=sys.stderr)
        return 2

    try:
        feed = feeds.build(args.provider, args.csv, args.exchange)
        series = feeds.fetch_with_retry(feed, args.symbol, args.timeframe)
    except (feeds.FeedError, ValueError, OSError) as exc:
        print(f"Could not load data: {exc}", file=sys.stderr)
        return 1

    if args.check_feed:
        last = series.times[-1]
        print(f"{args.provider}: {len(series)} bars for {args.symbol.upper()} "
              f"({args.timeframe}), latest close {series.closes[-1]:,.2f}"
              f"{f' at {last}' if last else ''}.")
        return 0

    inst = instruments.resolve(args.symbol, args.lot_size)
    analysis = analyse(series, inst, args.timeframe, args.capital, args.risk_pct)
    print(render(analysis))

    if args.svg:
        try:
            with open(args.svg, "w", encoding="utf-8") as fh:
                fh.write(chart.render_svg(series, analysis))
            print(f"\nChart written to {args.svg}")
        except OSError as exc:
            print(f"\nCould not write {args.svg}: {exc}", file=sys.stderr)

    if args.compare_csv:
        try:
            other = load_csv(args.compare_csv)
        except (OSError, ValueError) as exc:
            print(f"\nCould not read {args.compare_csv}: {exc}", file=sys.stderr)
            return 1
        print()
        print(ratio_report(series.closes, other.closes))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
