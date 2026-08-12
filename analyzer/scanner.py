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


# Compressed explanations for a scan row, matched against the warning text
# the engine produced. Keeps the table readable without hiding the reason.
_REASONS = (
    ("Trend checks disagree", "no clear trend"),
    ("below the 1.5 floor", "R:R too low"),
    ("chasing a counter-move", "momentum against, off-zone"),
    ("wrong side of entry", "price extended"),
    ("no edge", "range, wrong boundary"),
    ("nothing to aim at", "range, no target"),
    ("cannot be sized", "exceeds risk limit"),
    ("cannot anchor a stop", "no zone for a stop"),
    ("ATR unavailable", "no volatility reading"),
)


def wait_reason(analysis: Analysis) -> str:
    """Short explanation of why a row is not actionable."""
    joined = " ".join(analysis.warnings)
    for needle, label in _REASONS:
        if needle in joined:
            return label
    return ""


def render_table(rows: list[ScanRow]) -> str:
    """Fixed-width summary of a scan.

    Levels are printed only on actionable rows. A WAIT row that still showed
    an entry and stop invites exactly the misread this tool exists to avoid,
    so those cells are blanked and replaced by the reason it waited.
    """
    header = (f"{'SYMBOL':<13}{'DECISION':<9}{'CONF':<7}{'BIAS':<9}"
              f"{'ENTRY':>11}{'STOP':>11}{'TARGET 1':>11}{'R:R':>6}  WHY")
    lines = [header, "-" * len(header)]

    for row in rows:
        if row.analysis is None:
            detail = " ".join((row.error or "").split())
            lines.append(f"{row.symbol:<13}{'ERROR':<9}{'':<7}{'':<9}"
                         f"{'—':>11}{'—':>11}{'—':>11}{'—':>6}  {detail[:44]}")
            continue

        a = row.analysis
        actionable = a.decision in ("Buy", "Sell")
        if actionable:
            entry = f"{a.entry:,.2f}"
            stop = f"{a.stop:,.2f}"
            t1 = f"{a.target1:,.2f}"
            rr = f"{a.rr:.2f}"
            why = a.setup
        else:
            entry = stop = t1 = rr = "—"
            why = wait_reason(a)

        lines.append(
            f"{row.symbol:<13}{a.decision:<9}{a.confidence:<7}{a.bias:<9}"
            f"{entry:>11}{stop:>11}{t1:>11}{rr:>6}  {why}"
        )

    actionable = sum(1 for r in rows
                     if r.analysis and r.analysis.decision in ("Buy", "Sell"))
    failed = sum(1 for r in rows if r.analysis is None)
    lines.append("")
    summary = f"{actionable} actionable of {len(rows)} scanned"
    if failed:
        summary += f", {failed} failed to load"
    lines.append(summary + ". Levels are shown only where a trade qualifies.")
    return "\n".join(lines)
