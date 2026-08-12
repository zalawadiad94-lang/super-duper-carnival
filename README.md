# Gold & Silver Technical Analyzer

Computes the standard indicator set on gold and silver OHLC data and produces a
structured analysis report with a trade decision, ATR-based stop, and
risk-first position sizing.

No third-party packages. Python 3.10+.

## Why it takes a CSV instead of fetching

There is no public API that serves TradingView chart data. TradingView's terms
prohibit scraping, their charts are rendered client-side in JavaScript, and
their real-time feeds are licensed from the exchanges — MCX data in particular
is a paid entitlement. Export the data instead, which takes a few seconds:

**TradingView → Export chart data**
1. Open the chart at the timeframe you want.
2. Scroll left far enough to load history — the 200 SMA needs 200 bars, so
   load at least 250.
3. Camera icon → *Export chart data…* → CSV.

Broker terminals also export: Zerodha Kite, Angel One, and Upstox all provide
historical CSV downloads, and MCX publishes daily bhavcopy files.

## Usage

```bash
python3 analyze.py --csv gold.csv --symbol GOLDM --timeframe daily --capital 500000
```

Compare both metals:

```bash
python3 analyze.py --csv gold.csv --silver-csv silver.csv \
    --symbol GOLDM --timeframe daily
```

The CSV needs `open`, `high`, `low`, `close` columns; `time` and `volume` are
used when present. Column names are matched loosely, so TradingView and broker
exports both load without editing. Newest-first files are reordered
automatically.

### Symbols

MCX: `GOLD`, `GOLDM`, `GOLDGUINEA`, `GOLDPETAL`, `SILVER`, `SILVERM`,
`SILVERMIC` · International: `XAUUSD`, `XAGUSD`, `GC`, `SI`

Contract multipliers drive position sizing. Verify them against your broker's
contract note before trading — exchanges revise specifications.

## What it computes

200 SMA (primary trend) · 20/50 EMA (short and medium trend) · RSI 14 with
divergence · MACD 12/26/9 · ATR 14 (stop distance and sizing) · VWAP
(intraday only) · volume vs 20-period average · gold/silver ratio · swing-based
market structure and support/resistance zones.

## Design decisions worth knowing

**Volume is only trusted on real exchange contracts.** Spot and CFD feeds
(`XAUUSD`, `XAGUSD`) report tick counts from one broker, not traded volume, so
they cannot confirm a breakout. The analyzer flags this rather than pretending
otherwise. MCX and COMEX volume is genuine and is used.

**VWAP is skipped above intraday timeframes.** A cumulative volume-weighted
average across months is not meaningful.

**Zones are bands, not lines.** Swing points within 0.6 ATR merge into one
zone carrying a touch count. Price reacts to areas.

**Structure classification is ATR-relative.** A swing high a few ticks above
the previous one is not a higher high. Swings contained within 1 ATR are a
range regardless of how the last two are ordered — without this, flat markets
read as trends.

**Location gates the signal.** Inside a range, trend votes are unreliable
because the same oscillation that produces them reverses at the boundary. Long
signals require the lower boundary, shorts the upper. Mid-range and
wrong-boundary setups return WAIT.

**Stops come from ATR, targets from structure.** Stops sit 1.5 ATR beyond the
structural level. Silver's ATR relative to price runs well above gold's, so a
fixed stop that suits gold gets run over on silver.

**Sizing derives lots from stop distance.** If one lot risks more than the
budget, that is reported as unaffordable with smaller contracts suggested — it
is never solved by tightening the stop. Risk is hard-capped at 1% of capital
regardless of what is passed to `--risk-pct`.

## When it returns WAIT

- Fewer than 4 agreeing indicator votes, or more than 1 dissenting
- Reward-to-risk below 1.5 to Target 1
- Range conditions with price at the wrong boundary or mid-band
- No zone available to anchor a stop, or price extended past the target zone
- Position cannot be sized within the 1% risk limit

## Tests

```bash
python3 -m unittest discover -s tests
```

Test fixtures are synthetic and exercise code paths only. They are not market
data.

## Limitations

Open interest is not included — it is one of the more informative inputs for
MCX and COMEX futures (price up with OI up means new longs; price up with OI
down means short covering), but standard chart exports do not carry it. Feed it
in separately if your broker provides it.

There is no live economic calendar, so the report prints a checklist of
recurring high-volatility events to verify manually rather than claiming to
know what is scheduled.

For MCX specifically, price is a function of international gold, USDINR, and
import duty. A rupee move can produce an MCX trend with no move in dollar gold.
Track USDINR alongside DXY.

## Not financial advice

This computes indicators and applies a rule set. Indicator confluence expresses
probability, not certainty. Every element is a filter, and the risk limits are
what determine survival when the read is wrong — which it regularly will be.
