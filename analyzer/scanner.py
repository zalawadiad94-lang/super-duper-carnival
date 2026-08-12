"""Multi-instrument scanning.

Runs the same analysis across a watchlist and ranks the results, so a set of
commodities, MCX contracts, and stocks can be reviewed in one pass instead of
one chart at a time. Failures are captured per row rather than aborting the
scan — one bad symbol should not lose the other forty.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from . import instruments
from .data import load_csv
from .engine import Analysis, analyse
from .feeds import FeedError, fetch_with_retry

_CONFIDENCE_RANK = {"High": 3, "Medium": 2, "Low": 1}


@dataclass
class ScanRow:
    symbol: str
    analysis: Analysis | None
    error: str | None = None

    @property
    def rank_key(self) -> tuple:
        """Actionable, highest-conviction, best-priced setups first."""
        a = self.analysis
        if a is None:
            return (0, 0, 0.0, 0.0)
        actionable = 1 if a.decision in ("Buy", "Sell") else 0
        return (
            actionable,
            _CONFIDENCE_RANK.get(a.confidence, 0),
            a.rr or 0.0,
            1.0 if a.trend_strength == "Strong" else 0.5,
        )


def scan_feed(
    feed,
    symbols: list[str],
    timeframe: str,
    capital: float | None = None,
    risk_pct: float = instruments.MAX_RISK_PCT,
    lot_sizes: dict[str, float] | None = None,
) -> list[ScanRow]:
    """Analyse every symbol from a live or delayed provider."""
    lot_sizes = lot_sizes or {}
    rows: list[ScanRow] = []

    for symbol in symbols:
        try:
            series = fetch_with_retry(feed, symbol, timeframe)
            inst = instruments.resolve(symbol, lot_sizes.get(symbol.upper()))
            rows.append(ScanRow(
                symbol,
                analyse(series, inst, timeframe, capital, risk_pct),
            ))
        except (FeedError, ValueError) as exc:
            rows.append(ScanRow(symbol, None, str(exc)))

    rows.sort(key=lambda r: r.rank_key, reverse=True)
    return rows


def scan_directory(
    directory: str,
    timeframe: str,
    capital: float | None = None,
    risk_pct: float = instruments.MAX_RISK_PCT,
) -> list[ScanRow]:
    """Analyse every CSV in a folder, taking the symbol from the filename.

    `GOLDM.csv` is analysed as GOLDM, `RELIANCE.csv` as a generic equity.
    """
    rows: list[ScanRow] = []
    try:
        names = sorted(os.listdir(directory))
    except OSError as exc:
        raise ValueError(f"Cannot read {directory}: {exc}") from exc

    for name in names:
        if not name.lower().endswith(".csv"):
            continue
        symbol = os.path.splitext(name)[0].upper()
        path = os.path.join(directory, name)
        try:
            series = load_csv(path)
            inst = instruments.resolve(symbol)
            rows.append(ScanRow(
                symbol, analyse(series, inst, timeframe, capital, risk_pct)
            ))
        except (OSError, ValueError) as exc:
            rows.append(ScanRow(symbol, None, str(exc)))

    rows.sort(key=lambda r: r.rank_key, reverse=True)
    return rows


def render_table(rows: list[ScanRow]) -> str:
    """Fixed-width summary of a scan."""
    header = (f"{'SYMBOL':<14}{'DECISION':<10}{'CONF':<8}{'BIAS':<10}"
              f"{'ENTRY':>12}{'STOP':>12}{'TARGET 1':>12}{'R:R':>7}")
    lines = [header, "-" * len(header)]

    for row in rows:
        if row.analysis is None:
            lines.append(f"{row.symbol:<14}{'ERROR':<10}{(row.error or '')[:60]}")
            continue
        a = row.analysis
        entry = f"{a.entry:,.2f}" if a.entry else "—"
        stop = f"{a.stop:,.2f}" if a.stop else "—"
        t1 = f"{a.target1:,.2f}" if a.target1 else "—"
        rr = f"{a.rr:.2f}" if a.rr else "—"
        lines.append(
            f"{row.symbol:<14}{a.decision:<10}{a.confidence:<8}{a.bias:<10}"
            f"{entry:>12}{stop:>12}{t1:>12}{rr:>7}"
        )

    actionable = sum(1 for r in rows
                     if r.analysis and r.analysis.decision in ("Buy", "Sell"))
    lines.append("")
    lines.append(f"{actionable} actionable of {len(rows)} scanned. "
                 f"The rest are WAIT or failed to load.")
    return "\n".join(lines)
