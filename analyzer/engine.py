"""Confluence scoring and the trade decision.

The rule that shapes this module: when indicators disagree, the output is
WAIT. A signal is only emitted when the directional checks agree strongly
*and* the resulting reward-to-risk clears a floor. Scoring is deliberately
transparent — every vote is reported so the reasoning can be audited rather
than taken on faith.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import contracts, indicators, structure
from .data import INTRADAY, Series

# A signal needs this many agreeing checks, with at most MAX_DISSENT against.
MIN_CONFLUENCE = 4
MAX_DISSENT = 1
MIN_RR = 1.5

# Stop sits this many ATR beyond the structural level, absorbing normal noise.
STOP_ATR_MULT = 1.5


@dataclass
class Vote:
    name: str
    direction: int  # +1 bullish, -1 bearish, 0 neutral
    detail: str


@dataclass
class Analysis:
    symbol: str
    timeframe: str
    price: float
    bias: str
    trend_strength: str
    supports: list[structure.Zone]
    resistances: list[structure.Zone]
    market_structure: str
    votes: list[Vote]
    atr_value: float
    divergence: str | None
    volume_note: str
    condition: str
    decision: str
    entry: float | None = None
    stop: float | None = None
    target1: float | None = None
    target2: float | None = None
    rr: float | None = None
    invalidation: float | None = None
    confidence: str = "Low"
    sizing: contracts.Sizing | None = None
    warnings: list[str] = field(default_factory=list)


def _last(series: list[float | None]) -> float | None:
    for v in reversed(series):
        if v is not None:
            return v
    return None


def analyse(
    series: Series,
    symbol: str,
    timeframe: str,
    capital: float | None = None,
    risk_pct: float = contracts.MAX_RISK_PCT,
) -> Analysis:
    closes, highs, lows = series.closes, series.highs, series.lows
    price = closes[-1]
    warnings: list[str] = []

    if len(closes) < 200:
        warnings.append(
            f"Only {len(closes)} bars supplied. The 200 SMA needs 200; "
            f"primary-trend reading is unavailable or unreliable."
        )

    sma200 = indicators.sma(closes, 200)
    ema20 = indicators.ema(closes, 20)
    ema50 = indicators.ema(closes, 50)
    rsi14 = indicators.rsi(closes, 14)
    macd_line, signal_line, hist = indicators.macd(closes)
    atr14 = indicators.atr(highs, lows, closes, 14)

    atr_value = _last(atr14) or 0.0
    swings = structure.find_swings(highs, lows)
    market_structure, struct_strength = structure.describe_structure(
        swings, atr_value
    )
    supports, resistances = structure.build_zones(swings, price, atr_value)
    divergence = structure.detect_divergence(swings, rsi14)

    votes: list[Vote] = []

    # --- Primary trend ---
    v200 = _last(sma200)
    if v200 is not None:
        d = 1 if price > v200 else -1
        votes.append(Vote("200 SMA", d,
                          f"price {price:,.2f} {'above' if d > 0 else 'below'} "
                          f"200 SMA {v200:,.2f}"))
    else:
        votes.append(Vote("200 SMA", 0, "not enough history"))

    # --- Short/medium trend ---
    v20, v50 = _last(ema20), _last(ema50)
    if v20 is not None and v50 is not None:
        d = 1 if v20 > v50 else -1
        votes.append(Vote("20/50 EMA", d,
                          f"20 EMA {v20:,.2f} {'above' if d > 0 else 'below'} "
                          f"50 EMA {v50:,.2f}"))
        d2 = 1 if price > v50 else -1
        votes.append(Vote("Price vs 50 EMA", d2,
                          f"price {'above' if d2 > 0 else 'below'} 50 EMA"))
    else:
        votes.append(Vote("20/50 EMA", 0, "not enough history"))

    # --- Momentum ---
    r = _last(rsi14)
    if r is not None:
        d = 1 if r > 55 else (-1 if r < 45 else 0)
        regime = "bullish" if d > 0 else ("bearish" if d < 0 else "neutral 45-55")
        votes.append(Vote("RSI 14", d, f"{r:.1f} ({regime})"))

    m, s, h = _last(macd_line), _last(signal_line), _last(hist)
    if m is not None and s is not None and h is not None:
        d = 1 if (m > s and h > 0) else (-1 if (m < s and h < 0) else 0)
        votes.append(Vote("MACD", d,
                          f"line {m:,.2f} vs signal {s:,.2f}, hist {h:+,.2f}"))

    # --- VWAP, intraday only ---
    if timeframe in INTRADAY and series.has_volume:
        vw = indicators.vwap(highs, lows, closes, series.volumes,
                             series.session_starts())
        vlast = _last(vw)
        if vlast is not None:
            d = 1 if price > vlast else -1
            votes.append(Vote("VWAP", d,
                              f"price {'above' if d > 0 else 'below'} "
                              f"VWAP {vlast:,.2f}"))
    elif timeframe not in INTRADAY:
        votes.append(Vote("VWAP", 0, "not applicable above intraday timeframes"))

    # --- Structure ---
    if market_structure.startswith("higher"):
        votes.append(Vote("Structure", 1, market_structure))
    elif market_structure.startswith("lower"):
        votes.append(Vote("Structure", -1, market_structure))
    else:
        votes.append(Vote("Structure", 0, market_structure))

    # --- Volume confirmation (non-directional) ---
    volume_note = _volume_note(series, symbol, warnings)

    bull = sum(1 for v in votes if v.direction > 0)
    bear = sum(1 for v in votes if v.direction < 0)

    if bull > bear:
        bias = "Bullish"
    elif bear > bull:
        bias = "Bearish"
    else:
        bias = "Sideways"

    trend_strength = _trend_strength(struct_strength, v20, v50, atr_value, bull, bear)

    if divergence == "bearish" and bias == "Bullish":
        warnings.append(
            "Bearish RSI divergence against a bullish read — momentum is "
            "thinning. Divergence can persist for many bars in a strong trend."
        )
    elif divergence == "bullish" and bias == "Bearish":
        warnings.append(
            "Bullish RSI divergence against a bearish read — selling may be "
            "losing force, but this is a caution flag, not an entry trigger."
        )

    condition = _condition(price, supports, resistances, atr_value, market_structure)

    analysis = Analysis(
        symbol=symbol, timeframe=timeframe, price=price, bias=bias,
        trend_strength=trend_strength, supports=supports, resistances=resistances,
        market_structure=market_structure, votes=votes, atr_value=atr_value,
        divergence=divergence, volume_note=volume_note, condition=condition,
        decision="WAIT", warnings=warnings,
    )

    _decide(analysis, bull, bear, capital, symbol, risk_pct)
    return analysis


def _volume_note(series: Series, symbol: str, warnings: list[str]) -> str:
    if not series.has_volume:
        return "No volume data supplied — breakout confirmation unavailable."

    if not contracts.has_real_volume(symbol):
        warnings.append(
            f"{symbol} volume is broker tick-count, not exchange volume. "
            f"It cannot confirm a breakout; use MCX or COMEX futures for that."
        )
        return "Tick volume only — not used for confirmation."

    avg = indicators.rolling_mean_volume(series.volumes, 20)
    a, latest = _last(avg), series.volumes[-1]
    if a is None or a <= 0:
        return "Insufficient volume history for a 20-period average."

    ratio = latest / a
    if ratio >= 1.5:
        return f"Volume {ratio:.2f}x the 20-period average — supports the move."
    if ratio >= 1.0:
        return f"Volume {ratio:.2f}x average — adequate but not expansive."
    return f"Volume {ratio:.2f}x average — move is not volume-supported."


def _trend_strength(
    struct_strength: str, v20: float | None, v50: float | None,
    atr_value: float, bull: int, bear: int
) -> str:
    """Blend swing consistency, EMA separation, and vote agreement."""
    score = {"Strong": 2, "Moderate": 1, "Weak": 0}[struct_strength]

    if v20 is not None and v50 is not None and atr_value > 0:
        separation = abs(v20 - v50) / atr_value
        if separation > 1.0:
            score += 1
        elif separation < 0.25:
            score -= 1

    total = bull + bear
    if total and max(bull, bear) / total >= 0.8:
        score += 1

    return "Strong" if score >= 3 else ("Moderate" if score >= 1 else "Weak")


def _location(
    price: float, supports: list[structure.Zone],
    resistances: list[structure.Zone], atr_value: float
) -> tuple[bool, bool]:
    """Whether price is within one ATR of the nearest support / resistance."""
    near_sup = bool(supports) and (price - supports[0].high) <= atr_value
    near_res = bool(resistances) and (resistances[0].low - price) <= atr_value
    return near_sup, near_res


def _condition(
    price: float, supports: list[structure.Zone], resistances: list[structure.Zone],
    atr_value: float, market_structure: str
) -> str:
    near_sup, near_res = _location(price, supports, resistances, atr_value)

    if market_structure == "range":
        if near_res:
            return "Range — price at the upper boundary."
        if near_sup:
            return "Range — price at the lower boundary."
        return "Range — price mid-band, poor location for a new position."
    if near_sup and market_structure.startswith("higher"):
        return "Pullback into support within an uptrend."
    if near_res and market_structure.startswith("lower"):
        return "Pullback into resistance within a downtrend."
    if near_res:
        return "Approaching resistance — breakout or rejection pending."
    if near_sup:
        return "Approaching support — breakdown or bounce pending."
    return "Price is between zones — no high-quality location."


def _decide(
    a: Analysis, bull: int, bear: int, capital: float | None,
    symbol: str, risk_pct: float,
) -> None:
    """Emit a signal only on strong agreement, good location, and R:R >= 1.5."""
    if a.atr_value <= 0:
        a.warnings.append("ATR unavailable — cannot place a volatility-based stop.")
        return

    long_ok = bull >= MIN_CONFLUENCE and bear <= MAX_DISSENT
    short_ok = bear >= MIN_CONFLUENCE and bull <= MAX_DISSENT

    if not (long_ok or short_ok):
        a.warnings.append(
            f"Indicators conflict ({bull} bullish vs {bear} bearish). "
            f"A signal needs at least {MIN_CONFLUENCE} agreeing with no more "
            f"than {MAX_DISSENT} against."
        )
        a.confidence = "Low"
        return

    # Location gate. Trend votes inside a range are unreliable — the same
    # oscillation that produces them reverses at the boundary. Only take the
    # side the boundary supports: buy the floor, sell the ceiling, never the
    # reverse and never mid-band.
    near_sup, near_res = _location(a.price, a.supports, a.resistances, a.atr_value)
    if a.market_structure == "range":
        if long_ok and not near_sup:
            a.warnings.append(
                "Bullish votes inside a range, but price is not at the lower "
                "boundary. Buying mid-range or into the ceiling has no edge."
            )
            a.confidence = "Low"
            return
        if short_ok and not near_res:
            a.warnings.append(
                "Bearish votes inside a range, but price is not at the upper "
                "boundary. Selling into range support has no edge."
            )
            a.confidence = "Low"
            return

    if long_ok:
        if not a.supports:
            a.warnings.append("No support zone identified — cannot anchor a stop.")
            return
        base = a.supports[0]
        entry = min(a.price, base.high) if a.price > base.high else a.price
        stop = base.low - STOP_ATR_MULT * a.atr_value
        t1 = a.resistances[0].mid if a.resistances else entry + 2 * a.atr_value
        t2 = (a.resistances[1].mid if len(a.resistances) > 1
              else entry + 3.5 * a.atr_value)
        invalidation = base.low
        direction = 1
    else:
        if not a.resistances:
            a.warnings.append("No resistance zone identified — cannot anchor a stop.")
            return
        base = a.resistances[0]
        entry = max(a.price, base.low) if a.price < base.low else a.price
        stop = base.high + STOP_ATR_MULT * a.atr_value
        t1 = a.supports[0].mid if a.supports else entry - 2 * a.atr_value
        t2 = (a.supports[1].mid if len(a.supports) > 1
              else entry - 3.5 * a.atr_value)
        invalidation = base.high
        direction = -1

    risk = abs(entry - stop)
    reward = abs(t1 - entry)
    if risk <= 0:
        a.warnings.append("Degenerate stop distance — no trade.")
        return

    rr = reward / risk

    # Targets must sit the correct side of entry; zone geometry can invert
    # when price has already run past the nearest opposing zone.
    if (direction == 1 and t1 <= entry) or (direction == -1 and t1 >= entry):
        a.warnings.append(
            "Nearest opposing zone sits the wrong side of entry — price is "
            "extended. Wait for a pullback rather than chasing."
        )
        a.confidence = "Low"
        return

    a.entry, a.stop, a.target1, a.target2 = entry, stop, t1, t2
    a.rr, a.invalidation = rr, invalidation

    if rr < MIN_RR:
        a.warnings.append(
            f"Reward-to-risk is {rr:.2f}, below the {MIN_RR} floor. "
            f"Setup is directionally valid but priced poorly."
        )
        a.confidence = "Low"
        return

    a.decision = "Buy" if direction == 1 else "Sell"

    agreement = max(bull, bear) / max(bull + bear, 1)
    if agreement >= 0.85 and rr >= 2.0 and a.trend_strength == "Strong":
        a.confidence = "High"
    elif agreement >= 0.7 and rr >= 1.5:
        a.confidence = "Medium"
    else:
        a.confidence = "Low"

    # A boundary trade in a range is a mean-reversion scalp, never a
    # high-confidence trend entry.
    if a.market_structure == "range" and a.confidence == "High":
        a.confidence = "Medium"

    # Divergence against the signal caps confidence.
    if (a.divergence == "bearish" and direction == 1) or (
        a.divergence == "bullish" and direction == -1
    ):
        a.confidence = "Low" if a.confidence == "Medium" else "Medium"

    if capital:
        contract = contracts.resolve(symbol)
        if contract:
            a.sizing = contracts.size_position(
                capital, entry, stop, contract, risk_pct
            )
            if not a.sizing.affordable:
                a.decision = "WAIT"
                a.warnings.append(
                    "Position cannot be sized within the risk limit — "
                    "see sizing note."
                )
