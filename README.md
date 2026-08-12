# Chart Analyzer — commodities, MCX and stocks

Computes an indicator set on OHLC data and returns a structured decision with
an ATR-based stop, targets, and risk-capped position sizing. Runs as a browser
app, a CLI, or a Python package.

No third-party packages. Python 3.10+.

## Running it

**Double-click a launcher** — no command line needed:

- Windows: `Start-Windows.bat`
- macOS / Linux: `Start-Mac-Linux.command`

Your browser opens at `http://127.0.0.1:8000`. The launchers check for
Python 3.10+ and print install instructions if it is missing. On macOS, the
first run may need right-click → Open, to satisfy Gatekeeper on an unsigned
script.

**Or from a terminal:**

```bash
python3 app.py --open        # browser interface
python3 -m unittest discover -s tests
```

## What it produces

Market bias · trend strength · market structure · support and resistance zones
· per-indicator confirmation · entry · stop-loss · Target 1 and 2 ·
reward-to-risk · invalidation level · Buy / Sell / **WAIT** · confidence ·
position size.

Indicators: 200 SMA, 20/50 EMA, RSI 14 with divergence, MACD 12/26/9, ATR 14,
VWAP (intraday), volume against its 20-period average, and a relative-strength
ratio between two instruments.

## Interfaces

**Browser** — `python3 app.py --open`. Upload a CSV or pull from a live
provider, with optional auto-refresh, an annotated chart, and a watchlist
scanner. Binds to localhost only; do not expose it without putting auth in
front, since the form can carry broker credentials.

**CLI**

```bash
# From a chart export
python3 analyze.py --csv gold.csv --symbol GOLDM --timeframe daily \
    --capital 500000 --svg chart.svg

# From a provider
python3 analyze.py --provider yahoo --symbol RELIANCE --timeframe daily
python3 analyze.py --provider angelone --symbol CRUDEOIL --timeframe 15m

# Watchlist
python3 analyze.py --provider yahoo --timeframe daily \
    --scan GOLDM,SILVERM,RELIANCE,TCS
python3 analyze.py --scan-dir ./exports --timeframe daily

# Confirm a feed works before relying on it
python3 analyze.py --provider angelone --symbol GOLD --timeframe 15m --check-feed
```

## Data sources

| Provider | Covers | Latency | Credentials |
|---|---|---|---|
| `csv` | anything you can export | offline | none |
| `yahoo` | global commodities, indices, equities | ~15 min delayed | none |
| `angelone` | NSE and MCX | real time | free SmartAPI app |

**There is no free real-time feed for Indian exchange data.** NSE and MCX
prices are a licensed entitlement; live access means a broker API with your
own credentials. Angel One's SmartAPI tier is free, Dhan and Fyers are
comparable, and Zerodha's Kite Connect is around ₹2,000/month. Yahoo carries
no MCX contracts at all.

Angel One reads `ANGEL_API_KEY`, `ANGEL_CLIENT_CODE`, `ANGEL_PIN`, and
`ANGEL_TOTP` from the environment and never writes them to disk. `ANGEL_TOTP`
is the rotating 6-digit code; for unattended runs, generate it from your TOTP
secret with `pyotp` rather than pasting a code that expires in 30 seconds.

### On refresh rate

Indicator values only change meaningfully when a bar closes. Polling a
15-minute chart every second repaints an unfinished candle and changes no
signal. Refresh on the order of your timeframe; per-tick streaming only
matters for second-by-second scalping, which this tool does not target.

The network providers are written against published API contracts but were
developed in a sandbox without outbound network access, so they have not been
executed end to end. The CSV path is fully covered by tests. Use
`--check-feed` to verify a live provider before trusting it.

### Getting a CSV

TradingView has no public data API — charts render client-side, their terms
prohibit scraping, and their exchange feeds are licensed. Export instead:
open the chart, scroll left until 250+ bars are loaded (the 200 SMA needs
200), then camera icon → *Export chart data* → CSV. Zerodha Kite, Angel One,
and Upstox export history too, and MCX publishes daily bhavcopy files.

Columns `open`, `high`, `low`, `close` are required; `time` and `volume` are
used when present. Header names are matched loosely, and newest-first files
are reordered automatically.

## Instruments

MCX bullion, energy, and base metals (`GOLD`, `GOLDM`, `SILVERM`, `CRUDEOIL`,
`NATURALGAS`, `COPPER`, `ZINC`, `ALUMINIUM`, …), international futures and
spot (`GC`, `SI`, `CL`, `XAUUSD`, `XAGUSD`), and indices.

**Any unlisted symbol is treated as an equity and sized in shares**, so stocks
work without a lookup table. For index or stock F&O, pass `--lot-size` —
exchange lot sizes are revised often and a stale multiplier silently produces
the wrong position. Verify contract specs against your broker's contract note.

## Design decisions worth knowing

**Volume is only trusted on real exchange contracts.** Spot and CFD feeds
report one broker's tick count, not traded volume, so they cannot confirm a
breakout. MCX, COMEX, and NSE volume is genuine and is used.

**VWAP is skipped above intraday timeframes**, where a cumulative
volume-weighted average is not meaningful.

**Zones are bands, not lines**, built by clustering swings within 0.6 ATR and
capped at 1.5 ATR wide. Without the cap, dense swings chain into one band
covering most of the chart, which cannot anchor a stop.

**Structure classification is ATR-relative.** A swing high a few ticks above
the previous one is not a higher high, and swings contained within 1 ATR are a
range however the last two are ordered.

**Trend checks and timing checks are separated.** Direction comes from the
200 SMA, the 20/50 EMA relationship, and swing structure. RSI, MACD, VWAP, and
price-versus-50-EMA are timing checks that may dissent without vetoing a
trade — during a pullback they point against the trend by definition. Counting
them together made pullback entries impossible and left only breakouts, which
contradicts a trend-first method.

**Location gates the signal.** A pullback entry is only taken at the matching
zone: buying a dip into support, selling a rally into resistance. Momentum
against the trend with price mid-range is chasing, and returns WAIT.

**Targets skip minor intervening levels — outside a range.** Target 1 is the
first zone at least 1.5x the risk away, with the number of levels passed
through reported. Always taking the nearest zone rejected around 80% of
otherwise valid trend trades because a minor level usually sits inside the
stop distance. Inside a range nothing is skipped: the boundary is the trade.

**Stops come from ATR, targets from structure.** Stops sit 1.5 ATR beyond the
structural level. Silver's ATR relative to price runs well above gold's, so a
fixed stop suited to gold gets run over on silver.

**Sizing derives quantity from stop distance.** If one lot or share risks more
than the budget, that is reported as unaffordable with smaller contracts
suggested — never solved by tightening the stop. Risk is hard-capped at 1% of
capital regardless of what is passed to `--risk-pct`.

**Asset-class risks are surfaced.** Equities gap over stops on news and
corporate actions, and unadjusted history distorts every indicator. Futures
expire and roll. MCX prices move on USDINR and import duty independently of
the underlying commodity.

## When it returns WAIT

- Fewer than 2 trend checks agree, or any trend check dissents
- Momentum against the trend while price is not at the matching zone
- Range conditions with price at the wrong boundary, mid-band, or with no
  target ahead
- Reward-to-risk below 1.5 to Target 1
- No zone available to anchor a stop, or price already past the target zone
- The position cannot be sized within the 1% risk limit

Across 400 synthetic market shapes the engine signals on roughly half and
waits on the rest, with rejections spread across those causes rather than
concentrated in one. That distribution is a sanity check on the rule set, not
a performance claim.

## Limitations

**Open interest is not included.** It is among the more informative inputs for
MCX and COMEX futures — price up with OI up means new longs, price up with OI
down means short covering — but standard chart exports do not carry it.

**There is no economic calendar.** The report prints a checklist of recurring
high-volatility events to verify manually rather than claiming to know what is
scheduled.

**No backtest.** The rule set is not validated against historical outcomes.
The synthetic sweep above confirms the rules behave as written; it says
nothing about whether they make money.

## Not financial advice

This computes indicators and applies a rule set. Indicator confluence
expresses probability, not certainty. Every element is a filter, and the risk
limits are what determine survival when the read is wrong — which it regularly
will be.
