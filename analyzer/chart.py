"""Inline SVG chart rendering.

Produces a self-contained SVG: candles, moving averages, support and
resistance bands, and the entry/stop/target levels, with volume and RSI
panels beneath. Colours come from CSS custom properties so the same markup
works in light and dark themes; every property has a fallback so the SVG is
still readable standalone.
"""

from __future__ import annotations

from datetime import datetime

from . import indicators
from .data import Series
from .engine import Analysis

W = 1000
PRICE_H = 380
VOL_H = 70
RSI_H = 90
GAP = 26
PAD_L = 8
PAD_R = 86
TOP = 16

TOTAL_H = TOP + PRICE_H + GAP + VOL_H + GAP + RSI_H + 34


def _esc(text: str) -> str:
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _fmt(v: float) -> str:
    if abs(v) >= 1000:
        return f"{v:,.0f}"
    if abs(v) >= 10:
        return f"{v:,.2f}"
    return f"{v:,.3f}"


def _date_label(t: datetime | None) -> str:
    return t.strftime("%d %b %y") if t else ""


def render_svg(series: Series, analysis: Analysis, bars: int = 140) -> str:
    """Render the most recent `bars` bars with the analysis overlaid."""
    n = min(bars, len(series))
    if n < 2:
        return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

    # Indicators are computed on the full series, then sliced, so values near
    # the left edge are correct rather than restarted from a truncated window.
    ema20 = indicators.ema(series.closes, 20)[-n:]
    ema50 = indicators.ema(series.closes, 50)[-n:]
    sma200 = indicators.sma(series.closes, 200)[-n:]
    rsi14 = indicators.rsi(series.closes, 14)[-n:]
    vol_avg = indicators.rolling_mean_volume(series.volumes, 20)[-n:]

    highs = series.highs[-n:]
    lows = series.lows[-n:]
    opens = series.opens[-n:]
    closes = series.closes[-n:]
    volumes = series.volumes[-n:]
    times = series.times[-n:]

    levels = [v for v in (analysis.entry, analysis.stop, analysis.target1,
                          analysis.target2) if v is not None]
    zone_edges: list[float] = []
    for z in analysis.supports + analysis.resistances:
        zone_edges += [z.low, z.high]

    lo = min(lows + levels + zone_edges)
    hi = max(highs + levels + zone_edges)
    span = (hi - lo) or 1.0
    lo -= span * 0.06
    hi += span * 0.06
    span = hi - lo

    plot_w = W - PAD_L - PAD_R
    step = plot_w / n
    body = max(1.6, step * 0.6)

    def x(i: int) -> float:
        return PAD_L + step * (i + 0.5)

    def y(price: float) -> float:
        return TOP + PRICE_H - ((price - lo) / span) * PRICE_H

    parts: list[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {TOTAL_H}" '
        f'width="100%" role="img" aria-label="Price chart with analysis levels">',
        _STYLE,
    ]

    # --- Price gridlines ---
    for k in range(5):
        gy = TOP + PRICE_H * k / 4
        price = hi - span * k / 4
        parts.append(f'<line class="grid" x1="{PAD_L}" y1="{gy:.1f}" '
                     f'x2="{W - PAD_R}" y2="{gy:.1f}"/>')
        parts.append(f'<text class="axis" x="{W - PAD_R + 6}" y="{gy + 4:.1f}">'
                     f'{_fmt(price)}</text>')

    # --- Zones behind price ---
    for z in analysis.supports:
        parts.append(_zone_rect(z, y, "support"))
    for z in analysis.resistances:
        parts.append(_zone_rect(z, y, "resistance"))

    # --- Candles ---
    for i in range(n):
        up = closes[i] >= opens[i]
        cls = "up" if up else "down"
        cx = x(i)
        parts.append(f'<line class="wick {cls}" x1="{cx:.1f}" '
                     f'y1="{y(highs[i]):.1f}" x2="{cx:.1f}" '
                     f'y2="{y(lows[i]):.1f}"/>')
        top = y(max(opens[i], closes[i]))
        bot = y(min(opens[i], closes[i]))
        parts.append(f'<rect class="body {cls}" x="{cx - body / 2:.1f}" '
                     f'y="{top:.1f}" width="{body:.1f}" '
                     f'height="{max(1.0, bot - top):.1f}"/>')

    # --- Moving averages ---
    for values, cls, label in (
        (sma200, "ma200", "200 SMA"),
        (ema50, "ma50", "50 EMA"),
        (ema20, "ma20", "20 EMA"),
    ):
        path = _polyline(values, x, y)
        if path:
            parts.append(f'<polyline class="ma {cls}" points="{path}"/>')

    # --- Trade levels ---
    for value, cls, label in (
        (analysis.entry, "entry", "Entry"),
        (analysis.stop, "stop", "Stop"),
        (analysis.target1, "target", "T1"),
        (analysis.target2, "target", "T2"),
    ):
        if value is None:
            continue
        ly = y(value)
        parts.append(f'<line class="level {cls}" x1="{PAD_L}" y1="{ly:.1f}" '
                     f'x2="{W - PAD_R}" y2="{ly:.1f}"/>')
        parts.append(f'<text class="level-label {cls}" x="{PAD_L + 6}" '
                     f'y="{ly - 5:.1f}">{label} {_fmt(value)}</text>')

    # --- Volume panel ---
    vtop = TOP + PRICE_H + GAP
    vmax = max(volumes) or 1.0
    if series.has_volume:
        for i in range(n):
            h = (volumes[i] / vmax) * VOL_H
            cls = "up" if closes[i] >= opens[i] else "down"
            parts.append(f'<rect class="vol {cls}" x="{x(i) - body / 2:.1f}" '
                         f'y="{vtop + VOL_H - h:.1f}" width="{body:.1f}" '
                         f'height="{max(0.5, h):.1f}"/>')
        avg_path = _polyline(
            vol_avg, x, lambda v: vtop + VOL_H - (v / vmax) * VOL_H)
        if avg_path:
            parts.append(f'<polyline class="vol-avg" points="{avg_path}"/>')
        parts.append(f'<text class="panel-label" x="{PAD_L + 4}" '
                     f'y="{vtop + 12}">Volume (20-period average)</text>')
    else:
        parts.append(f'<text class="panel-label" x="{PAD_L + 4}" '
                     f'y="{vtop + 12}">No volume data</text>')

    # --- RSI panel ---
    rtop = vtop + VOL_H + GAP

    def ry(v: float) -> float:
        return rtop + RSI_H - (v / 100.0) * RSI_H

    for lvl in (30, 50, 70):
        cls = "grid" if lvl == 50 else "rsi-band"
        parts.append(f'<line class="{cls}" x1="{PAD_L}" y1="{ry(lvl):.1f}" '
                     f'x2="{W - PAD_R}" y2="{ry(lvl):.1f}"/>')
        parts.append(f'<text class="axis" x="{W - PAD_R + 6}" '
                     f'y="{ry(lvl) + 4:.1f}">{lvl}</text>')
    rsi_path = _polyline(rsi14, x, ry)
    if rsi_path:
        parts.append(f'<polyline class="rsi" points="{rsi_path}"/>')
    parts.append(f'<text class="panel-label" x="{PAD_L + 4}" '
                 f'y="{rtop + 12}">RSI 14</text>')

    # --- Date axis ---
    for i in (0, n // 2, n - 1):
        label = _date_label(times[i])
        if label:
            anchor = "start" if i == 0 else ("end" if i == n - 1 else "middle")
            parts.append(f'<text class="axis" x="{x(i):.1f}" '
                         f'y="{TOTAL_H - 10}" text-anchor="{anchor}">'
                         f'{_esc(label)}</text>')

    parts.append("</svg>")
    return "".join(parts)


def _zone_rect(zone, y, kind: str) -> str:
    top = y(zone.high)
    bottom = y(zone.low)
    return (f'<rect class="zone {kind}" x="{PAD_L}" y="{top:.1f}" '
            f'width="{W - PAD_R - PAD_L}" '
            f'height="{max(1.5, bottom - top):.1f}"><title>'
            f'{kind} {_fmt(zone.low)}-{_fmt(zone.high)}, '
            f'{zone.touches} touches</title></rect>')


def _polyline(values, x, y) -> str:
    pts = [f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(values) if v is not None]
    return " ".join(pts) if len(pts) > 1 else ""


_STYLE = """<style>
.grid{stroke:var(--chart-grid,#e3e6ea);stroke-width:1}
.rsi-band{stroke:var(--chart-grid,#e3e6ea);stroke-width:1;stroke-dasharray:3 3}
.axis,.panel-label{fill:var(--chart-muted,#71767c);font:11px ui-sans-serif,system-ui,sans-serif}
.wick{stroke-width:1}
.wick.up,.body.up{stroke:var(--chart-up,#1a9f6b)}
.wick.down,.body.down{stroke:var(--chart-down,#d3455b)}
.body.up{fill:var(--chart-up,#1a9f6b)}
.body.down{fill:var(--chart-down,#d3455b)}
.ma{fill:none;stroke-width:1.5}
.ma200{stroke:var(--chart-ma200,#8a63d2)}
.ma50{stroke:var(--chart-ma50,#e08b2e)}
.ma20{stroke:var(--chart-ma20,#3b82c4)}
.zone{opacity:.16}
.zone.support{fill:var(--chart-up,#1a9f6b)}
.zone.resistance{fill:var(--chart-down,#d3455b)}
.level{stroke-width:1.5;stroke-dasharray:6 4}
.level.entry{stroke:var(--chart-entry,#2f7fd4)}
.level.stop{stroke:var(--chart-down,#d3455b)}
.level.target{stroke:var(--chart-up,#1a9f6b)}
.level-label{font:600 11px ui-sans-serif,system-ui,sans-serif}
.level-label.entry{fill:var(--chart-entry,#2f7fd4)}
.level-label.stop{fill:var(--chart-down,#d3455b)}
.level-label.target{fill:var(--chart-up,#1a9f6b)}
.vol.up{fill:var(--chart-up,#1a9f6b);opacity:.45}
.vol.down{fill:var(--chart-down,#d3455b);opacity:.45}
.vol-avg{fill:none;stroke:var(--chart-ma50,#e08b2e);stroke-width:1.3}
.rsi{fill:none;stroke:var(--chart-ma200,#8a63d2);stroke-width:1.5}
</style>"""
