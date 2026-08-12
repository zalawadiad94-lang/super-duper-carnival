"""Confluence scoring and the trade decision.

The rule that shapes this module: when indicators disagree, the output is
WAIT. A signal is only emitted when the directional checks agree strongly
*and* the resulting reward-to-risk clears a floor. Scoring is deliberately
transparent — every vote is reported so the reasoning can be audited rather
than taken on faith.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from . import indicators, instruments, structure
from .data import INTRADAY, Series

# Checks that establish direction. A signal needs MIN_TREND_AGREEMENT of them
# agreeing and none against.
# Direction comes from the primary filter, the moving-average relationship,
# and swing structure. Where price sits *relative* to an average is not a
# trend fact — it is exactly what moves during a pullback — so "Price vs
# 50 EMA" is a timing check, not a trend one.
TREND_CHECKS = frozenset({"200 SMA", "20/50 EMA", "Structure"})

# Two must agree with none against. In a range the Structure vote is neutral,
# so two is what keeps boundary trades reachable; the location gate then
# decides whether the boundary is the right one.
MIN_TREND_AGREEMENT = 2

# Checks that time the entry. These may dissent during a pullback without
# vetoing the trade, provided price is at the matching zone.
TIMING_CHECKS = frozenset({"Price vs 50 EMA", "RSI 14", "MACD", "VWAP"})

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
    setup: str = "none"
    instrument: instruments.Instrument | None = None
    sizing: instruments.Sizing | None = None
    warnings: list[str] = field(default_factory=list)


def _last(series: list[float | None]) -> float | None:
    for v in reversed(series):
        if v is not None:
            return v
    return None


def analyse(
    series: Series,
    instrument: instruments.Instrument,
    timeframe: str,
    capital: float | None = None,
    risk_pct: float = instruments.MAX_RISK_PCT,
) -> Analysis:
    closes, highs, lows = series.closes, series.highs, series.lows
    price = closes[-1]
    warnings: list[str] = []

    if len(closes) < 200:
        warnings.append(
            f"Only {len(closes)} bars supplied. The 200 SMA needs 200; "
            f"primary-trend reading is unavailable or unreliable."
        )

    warnings.extend(_asset_class_warnings(instrument, timeframe))

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
    volume_note = _volume_note(series, instrument, warnings)

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
        symbol=instrument.symbol, timeframe=timeframe, price=price, bias=bias,
        trend_strength=trend_strength, supports=supports, resistances=resistances,
        market_structure=market_structure, votes=votes, atr_value=atr_value,
        divergence=divergence, volume_note=volume_note, condition=condition,
        decision="WAIT", warnings=warnings, instrument=instrument,
    )

    _decide(analysis, bull, bear, capital, instrument, risk_pct)
    return analysis


def _asset_class_warnings(
    instrument: instruments.Instrument, timeframe: str
) -> list[str]:
    """Risks that depend on what is being traded rather than on the chart."""
    out: list[str] = []

    if instrument.verify_lot:
        out.append(
            f"{instrument.symbol} lot size is revised frequently by the "
            f"exchange. Sizing assumes 1 unit per point — pass the current "
            f"lot size or the position will be wrong."
        )

    if instrument.asset_class == instruments.EQUITY:
        out.append(
            "Equities gap over stops on overnight news, earnings, and "
            "corporate actions. A stop is not a guaranteed exit price; size "
            "for the possibility of a worse fill."
        )
        out.append(
            "Check for splits, bonuses, and dividends in the price history — "
            "unadjusted data creates false gaps that distort every indicator."
        )
        if timeframe in INTRADAY:
            out.append(
                "Circuit limits can halt trading before a stop is reached."
            )
    elif instrument.asset_class == instruments.COMMODITY:
        out.append(
            "Futures contracts expire. Confirm you are analysing the active "
            "contract, and note that rollover creates artificial gaps in "
            "continuous charts."
        )
        if instrument.currency == "INR":
            out.append(
                "MCX prices reflect the international price, USDINR, and "
                "import duty. A currency move alone can produce a trend here "
                "with no move in the underlying commodity."
            )

    return out


def _volume_note(
    series: Series, instrument: instruments.Instrument, warnings: list[str]
) -> str:
    if not series.has_volume:
        return "No volume data supplied — breakout confirmation unavailable."

    if not instrument.real_volume:
        warnings.append(
            f"{instrument.symbol} volume is broker tick-count, not exchange "
            f"volume. It cannot confirm a breakout; use an exchange-traded "
            f"contract for that."
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


def _split_votes(votes: list[Vote]) -> tuple[tuple[int, int], tuple[int, int]]:
    """Separate direction-setting checks from timing checks.

    Trend votes establish which way the market is going. Timing votes say
    where momentum is *right now*, and during a healthy pullback they point
    against the trend by design — that is what a pullback is. Counting them
    together lets momentum veto every pullback entry, leaving only breakouts.
    """
    trend_bull = sum(1 for v in votes if v.name in TREND_CHECKS and v.direction > 0)
    trend_bear = sum(1 for v in votes if v.name in TREND_CHECKS and v.direction < 0)
    timing_bull = sum(1 for v in votes if v.name in TIMING_CHECKS and v.direction > 0)
    timing_bear = sum(1 for v in votes if v.name in TIMING_CHECKS and v.direction < 0)
    return (trend_bull, trend_bear), (timing_bull, timing_bear)


def _pick_targets(
    entry: float, risk: float, zones: list[structure.Zone], direction: int,
    market_structure: str,
) -> tuple[float | None, float | None, int]:
    """Choose the first target that clears the reward-to-risk floor.

    Taking the *nearest* opposing zone as Target 1 rejects most otherwise
    valid trend trades, because a minor level usually sits inside the stop
    distance. Traders trade through minor levels; what matters is that the
    first target is far enough to be worth the risk. So zones are scanned
    outward and the first one at or beyond MIN_RR x risk becomes Target 1,
    with the count of levels being passed through reported so the cost is
    visible.

    In a range nothing is skipped — the boundary is the trade, and assuming
    price will cut through it is exactly the mistake range-trading avoids.
    """
    ordered = [z for z in zones]
    ordered.sort(key=lambda z: (z.mid - entry) * direction)
    ahead = [z for z in ordered if (z.mid - entry) * direction > 0]

    if not ahead:
        # No structure ahead: fall back to R-multiples, trending only.
        if market_structure == "range":
            return None, None, 0
        return entry + direction * 2.5 * risk, entry + direction * 4.0 * risk, 0

    if market_structure == "range":
        first = ahead[0]
        second = ahead[1] if len(ahead) > 1 else None
        return first.mid, (second.mid if second else None), 0

    for i, zone in enumerate(ahead):
        if abs(zone.mid - entry) >= MIN_RR * risk:
            nxt = ahead[i + 1].mid if i + 1 < len(ahead) else (
                entry + direction * abs(zone.mid - entry) * 1.6)
            return zone.mid, nxt, i

    # Every zone ahead is too close; project beyond the last one.
    return (entry + direction * 2.5 * risk,
            entry + direction * 4.0 * risk,
            len(ahead))


def _decide(
    a: Analysis, bull: int, bear: int, capital: float | None,
    instrument: instruments.Instrument, risk_pct: float,
) -> None:
    """Emit a signal only on trend agreement, good location, and R:R >= 1.5.

    Two setups qualify. A *continuation* has trend and timing both aligned. A
    *pullback* has the trend aligned while timing dissents, and is only taken
    at the matching zone — buying a dip into support, selling a rally into
    resistance. Anything else waits.
    """
    if a.atr_value <= 0:
        a.warnings.append("ATR unavailable — cannot place a volatility-based stop.")
        return

    (trend_bull, trend_bear), (timing_bull, timing_bear) = _split_votes(a.votes)

    long_trend = trend_bull >= MIN_TREND_AGREEMENT and trend_bear == 0
    short_trend = trend_bear >= MIN_TREND_AGREEMENT and trend_bull == 0

    if not (long_trend or short_trend):
        a.warnings.append(
            f"Trend checks disagree ({trend_bull} bullish vs {trend_bear} "
            f"bearish of {len(TREND_CHECKS)}). Direction is unclear, so there "
            f"is nothing to time an entry against."
        )
        a.confidence = "Low"
        return

    near_sup_pre, near_res_pre = _location(
        a.price, a.supports, a.resistances, a.atr_value)

    if long_trend:
        timing_against = timing_bear > timing_bull
        at_zone = near_sup_pre
    else:
        timing_against = timing_bull > timing_bear
        at_zone = near_res_pre

    a.setup = "continuation"
    if timing_against:
        if not at_zone:
            side = "support" if long_trend else "resistance"
            a.warnings.append(
                f"Trend is intact but momentum has turned against it and price "
                f"is not at {side}. Entering here is chasing a counter-move "
                f"with no location edge — wait for the pullback to reach a zone."
            )
            a.confidence = "Low"
            return
        a.setup = "pullback"

    long_ok, short_ok = long_trend, short_trend

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
        t1, t2, skipped = _pick_targets(
            entry, abs(entry - stop), a.resistances, 1, a.market_structure)
        invalidation = base.low
        direction = 1
    else:
        if not a.resistances:
            a.warnings.append("No resistance zone identified — cannot anchor a stop.")
            return
        base = a.resistances[0]
        entry = max(a.price, base.low) if a.price < base.low else a.price
        stop = base.high + STOP_ATR_MULT * a.atr_value
        t1, t2, skipped = _pick_targets(
            entry, abs(entry - stop), a.supports, -1, a.market_structure)
        invalidation = base.high
        direction = -1

    if t1 is None:
        a.warnings.append(
            "No target zone ahead and structure is a range — nothing to aim "
            "at that justifies the risk."
        )
        return

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

    if skipped:
        a.warnings.append(
            f"Target 1 is beyond {skipped} nearer zone(s). The trade must pass "
            f"through {'them' if skipped > 1 else 'it'} to reach target, which "
            f"is where a continuation setup most often stalls."
        )

    if rr < MIN_RR:
        a.warnings.append(
            f"Reward-to-risk is {rr:.2f}, below the {MIN_RR} floor. "
            f"Setup is directionally valid but priced poorly."
        )
        a.confidence = "Low"
        return

    a.decision = "Buy" if direction == 1 else "Sell"

    if (a.setup == "continuation" and rr >= 2.0
            and a.trend_strength == "Strong"):
        a.confidence = "High"
    elif rr >= MIN_RR:
        a.confidence = "Medium"
    else:
        a.confidence = "Low"

    # A pullback is an entry against current momentum, and a range boundary
    # trade is mean reversion. Neither is a high-confidence trend entry.
    if a.confidence == "High" and (
        a.setup == "pullback" or a.market_structure == "range"
    ):
        a.confidence = "Medium"

    # Divergence against the signal caps confidence.
    if (a.divergence == "bearish" and direction == 1) or (
        a.divergence == "bullish" and direction == -1
    ):
        a.confidence = "Low" if a.confidence == "Medium" else "Medium"

    if capital:
        a.sizing = instruments.size_position(
            capital, entry, stop, instrument, risk_pct
        )
        if not a.sizing.affordable:
            a.decision = "WAIT"
            a.warnings.append(
                "Position cannot be sized within the risk limit — "
                "see sizing note."
            )
