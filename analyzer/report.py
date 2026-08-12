"""Renders an Analysis into the standard report format."""

from __future__ import annotations

from .engine import Analysis

# Standing high-volatility events for precious metals. There is no live
# calendar feed here, so this is a checklist to verify before acting, not a
# claim about what is scheduled.
EVENT_CHECKLIST = (
    "FOMC rate decision and press conference",
    "US CPI",
    "US Non-Farm Payrolls",
    "US PPI and retail sales",
    "Fed speakers and FOMC minutes",
    "For MCX specifically: USDINR moves and any import-duty change",
)


def _zones(zones) -> str:
    if not zones:
        return "    none identified"
    return "\n".join(f"    {i}. {z}" for i, z in enumerate(zones, 1))


def render(a: Analysis) -> str:
    lines: list[str] = []
    add = lines.append

    add(f"Instrument: {a.symbol}    Timeframe: {a.timeframe}    "
        f"Current price: {a.price:,.2f}")
    add(f"ATR(14): {a.atr_value:,.2f}")
    add("")
    add(f"Market bias: {a.bias}")
    add(f"Trend strength: {a.trend_strength}")
    add(f"Market structure: {a.market_structure}")
    add(f"Condition: {a.condition}")
    add("")
    add("Important support zones:")
    add(_zones(a.supports))
    add("Important resistance zones:")
    add(_zones(a.resistances))
    add("")
    add("Indicator confirmation:")
    for v in a.votes:
        mark = "bullish" if v.direction > 0 else (
            "bearish" if v.direction < 0 else "neutral")
        add(f"    {v.name:<18} {mark:<8} {v.detail}")
    add(f"    {'Volume':<18} {'—':<8} {a.volume_note}")
    add(f"    {'Divergence':<18} {'—':<8} "
        f"{a.divergence or 'none detected on recent swings'}")
    add("")

    if a.decision in ("Buy", "Sell"):
        add(f"Possible entry: {a.entry:,.2f}")
        add(f"Stop-loss: {a.stop:,.2f}  "
            f"({abs(a.entry - a.stop) / a.atr_value:.2f} ATR from entry)")
        add(f"Target 1: {a.target1:,.2f}")
        add(f"Target 2: {a.target2:,.2f}")
        add(f"Risk-to-reward ratio: {a.rr:.2f} to 1 (to Target 1)")
        add(f"Invalidation level: {a.invalidation:,.2f}")
    else:
        add("Possible entry: —")
        add("Stop-loss: —")
        add("Target 1: —")
        add("Target 2: —")
        add(f"Risk-to-reward ratio: "
            f"{f'{a.rr:.2f} to 1' if a.rr else '—'}")
        add(f"Invalidation level: "
            f"{f'{a.invalidation:,.2f}' if a.invalidation else '—'}")

    add(f"Trade decision: {a.decision}")
    add(f"Confidence: {a.confidence}")

    if a.sizing:
        add("")
        add("Position sizing:")
        add(f"    {a.sizing.message}")
        add(f"    Risk budget: {a.sizing.risk_pct:.2f}% of "
            f"{a.sizing.capital:,.0f}")

    if a.warnings:
        add("")
        add("Warnings:")
        for w in a.warnings:
            add(f"    - {w}")

    add("")
    add("Event risk to verify before acting:")
    for e in EVENT_CHECKLIST:
        add(f"    - {e}")

    add("")
    add("This is technical analysis of the supplied data, not financial "
        "advice. Indicator confluence expresses probability, not certainty.")

    return "\n".join(lines)
