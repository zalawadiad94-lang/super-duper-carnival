"""Market structure: swing points, support/resistance zones, divergence.

Zones are built by clustering swing points that sit within a fraction of ATR
of each other. Price reacts to areas rather than to exact numbers, so a zone
carries a low/high band and a touch count instead of a single level.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Swing:
    index: int
    price: float
    kind: str  # "high" or "low"


@dataclass
class Zone:
    low: float
    high: float
    touches: int
    kind: str  # "support" or "resistance"
    last_index: int

    @property
    def mid(self) -> float:
        return (self.low + self.high) / 2.0

    def __str__(self) -> str:
        return f"{self.low:,.2f} - {self.high:,.2f} ({self.touches} touches)"


def find_swings(
    highs: list[float], lows: list[float], left: int = 2, right: int = 2
) -> list[Swing]:
    """Fractal swing detection.

    A bar is a swing high when its high is the highest across `left` bars
    before and `right` bars after. The final `right` bars are excluded — a
    swing is not confirmed until enough bars have printed after it.
    """
    swings: list[Swing] = []
    for i in range(left, len(highs) - right):
        window_h = highs[i - left : i + right + 1]
        window_l = lows[i - left : i + right + 1]
        if highs[i] == max(window_h) and window_h.count(highs[i]) == 1:
            swings.append(Swing(i, highs[i], "high"))
        elif lows[i] == min(window_l) and window_l.count(lows[i]) == 1:
            swings.append(Swing(i, lows[i], "low"))
    return swings


# A swing must differ from the previous one by this fraction of ATR before it
# counts as higher or lower. Without it, sub-noise differences on a flat
# market read as a trend.
SIGNIFICANCE_ATR = 0.25

# Recent swings contained inside this many ATR are a range, however their
# last two points happen to be ordered.
CONTAINMENT_ATR = 1.0

# Hard cap on how wide a single support/resistance zone may grow. A band
# several ATR tall cannot anchor a stop and is not a level in any useful sense.
MAX_ZONE_ATR = 1.5


def describe_structure(
    swings: list[Swing], atr_value: float = 0.0, lookback: int = 6
) -> tuple[str, str]:
    """Classify structure from recent swings.

    Returns (structure, strength) where structure is one of
    "higher highs and higher lows", "lower highs and lower lows", or "range".

    Comparisons are ATR-relative: a swing high a few ticks above the last one
    is not a higher high, and swings contained within a narrow band are a
    range no matter how the final two are ordered.
    """
    highs = [s for s in swings if s.kind == "high"][-lookback:]
    lows = [s for s in swings if s.kind == "low"][-lookback:]

    if len(highs) < 2 or len(lows) < 2:
        return "insufficient swing history", "Weak"

    threshold = atr_value * SIGNIFICANCE_ATR if atr_value > 0 else 0.0

    if atr_value > 0 and len(highs) >= 3 and len(lows) >= 3:
        high_spread = max(h.price for h in highs) - min(h.price for h in highs)
        low_spread = max(l.price for l in lows) - min(l.price for l in lows)
        band = CONTAINMENT_ATR * atr_value
        if high_spread < band and low_spread < band:
            return "range", "Weak"

    hh = highs[-1].price > highs[-2].price + threshold
    hl = lows[-1].price > lows[-2].price + threshold
    lh = highs[-1].price < highs[-2].price - threshold
    ll = lows[-1].price < lows[-2].price - threshold

    # A third swing in agreement upgrades strength from moderate to strong.
    def extended(seq: list[Swing], rising: bool) -> bool:
        if len(seq) < 3:
            return False
        if rising:
            return (seq[-1].price > seq[-2].price + threshold
                    and seq[-2].price > seq[-3].price + threshold)
        return (seq[-1].price < seq[-2].price - threshold
                and seq[-2].price < seq[-3].price - threshold)

    if hh and hl:
        strong = extended(highs, True) and extended(lows, True)
        return "higher highs and higher lows", "Strong" if strong else "Moderate"
    if lh and ll:
        strong = extended(highs, False) and extended(lows, False)
        return "lower highs and lower lows", "Strong" if strong else "Moderate"
    return "range", "Weak"


def build_zones(
    swings: list[Swing], current_price: float, atr_value: float, max_zones: int = 4
) -> tuple[list[Zone], list[Zone]]:
    """Cluster swing points into support and resistance zones.

    Swings within 0.6 ATR of each other merge into one zone. A level touched
    repeatedly is more significant than one touched once, so zones are ranked
    by touch count before proximity to price.
    """
    if atr_value <= 0 or not swings:
        return [], []

    tolerance = atr_value * 0.6
    # Neighbour-distance clustering alone chains: on a busy chart every swing
    # sits within tolerance of the previous one and the whole range collapses
    # into a single "zone". Capping total width keeps zones tradeable.
    max_width = atr_value * MAX_ZONE_ATR
    clusters: list[list[Swing]] = []

    for swing in sorted(swings, key=lambda s: s.price):
        if (
            clusters
            and abs(swing.price - clusters[-1][-1].price) <= tolerance
            and (swing.price - clusters[-1][0].price) <= max_width
        ):
            clusters[-1].append(swing)
        else:
            clusters.append([swing])

    zones: list[Zone] = []
    for cluster in clusters:
        prices = [s.price for s in cluster]
        lo, hi = min(prices), max(prices)
        # A single-touch swing still defines a band, not a line.
        if hi - lo < tolerance * 0.4:
            pad = (tolerance * 0.4 - (hi - lo)) / 2
            lo, hi = lo - pad, hi + pad
        kind = "resistance" if (lo + hi) / 2 > current_price else "support"
        zones.append(Zone(lo, hi, len(cluster), kind, max(s.index for s in cluster)))

    supports = [z for z in zones if z.kind == "support"]
    resistances = [z for z in zones if z.kind == "resistance"]

    # Nearest to price first, tie-broken by how often the level was respected.
    supports.sort(key=lambda z: (current_price - z.high, -z.touches))
    resistances.sort(key=lambda z: (z.low - current_price, -z.touches))

    return supports[:max_zones], resistances[:max_zones]


def detect_divergence(
    swings: list[Swing], rsi_values: list[float | None]
) -> str | None:
    """Compare the last two price swings against RSI at those same bars.

    Bullish: price makes a lower low while RSI makes a higher low.
    Bearish: price makes a higher high while RSI makes a lower high.

    Divergence is a caution flag, not a trigger — in a strong trend it can
    persist for many bars before price responds, if it responds at all.
    """
    lows = [s for s in swings if s.kind == "low"]
    highs = [s for s in swings if s.kind == "high"]

    if len(lows) >= 2:
        a, b = lows[-2], lows[-1]
        ra, rb = rsi_values[a.index], rsi_values[b.index]
        if ra is not None and rb is not None:
            if b.price < a.price and rb > ra:
                return "bullish"

    if len(highs) >= 2:
        a, b = highs[-2], highs[-1]
        ra, rb = rsi_values[a.index], rsi_values[b.index]
        if ra is not None and rb is not None:
            if b.price > a.price and rb < ra:
                return "bearish"

    return None
