# QuantEdge Multi-Market Pro

Non-repainting trend + momentum trading system for TradingView, written in **Pine Script v6**.
Built for Indian markets (NIFTY, BANKNIFTY, SENSEX, CRUDEOIL, NATURALGAS, GOLD, SILVER, cash
equities) and works unchanged on global stocks, indices and commodities.

| File | What it is |
|---|---|
| `pine/QuantEdge_MultiMarket_Indicator.pine` | The signal engine: arrows, levels, dashboard, alerts |
| `pine/QuantEdge_MultiMarket_Strategy.pine` | The backtestable twin, same entry logic + order management |

## Installing

1. TradingView → **Pine Editor** → *Open* → *New blank indicator*.
2. Paste the contents of one file, click **Save**, then **Add to chart**.
3. Repeat in a second tab for the strategy version.

The two scripts share identical signal logic, so the strategy's trade list is a faithful
backtest of what the indicator paints.

## Signal logic in one paragraph

A long needs **all** of: fast EMA above slow EMA (with slope agreeing), price above the selected
trend reference, higher-timeframe trend bullish, RSI above the entry threshold but below
overbought, MACD above signal with an expanding histogram, ADX above the minimum with +DI
leading, ATR% inside the chosen volatility regime, the market not consolidating, and a bullish
candle **closing** above the prior N-bar high. Shorts are the exact mirror. On top of that the
composite Signal Quality Score (0–100) must clear the minimum, 70 by default.

## Recommended starting settings

| Instrument | Chart TF | HTF | ATR SL | Notes |
|---|---|---|---|---|
| NIFTY / BANKNIFTY intraday | 5m or 15m | 60 | 1.5 | Keep VWAP filter on |
| SENSEX intraday | 15m | 60 | 1.5 | Lot size 20 |
| CRUDEOIL / NATURALGAS | 15m or 30m | 120 | 2.0 | Volatility mode *High*, raise min ATR% |
| GOLD / SILVER | 30m or 60m | 240 | 1.5 | Point value 100 / 30 |
| Cash equities positional | 1D | 1W | 2.0 | Turn VWAP filter off |

Verify contract multipliers and lot sizes with your broker before trusting the sizing panel —
exchange lot sizes change.

## Position sizing

```
Risk amount   = Account capital × Risk % ÷ 100
Position size = Risk amount ÷ (|Entry − Stop| × Point value)
```

The result is rounded **down** to the lot step and rejected if it lands below the minimum lot
(the dashboard shows `< min lot` instead of silently sizing you into something you cannot trade).
For cash equities leave point value at 1; for commodities set it to the contract multiplier.

## Alerts

Both scripts emit JSON. Two routes:

* **Condition-based** — in the alert dialog pick the script, then choose *Long Entry*,
  *Short Entry*, *Long Stop-Loss Hit*, *Short Stop-Loss Hit*, *Target 1/2/3 Reached*,
  *Trend Reversal*, or *High Volatility Warning*. Live numbers arrive through
  `{{plot("Entry")}}`-style placeholders.
* **`alert()` calls** — choose *Any alert() function call* for a fully dynamic payload that
  includes exchange, R:R, quantity and a formatted timestamp.

The strategy additionally carries `alert_message` on every order, so *Order fills only* alerts
deliver the same schema.

```json
{
  "symbol": "BANKNIFTY",
  "exchange": "NSE",
  "timeframe": "15",
  "event": "ENTRY",
  "direction": "LONG",
  "entry": "48250.55",
  "stop_loss": "48100.20",
  "target_1": "48400.90",
  "target_2": "48551.25",
  "target_3": "48701.60",
  "rr": "1:3",
  "qty": "35",
  "signal_score": "84",
  "price": "48250.55",
  "timestamp": "2026-08-13 11:45:00"
}
```

## Non-repainting guarantees

* No `lookahead_on`, anywhere.
* One `request.security()` call, `barmerge.lookahead_off`, reading the **previous, fully closed**
  higher-timeframe bar. Values for a given chart bar can never be revised afterwards.
* Every state transition is gated by `barstate.isconfirmed`.
* Entry, stop and targets are frozen at entry; only the trailing stop moves, and only in the
  favourable direction.
* Setting *Use confirmed HTF bar* to OFF trades that guarantee for lower lag. The tooltip says so.

Full reasoning is in the header comment of each file.

## Known limitations

* Intrabar sequencing: when one candle touches both stop and target, TradingView's emulator has
  to guess the order. Use a timeframe where the ATR stop comfortably exceeds one candle's range.
* Cooldown plus one-trade-at-a-time means the engine never pyramids and never reverses inside a
  single candle.
* The HTF filter costs up to one HTF bar of lag by design. That is the price of not repainting.
* Options premiums, illiquid symbols and symbols without volume degrade the VWAP filter — it
  disables itself outside intraday timeframes.
* Backtest results assume the commission and slippage in Properties are realistic for your
  broker. Indian intraday brokerage plus STT is frequently higher than the 0.03% default.

**Not investment advice.** Forward-test on paper before committing capital.
