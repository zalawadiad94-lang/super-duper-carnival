# super-duper-carnival

## Market Pulse — live data dashboard

`index.html` is a static dashboard showing live market data via
[TradingView's free embeddable widgets](https://www.tradingview.com/widget/):
a scrolling ticker tape, a live advanced chart, a market overview panel
(indices / forex / crypto), and a live news timeline. These widgets stream
data directly from TradingView to the visitor's browser — no API key or
backend required.

There is no official public API for arbitrary TradeView/MarketPulse data
feeds, so this uses TradingView's sanctioned widget embeds instead, which is
the standard way to get real-time quotes and charts on a page for free.

### Run it

No build step needed — just serve the directory and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

### Customize

- Change the main chart's default symbol/interval in the `TradingView.widget(...)`
  call in `index.html` (or use the symbol search box on the chart itself).
- Edit the `symbols` / `tabs` arrays in the ticker tape and market overview
  widgets to track different instruments.
