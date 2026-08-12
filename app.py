#!/usr/bin/env python3
"""Browser front end for the chart analyzer.

    python3 app.py                 # then open http://127.0.0.1:8000
    python3 app.py --port 9000 --open

Standard library only — no framework, no CDN, works offline. Binds to
localhost by default because the analysis form can carry broker credentials
and a watchlist; do not expose it to a network without putting auth in front.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from analyzer import chart, feeds, instruments, scanner
from analyzer.data import INTRADAY, load_csv
from analyzer.engine import analyse
from analyzer.report import EVENT_CHECKLIST

TIMEFRAMES = ["15m", "1h", "4h", "daily", "weekly"]
MAX_BODY = 12 * 1024 * 1024  # generous for a pasted CSV, bounded for safety


def analysis_to_dict(a, svg: str) -> dict:
    return {
        "symbol": a.symbol,
        "timeframe": a.timeframe,
        "price": a.price,
        "bias": a.bias,
        "trendStrength": a.trend_strength,
        "marketStructure": a.market_structure,
        "condition": a.condition,
        "atr": a.atr_value,
        "decision": a.decision,
        "confidence": a.confidence,
        "entry": a.entry,
        "stop": a.stop,
        "target1": a.target1,
        "target2": a.target2,
        "rr": a.rr,
        "invalidation": a.invalidation,
        "supports": [{"low": z.low, "high": z.high, "touches": z.touches}
                     for z in a.supports],
        "resistances": [{"low": z.low, "high": z.high, "touches": z.touches}
                        for z in a.resistances],
        "votes": [{"name": v.name, "direction": v.direction, "detail": v.detail}
                  for v in a.votes],
        "volumeNote": a.volume_note,
        "divergence": a.divergence,
        "warnings": a.warnings,
        "sizing": ({"message": a.sizing.message, "affordable": a.sizing.affordable,
                    "unit": a.sizing.unit} if a.sizing else None),
        "instrument": (
            {"name": a.instrument.name, "currency": a.instrument.currency,
             "multiplier": a.instrument.multiplier,
             "assetClass": a.instrument.asset_class,
             "quoteUnit": a.instrument.quote_unit}
            if a.instrument else None),
        "events": list(EVENT_CHECKLIST),
        "svg": svg,
    }


def _load_series(payload: dict):
    """Resolve the requested provider into a Series."""
    provider = (payload.get("provider") or "csv").lower()
    symbol = (payload.get("symbol") or "").strip().upper()
    timeframe = payload.get("timeframe") or "daily"

    if not symbol:
        raise ValueError("Symbol is required.")

    if provider == "csv":
        text = payload.get("csv") or ""
        if not text.strip():
            raise ValueError("Upload a CSV, or pick a live provider.")
        # load_csv works on paths; stage the upload so both share one parser.
        fd, path = tempfile.mkstemp(suffix=".csv")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
            return load_csv(path)
        finally:
            os.unlink(path)

    feed = feeds.build(provider, exchange=payload.get("exchange") or "MCX")
    return feeds.fetch_with_retry(feed, symbol, timeframe)


def run_analysis(payload: dict) -> dict:
    symbol = (payload.get("symbol") or "").strip().upper()
    timeframe = payload.get("timeframe") or "daily"
    series = _load_series(payload)

    capital = payload.get("capital")
    capital = float(capital) if capital else None
    risk_pct = float(payload.get("riskPct") or instruments.MAX_RISK_PCT)
    lot_size = payload.get("lotSize")
    lot_size = float(lot_size) if lot_size else None

    inst = instruments.resolve(symbol, lot_size)
    a = analyse(series, inst, timeframe, capital, risk_pct)
    return analysis_to_dict(a, chart.render_svg(series, a))


def run_scan(payload: dict) -> dict:
    symbols = [s.strip().upper() for s in (payload.get("symbols") or "").
               replace("\n", ",").split(",") if s.strip()]
    if not symbols:
        raise ValueError("Enter at least one symbol.")
    provider = (payload.get("provider") or "yahoo").lower()
    if provider == "csv":
        raise ValueError("Watchlist scanning needs a live provider, not a "
                         "single uploaded file.")

    timeframe = payload.get("timeframe") or "daily"
    capital = payload.get("capital")
    capital = float(capital) if capital else None

    feed = feeds.build(provider, exchange=payload.get("exchange") or "MCX")
    rows = scanner.scan_feed(feed, symbols, timeframe, capital)

    return {"rows": [
        {
            "symbol": r.symbol,
            "error": r.error,
            "decision": r.analysis.decision if r.analysis else None,
            "confidence": r.analysis.confidence if r.analysis else None,
            "bias": r.analysis.bias if r.analysis else None,
            "entry": r.analysis.entry if r.analysis else None,
            "stop": r.analysis.stop if r.analysis else None,
            "target1": r.analysis.target1 if r.analysis else None,
            "rr": r.analysis.rr if r.analysis else None,
        }
        for r in rows
    ]}


class Handler(BaseHTTPRequestHandler):
    server_version = "ChartAnalyzer"

    def log_message(self, fmt, *args):  # quieter console
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: dict) -> None:
        self._send(code, json.dumps(obj).encode("utf-8"), "application/json")

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._json(400, {"error": "Bad Content-Length"})
            return
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "Request body missing or too large."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._json(400, {"error": f"Invalid JSON: {exc}"})
            return

        handlers = {"/api/analyze": run_analysis, "/api/scan": run_scan}
        handler = handlers.get(self.path)
        if handler is None:
            self._json(404, {"error": "Not found"})
            return

        try:
            self._json(200, handler(payload))
        except (ValueError, feeds.FeedError) as exc:
            self._json(400, {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - surface, do not 500 silently
            self._json(500, {"error": f"{type(exc).__name__}: {exc}"})


PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chart Analyzer</title>
<style>
:root{
  --bg:#f7f8fa; --panel:#fff; --ink:#16181d; --muted:#63676e; --line:#e1e4e9;
  --accent:#2f6fd0; --buy:#12855c; --sell:#c5364c; --wait:#8a6d1f;
  --chart-grid:#e3e6ea; --chart-muted:#71767c; --chart-up:#1a9f6b;
  --chart-down:#d3455b; --chart-ma200:#8a63d2; --chart-ma50:#e08b2e;
  --chart-ma20:#3b82c4; --chart-entry:#2f7fd4;
}
@media (prefers-color-scheme:dark){
 :root{
  --bg:#101216; --panel:#171a1f; --ink:#e8eaed; --muted:#9aa0a8; --line:#272b32;
  --accent:#6fa8f5; --buy:#3ecf8e; --sell:#ff6b81; --wait:#e0b040;
  --chart-grid:#272b32; --chart-muted:#8b9098; --chart-up:#3ecf8e;
  --chart-down:#ff6b81; --chart-ma200:#a98bee; --chart-ma50:#f0a94e;
  --chart-ma20:#6fa8f5; --chart-entry:#6fa8f5;
 }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{margin:0;font-size:18px;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:13px;margin-top:3px}
main{max-width:1180px;margin:0 auto;padding:22px 24px 60px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;
 padding:18px;margin-bottom:18px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px;
 text-transform:uppercase;letter-spacing:.04em}
input,select,textarea,button{font:inherit;color:var(--ink);background:var(--bg);
 border:1px solid var(--line);border-radius:7px;padding:8px 10px;width:100%}
textarea{min-height:90px;font-family:ui-monospace,monospace;font-size:12px}
button{background:var(--accent);color:#fff;border:0;font-weight:600;cursor:pointer}
button:disabled{opacity:.55;cursor:progress}
button.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.row{display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap}
.tabs{display:flex;gap:6px;margin-bottom:16px}
.tab{padding:7px 14px;border-radius:7px;cursor:pointer;border:1px solid var(--line);
 background:var(--panel);font-size:14px;width:auto}
.tab[aria-selected=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
.banner{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;
 padding:14px 16px;border-radius:9px;margin-bottom:16px;border:1px solid var(--line)}
.decision{font-size:24px;font-weight:700;letter-spacing:-.02em}
.Buy .decision{color:var(--buy)} .Sell .decision{color:var(--sell)}
.WAIT .decision{color:var(--wait)}
.levels{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
.lv{border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.lv b{display:block;font-size:17px;margin-top:2px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.bull{color:var(--buy);font-weight:600}.bear{color:var(--sell);font-weight:600}
.neutral{color:var(--muted)}
.warn{border-left:3px solid var(--wait);padding:8px 12px;margin:8px 0;
 background:color-mix(in srgb,var(--wait) 8%,transparent);border-radius:0 6px 6px 0;
 font-size:13.5px}
.err{border-left:3px solid var(--sell);padding:10px 12px;border-radius:0 6px 6px 0;
 background:color-mix(in srgb,var(--sell) 10%,transparent)}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
 margin:22px 0 8px}
.hint{font-size:12.5px;color:var(--muted);margin-top:6px}
.chartwrap{overflow-x:auto}
.pill{font-size:11.5px;padding:2px 8px;border-radius:20px;border:1px solid var(--line);
 color:var(--muted)}
.hide{display:none}
footer{color:var(--muted);font-size:12.5px;border-top:1px solid var(--line);
 padding-top:14px;margin-top:26px}
</style>
</head>
<body>
<header>
  <h1>Chart Analyzer — commodities, MCX and stocks</h1>
  <div class="sub">Indicator confluence with ATR stops and risk-capped sizing.
   Returns WAIT when signals conflict.</div>
</header>
<main>
  <div class="tabs" role="tablist">
    <button class="tab" id="tab-single" role="tab" aria-selected="true">Single chart</button>
    <button class="tab" id="tab-scan" role="tab" aria-selected="false">Watchlist scan</button>
  </div>

  <section class="card" id="panel-single">
    <div class="grid">
      <div><label for="provider">Data source</label>
        <select id="provider">
          <option value="csv">CSV upload (offline)</option>
          <option value="yahoo">Yahoo — delayed, no MCX</option>
          <option value="angelone">Angel One — live NSE/MCX</option>
        </select></div>
      <div><label for="symbol">Symbol</label>
        <input id="symbol" value="GOLDM" placeholder="GOLDM, RELIANCE, CRUDEOIL"></div>
      <div><label for="timeframe">Timeframe</label>
        <select id="timeframe">
          <option>15m</option><option>1h</option><option>4h</option>
          <option selected>daily</option><option>weekly</option>
        </select></div>
      <div><label for="capital">Capital</label>
        <input id="capital" type="number" value="500000" min="0"></div>
      <div><label for="riskPct">Risk % (max 1)</label>
        <input id="riskPct" type="number" value="1" step="0.1" min="0.1" max="1"></div>
      <div><label for="lotSize">Lot size override</label>
        <input id="lotSize" type="number" placeholder="F&amp;O only" min="0"></div>
    </div>

    <div id="csvBlock" style="margin-top:14px">
      <label for="csvFile">Chart data (CSV export)</label>
      <input id="csvFile" type="file" accept=".csv,text/csv">
      <div class="hint">TradingView: scroll left to load 250+ bars, then
        camera icon &rarr; Export chart data. Broker terminals export too.</div>
      <textarea id="csvText" placeholder="…or paste CSV here"></textarea>
    </div>

    <div class="row">
      <button id="run" style="width:auto;padding:9px 20px">Analyze</button>
      <select id="refresh" style="width:auto">
        <option value="0">No auto-refresh</option>
        <option value="60">Refresh every 1 min</option>
        <option value="300">Refresh every 5 min</option>
        <option value="900">Refresh every 15 min</option>
      </select>
      <span class="pill" id="status">idle</span>
    </div>
    <div class="hint">Auto-refresh needs a live source. Indicators only change
      when a bar closes, so refreshing faster than your timeframe adds nothing.</div>
  </section>

  <section class="card hide" id="panel-scan">
    <div class="grid">
      <div><label for="scanProvider">Data source</label>
        <select id="scanProvider">
          <option value="yahoo">Yahoo — delayed, no MCX</option>
          <option value="angelone">Angel One — live NSE/MCX</option>
        </select></div>
      <div><label for="scanTimeframe">Timeframe</label>
        <select id="scanTimeframe">
          <option>15m</option><option>1h</option><option selected>daily</option>
        </select></div>
      <div><label for="scanCapital">Capital</label>
        <input id="scanCapital" type="number" value="500000" min="0"></div>
    </div>
    <div style="margin-top:14px">
      <label for="symbols">Watchlist</label>
      <textarea id="symbols">GOLDM, SILVERM, CRUDEOILM, COPPER, RELIANCE, TCS, INFY</textarea>
    </div>
    <div class="row">
      <button id="runScan" style="width:auto;padding:9px 20px">Scan watchlist</button>
      <span class="pill" id="scanStatus">idle</span>
    </div>
  </section>

  <div id="out"></div>
  <div id="scanOut"></div>

  <footer>Technical analysis of the supplied data, not financial advice.
   Indicator confluence expresses probability, not certainty.</footer>
</main>

<script>
const $ = id => document.getElementById(id);
let timer = null;

function fmt(v, dash="—"){
  return (v === null || v === undefined) ? dash
    : Number(v).toLocaleString(undefined,{minimumFractionDigits:2,
                                          maximumFractionDigits:2});
}
function esc(s){
  return String(s).replace(/[&<>"]/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function showTab(which){
  const single = which === 'single';
  $('tab-single').setAttribute('aria-selected', single);
  $('tab-scan').setAttribute('aria-selected', !single);
  $('panel-single').classList.toggle('hide', !single);
  $('panel-scan').classList.toggle('hide', single);
  $('out').classList.toggle('hide', !single);
  $('scanOut').classList.toggle('hide', single);
}
$('tab-single').onclick = () => showTab('single');
$('tab-scan').onclick = () => showTab('scan');

$('provider').onchange = () => {
  const isCsv = $('provider').value === 'csv';
  $('csvBlock').classList.toggle('hide', !isCsv);
  if (isCsv) { $('refresh').value = '0'; schedule(); }
};

$('csvFile').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('csvText').value = r.result; };
  r.readAsText(f);
};

function schedule(){
  if (timer) { clearInterval(timer); timer = null; }
  const secs = Number($('refresh').value);
  if (secs > 0 && $('provider').value !== 'csv') {
    timer = setInterval(analyze, secs * 1000);
  }
}
$('refresh').onchange = schedule;

async function analyze(){
  const btn = $('run');
  btn.disabled = true;
  $('status').textContent = 'fetching…';
  const body = {
    provider: $('provider').value,
    symbol: $('symbol').value,
    timeframe: $('timeframe').value,
    capital: $('capital').value,
    riskPct: $('riskPct').value,
    lotSize: $('lotSize').value,
    csv: $('csvText').value,
  };
  try {
    const res = await fetch('/api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    render(data);
    $('status').textContent = 'updated ' + new Date().toLocaleTimeString();
  } catch (err) {
    $('out').innerHTML = '<div class="card err">' + esc(err.message) + '</div>';
    $('status').textContent = 'error';
  } finally {
    btn.disabled = false;
  }
}
$('run').onclick = analyze;

function render(d){
  const zones = list => list.length
    ? list.map((z,i) => `<tr><td>${i+1}</td><td class="num">${fmt(z.low)}</td>
        <td class="num">${fmt(z.high)}</td><td class="num">${z.touches}</td></tr>`).join('')
    : '<tr><td colspan="4" class="neutral">none identified</td></tr>';

  const votes = d.votes.map(v => {
    const cls = v.direction > 0 ? 'bull' : (v.direction < 0 ? 'bear' : 'neutral');
    const word = v.direction > 0 ? 'bullish' : (v.direction < 0 ? 'bearish' : 'neutral');
    return `<tr><td>${esc(v.name)}</td><td class="${cls}">${word}</td>
            <td>${esc(v.detail)}</td></tr>`;
  }).join('');

  $('out').innerHTML = `
  <div class="card">
    <div class="banner ${d.decision}">
      <span class="decision">${d.decision}</span>
      <span>${esc(d.symbol)} · ${esc(d.timeframe)} · ${fmt(d.price)}</span>
      <span class="pill">${d.bias} · ${d.trendStrength}</span>
      <span class="pill">confidence ${d.confidence}</span>
      <span class="pill">ATR ${fmt(d.atr)}</span>
    </div>

    <div class="levels">
      <div class="lv">Entry<b>${fmt(d.entry)}</b></div>
      <div class="lv">Stop-loss<b>${fmt(d.stop)}</b></div>
      <div class="lv">Target 1<b>${fmt(d.target1)}</b></div>
      <div class="lv">Target 2<b>${fmt(d.target2)}</b></div>
      <div class="lv">R:R<b>${d.rr ? d.rr.toFixed(2)+' : 1' : '—'}</b></div>
      <div class="lv">Invalidation<b>${fmt(d.invalidation)}</b></div>
    </div>

    ${d.sizing ? `<div class="warn" style="border-left-color:var(--accent)">
      <b>Position sizing.</b> ${esc(d.sizing.message)}</div>` : ''}

    <h2>Structure</h2>
    <div>${esc(d.marketStructure)} — ${esc(d.condition)}</div>

    <div class="chartwrap"><h2>Chart</h2>${d.svg}</div>

    <h2>Support zones</h2>
    <table><thead><tr><th>#</th><th class="num">Low</th><th class="num">High</th>
      <th class="num">Touches</th></tr></thead><tbody>${zones(d.supports)}</tbody></table>

    <h2>Resistance zones</h2>
    <table><thead><tr><th>#</th><th class="num">Low</th><th class="num">High</th>
      <th class="num">Touches</th></tr></thead><tbody>${zones(d.resistances)}</tbody></table>

    <h2>Indicator confirmation</h2>
    <table><thead><tr><th>Check</th><th>Reading</th><th>Detail</th></tr></thead>
      <tbody>${votes}
      <tr><td>Volume</td><td class="neutral">—</td><td>${esc(d.volumeNote)}</td></tr>
      <tr><td>Divergence</td><td class="neutral">—</td>
          <td>${esc(d.divergence || 'none detected on recent swings')}</td></tr>
      </tbody></table>

    ${d.warnings.length ? '<h2>Warnings</h2>' +
      d.warnings.map(w => `<div class="warn">${esc(w)}</div>`).join('') : ''}

    <h2>Event risk to verify</h2>
    <div class="hint">${d.events.map(esc).join(' · ')}</div>
  </div>`;
}

async function runScan(){
  const btn = $('runScan');
  btn.disabled = true;
  $('scanStatus').textContent = 'scanning…';
  try {
    const res = await fetch('/api/scan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        provider: $('scanProvider').value,
        timeframe: $('scanTimeframe').value,
        capital: $('scanCapital').value,
        symbols: $('symbols').value,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');

    const rows = data.rows.map(r => r.error
      ? `<tr><td>${esc(r.symbol)}</td><td class="bear">ERROR</td>
         <td colspan="5">${esc(r.error)}</td></tr>`
      : `<tr><td>${esc(r.symbol)}</td>
         <td class="${r.decision==='Buy'?'bull':(r.decision==='Sell'?'bear':'neutral')}">
           ${r.decision}</td>
         <td>${r.confidence}</td><td>${r.bias}</td>
         <td class="num">${fmt(r.entry)}</td><td class="num">${fmt(r.stop)}</td>
         <td class="num">${fmt(r.target1)}</td>
         <td class="num">${r.rr ? r.rr.toFixed(2) : '—'}</td></tr>`).join('');

    $('scanOut').innerHTML = `<div class="card"><h2>Scan results</h2>
      <table><thead><tr><th>Symbol</th><th>Decision</th><th>Conf</th><th>Bias</th>
      <th class="num">Entry</th><th class="num">Stop</th><th class="num">Target 1</th>
      <th class="num">R:R</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="hint">Ranked: actionable first, then confidence, then R:R.</div>
      </div>`;
    $('scanStatus').textContent = 'done ' + new Date().toLocaleTimeString();
  } catch (err) {
    $('scanOut').innerHTML = '<div class="card err">' + esc(err.message) + '</div>';
    $('scanStatus').textContent = 'error';
  } finally {
    btn.disabled = false;
  }
}
$('runScan').onclick = runScan;
showTab('single');
</script>
</body>
</html>"""


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Chart analyzer web interface.")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--host", default="127.0.0.1",
                   help="Default localhost. Binding wider exposes broker "
                        "credentials entered in the form.")
    p.add_argument("--open", action="store_true", help="Open a browser")
    args = p.parse_args(argv)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}"
    print(f"Chart Analyzer running at {url}")
    print("Ctrl-C to stop.")
    if args.open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
