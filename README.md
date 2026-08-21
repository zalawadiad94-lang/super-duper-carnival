# super-duper-carnival

## My Watchlist — live MCX/NSE dashboard

`index.html` is a static dashboard built around this specific watchlist
(MCX commodity futures + NSE index futures), using
[TradingView's free embeddable widgets](https://www.tradingview.com/widget/):
a ticker strip, a live advanced chart with a clickable watchlist panel, a
per-symbol quotes panel with mini charts, and a market news feed. These
stream data directly from TradingView to the visitor's browser — no API key,
backend, or broker connector required.

There's no public API for the original broker app's own feed (or for
"MarketPulse"), so this maps the watchlist to the equivalent live TradingView
symbols instead:

| Your watchlist | TradingView symbol      |
| --------------- | ------------------------ |
| SILVERSEP        | `MCX:SILVER1!`            |
| NIFTY/08         | `NSE:NIFTY1!`             |
| BANKNIFTY/08     | `NSE:BANKNIFTY1!`         |
| GOLDOCT          | `MCX:GOLD1!`              |
| CRUDEAUG         | `MCX:CRUDEOIL1!`          |
| COPPERAUG        | `MCX:COPPER1!`            |

The `1!` suffix means "continuous front-month futures" — TradingView doesn't
expose your broker's exact monthly contract codes, but the continuous
contract tracks the same underlying market. If MCX/NSE prices come through
delayed rather than tick-live, that's TradingView's free-tier data license
for Indian exchanges (a TradingView account with real-time NSE/MCX data
add-ons removes the delay) — matching your broker's exact bid/ask numbers
would need that broker's own market-data API, which isn't available here.

### Run it

No build step needed — just serve the directory and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

### Customize

- Click a row in the main chart's watchlist panel (or use the symbol search
  box) to switch which instrument the chart shows.
- Edit the `symbols` arrays in the ticker tape / quotes panel, and the
  `watchlist` array in the `TradingView.widget(...)` call, to track different
  instruments.
