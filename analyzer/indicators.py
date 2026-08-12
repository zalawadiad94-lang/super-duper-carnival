"""Indicator math for gold/silver chart analysis.

Pure standard library. Every function returns a list aligned to the input
series, with ``None`` in positions where the indicator has not yet warmed up.
Keeping the alignment explicit means the engine can never silently read an
indicator value from a bar that did not have enough history behind it.
"""

from __future__ import annotations


def sma(values: list[float], period: int) -> list[float | None]:
    """Simple moving average."""
    if period <= 0:
        raise ValueError("period must be positive")
    out: list[float | None] = [None] * len(values)
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    """Exponential moving average, seeded with the SMA of the first `period`."""
    if period <= 0:
        raise ValueError("period must be positive")
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    k = 2.0 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = (values[i] - prev) * k + prev
        out[i] = prev
    return out


def _wilder_smooth(values: list[float], period: int) -> list[float | None]:
    """Wilder's smoothing: seed with a simple mean, then (prev*(n-1)+x)/n."""
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = (prev * (period - 1) + values[i]) / period
        out[i] = prev
    return out


def rsi(closes: list[float], period: int = 14) -> list[float | None]:
    """Wilder's RSI.

    A period with no losses gives RSI 100 rather than a division error; the
    same convention TradingView and most charting packages use.
    """
    out: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return out

    gains = [0.0] * len(closes)
    losses = [0.0] * len(closes)
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains[i] = max(change, 0.0)
        losses[i] = max(-change, 0.0)

    # Deltas start at index 1, so smooth from there and shift the result back.
    avg_gain = _wilder_smooth(gains[1:], period)
    avg_loss = _wilder_smooth(losses[1:], period)

    for i in range(len(avg_gain)):
        g, l = avg_gain[i], avg_loss[i]
        if g is None or l is None:
            continue
        if l == 0:
            out[i + 1] = 100.0
        else:
            rs = g / l
            out[i + 1] = 100.0 - (100.0 / (1.0 + rs))
    return out


def macd(
    closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    """MACD line, signal line, and histogram."""
    fast_ema = ema(closes, fast)
    slow_ema = ema(closes, slow)

    macd_line: list[float | None] = [
        (f - s) if (f is not None and s is not None) else None
        for f, s in zip(fast_ema, slow_ema)
    ]

    # The signal line is an EMA of the MACD line, which itself only begins at
    # `slow - 1`. Compact the defined section, smooth it, then re-expand.
    defined = [(i, v) for i, v in enumerate(macd_line) if v is not None]
    signal_line: list[float | None] = [None] * len(closes)
    if defined:
        idxs, vals = zip(*defined)
        sig = ema(list(vals), signal)
        for pos, i in enumerate(idxs):
            signal_line[i] = sig[pos]

    hist: list[float | None] = [
        (m - s) if (m is not None and s is not None) else None
        for m, s in zip(macd_line, signal_line)
    ]
    return macd_line, signal_line, hist


def true_range(
    highs: list[float], lows: list[float], closes: list[float]
) -> list[float]:
    """True range. The first bar has no previous close, so it uses H-L."""
    tr = [highs[0] - lows[0]]
    for i in range(1, len(closes)):
        prev_close = closes[i - 1]
        tr.append(
            max(
                highs[i] - lows[i],
                abs(highs[i] - prev_close),
                abs(lows[i] - prev_close),
            )
        )
    return tr


def atr(
    highs: list[float], lows: list[float], closes: list[float], period: int = 14
) -> list[float | None]:
    """Wilder's ATR — the volatility input for stop distance and sizing."""
    return _wilder_smooth(true_range(highs, lows, closes), period)


def vwap(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    volumes: list[float],
    session_starts: list[bool] | None = None,
) -> list[float | None]:
    """Volume-weighted average price, reset at each session boundary.

    VWAP is an intraday measure. On daily-or-higher bars the cumulative
    average is not meaningful, which is why the engine only consults it when
    the timeframe is intraday.
    """
    out: list[float | None] = [None] * len(closes)
    cum_pv = 0.0
    cum_v = 0.0
    for i in range(len(closes)):
        if session_starts is not None and session_starts[i]:
            cum_pv = 0.0
            cum_v = 0.0
        typical = (highs[i] + lows[i] + closes[i]) / 3.0
        cum_pv += typical * volumes[i]
        cum_v += volumes[i]
        out[i] = (cum_pv / cum_v) if cum_v > 0 else None
    return out


def rolling_mean_volume(volumes: list[float], period: int = 20) -> list[float | None]:
    """20-period average volume, the baseline for breakout confirmation."""
    return sma(volumes, period)
