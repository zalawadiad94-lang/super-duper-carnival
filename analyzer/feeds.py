"""Live and historical data providers.

Every provider returns the same `Series`, so the engine is unaware of where
bars came from. Providers are pluggable because market data access differs
sharply by venue:

- Global commodities and most equities are available from free delayed feeds.
- Indian exchange data (NSE, MCX) is a licensed entitlement. Real-time access
  requires a broker API with your own credentials. There is no free public
  endpoint for live MCX prices, and anything claiming otherwise is either
  delayed, scraped, or redistributing without a licence.

Credentials are read from the environment and never written to disk by this
module.

NOTE: the sandbox this was written in blocks outbound network access, so the
network providers below are implemented against published API contracts but
were not executed end to end. The CSV provider is fully exercised by tests.
Verify a live provider with `--check-feed` before relying on it.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from .data import Series, load_csv

USER_AGENT = "Mozilla/5.0 (compatible; chart-analyzer/1.0)"
TIMEOUT = 20


class FeedError(RuntimeError):
    """Raised when a provider cannot return usable bars."""


def _get_json(url: str, headers: dict[str, str] | None = None,
              data: bytes | None = None) -> dict:
    req = urllib.request.Request(url, data=data)
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise FeedError(f"{url} returned HTTP {exc.code}: "
                        f"{exc.read()[:200].decode('utf-8', 'replace')}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise FeedError(
            f"Could not reach {urllib.parse.urlparse(url).netloc}: {exc}. "
            f"Check network access and any proxy settings."
        ) from exc
    except json.JSONDecodeError as exc:
        raise FeedError(f"{url} did not return JSON: {exc}") from exc


# --------------------------------------------------------------------------
# CSV
# --------------------------------------------------------------------------

class CsvFeed:
    """Offline bars from an exported file. Always available."""

    name = "csv"
    realtime = False

    def __init__(self, path: str):
        self.path = path

    def fetch(self, symbol: str, timeframe: str, bars: int = 400) -> Series:
        return load_csv(self.path)


# --------------------------------------------------------------------------
# Yahoo Finance — free, delayed, no MCX
# --------------------------------------------------------------------------

_YAHOO_INTERVAL = {
    "1m": ("1m", "7d"), "5m": ("5m", "60d"), "15m": ("15m", "60d"),
    "30m": ("30m", "60d"), "1h": ("60m", "730d"), "4h": ("60m", "730d"),
    "daily": ("1d", "5y"), "weekly": ("1wk", "10y"), "monthly": ("1mo", "20y"),
}

# Convenience aliases. NSE equities take a .NS suffix on Yahoo.
YAHOO_ALIASES = {
    "XAUUSD": "GC=F", "GC": "GC=F", "XAGUSD": "SI=F", "SI": "SI=F",
    "CL": "CL=F", "CRUDEOIL": "CL=F", "NATURALGAS": "NG=F",
    "COPPER": "HG=F", "NIFTY": "^NSEI", "BANKNIFTY": "^NSEBANK",
}


class YahooFeed:
    """Free delayed bars. Good for global commodities, indices, and equities.

    Does not carry MCX contracts. Quotes are delayed roughly 15 minutes, so
    this is suitable for swing analysis, not for intraday execution.
    """

    name = "yahoo"
    realtime = False

    def _map(self, symbol: str) -> str:
        s = symbol.upper().strip()
        if s in YAHOO_ALIASES:
            return YAHOO_ALIASES[s]
        # Bare Indian tickers need an exchange suffix.
        if s.isalpha() and "." not in s and "=" not in s and not s.startswith("^"):
            return f"{s}.NS"
        return s

    def fetch(self, symbol: str, timeframe: str, bars: int = 400) -> Series:
        if timeframe not in _YAHOO_INTERVAL:
            raise FeedError(f"Yahoo does not support timeframe {timeframe!r}.")
        interval, rng = _YAHOO_INTERVAL[timeframe]
        ticker = self._map(symbol)
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
               f"{urllib.parse.quote(ticker)}"
               f"?range={rng}&interval={interval}&includePrePost=false")

        payload = _get_json(url)
        chart = payload.get("chart") or {}
        if chart.get("error"):
            raise FeedError(f"Yahoo error for {ticker}: {chart['error']}")
        results = chart.get("result") or []
        if not results:
            raise FeedError(f"Yahoo returned no data for {ticker!r}.")

        result = results[0]
        stamps = result.get("timestamp") or []
        quote = (result.get("indicators", {}).get("quote") or [{}])[0]
        if not stamps:
            raise FeedError(f"Yahoo returned no bars for {ticker!r}.")

        series = _from_columns(
            stamps, quote.get("open"), quote.get("high"), quote.get("low"),
            quote.get("close"), quote.get("volume"),
        )
        if timeframe == "4h":
            series = resample(series, 4)
        return _tail(series, bars)


# --------------------------------------------------------------------------
# Angel One SmartAPI — free tier, covers NSE and MCX real-time
# --------------------------------------------------------------------------

_ANGEL_INTERVAL = {
    "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE", "1h": "ONE_HOUR", "daily": "ONE_DAY",
}

SCRIP_MASTER = ("https://margincalculator.angelbroking.com/OpenAPI_File/files/"
                "OpenAPIScripMaster.json")


class AngelOneFeed:
    """Angel One SmartAPI — real-time NSE and MCX bars on a free API tier.

    Requires your own credentials in the environment:

        ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP

    ANGEL_TOTP is the 6-digit code from your authenticator app, which rotates
    every 30 seconds. For unattended use, store the TOTP *secret* instead and
    generate codes with pyotp — that is deliberately left to you rather than
    baked in, since it is the key to your trading account.
    """

    name = "angelone"
    realtime = True

    LOGIN = ("https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/"
             "v1/loginByPassword")
    CANDLES = ("https://apiconnect.angelbroking.com/rest/secure/angelbroking/"
               "historical/v1/getCandleData")

    def __init__(self, exchange: str = "MCX"):
        self.exchange = exchange.upper()
        self._token: str | None = None
        self._scrip_cache: list[dict] | None = None

    # -- auth ------------------------------------------------------------
    def _credentials(self) -> tuple[str, str, str, str]:
        missing = [k for k in ("ANGEL_API_KEY", "ANGEL_CLIENT_CODE",
                               "ANGEL_PIN", "ANGEL_TOTP") if not os.environ.get(k)]
        if missing:
            raise FeedError(
                f"Missing environment variable(s): {', '.join(missing)}. "
                f"Create a free SmartAPI app at smartapi.angelbroking.com and "
                f"export the credentials before using this feed."
            )
        return (os.environ["ANGEL_API_KEY"], os.environ["ANGEL_CLIENT_CODE"],
                os.environ["ANGEL_PIN"], os.environ["ANGEL_TOTP"])

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "127.0.0.1",
            "X-ClientPublicIP": "127.0.0.1",
            "X-MACAddress": "00:00:00:00:00:00",
            "X-PrivateKey": api_key,
        }

    def _login(self) -> str:
        if self._token:
            return self._token
        api_key, client, pin, totp = self._credentials()
        body = json.dumps({"clientcode": client, "password": pin,
                           "totp": totp}).encode()
        payload = _get_json(self.LOGIN, self._headers(api_key), body)
        if not payload.get("status"):
            raise FeedError(
                f"Angel One login failed: {payload.get('message', payload)}. "
                f"A stale TOTP is the usual cause — codes expire in 30s."
            )
        self._token = payload["data"]["jwtToken"]
        return self._token

    # -- symbol lookup ---------------------------------------------------
    def _resolve_token(self, symbol: str) -> str:
        """Find the instrument token for a symbol in the scrip master.

        The master is a large public JSON file listing every tradable
        instrument. For futures it holds dated contracts, so the nearest
        expiry is chosen — which is normally the active contract.
        """
        if self._scrip_cache is None:
            self._scrip_cache = _get_json_list(SCRIP_MASTER)

        want = symbol.upper().strip()
        matches = [
            row for row in self._scrip_cache
            if row.get("exch_seg") == self.exchange
            and row.get("name", "").upper() == want
        ]
        if not matches:
            matches = [
                row for row in self._scrip_cache
                if row.get("exch_seg") == self.exchange
                and row.get("symbol", "").upper().startswith(want)
            ]
        if not matches:
            raise FeedError(
                f"{want!r} not found on {self.exchange} in the Angel One "
                f"scrip master. Check the symbol, or the exchange segment."
            )

        def expiry_key(row: dict):
            raw = row.get("expiry") or ""
            for fmt in ("%d%b%Y", "%Y-%m-%d"):
                try:
                    return datetime.strptime(raw, fmt)
                except ValueError:
                    continue
            return datetime.max

        matches.sort(key=expiry_key)
        return matches[0]["token"]

    # -- bars ------------------------------------------------------------
    def fetch(self, symbol: str, timeframe: str, bars: int = 400) -> Series:
        if timeframe not in _ANGEL_INTERVAL:
            raise FeedError(
                f"Angel One does not serve {timeframe!r}. Supported: "
                f"{', '.join(_ANGEL_INTERVAL)}."
            )
        token = self._login()
        instrument_token = self._resolve_token(symbol)

        span_days = 120 if timeframe in ("1m", "5m", "15m", "30m") else 2000
        now = datetime.now()
        start = now.timestamp() - span_days * 86400
        body = json.dumps({
            "exchange": self.exchange,
            "symboltoken": instrument_token,
            "interval": _ANGEL_INTERVAL[timeframe],
            "fromdate": datetime.fromtimestamp(start).strftime("%Y-%m-%d %H:%M"),
            "todate": now.strftime("%Y-%m-%d %H:%M"),
        }).encode()

        headers = self._headers(os.environ["ANGEL_API_KEY"])
        headers["Authorization"] = f"Bearer {token}"
        payload = _get_json(self.CANDLES, headers, body)

        rows = (payload.get("data") or [])
        if not rows:
            raise FeedError(
                f"Angel One returned no candles for {symbol}: "
                f"{payload.get('message', 'empty response')}"
            )

        times, opens, highs, lows, closes, volumes = [], [], [], [], [], []
        for row in rows:
            # [timestamp, open, high, low, close, volume]
            try:
                times.append(datetime.fromisoformat(row[0]).replace(tzinfo=None))
            except (ValueError, TypeError):
                times.append(None)
            opens.append(float(row[1]))
            highs.append(float(row[2]))
            lows.append(float(row[3]))
            closes.append(float(row[4]))
            volumes.append(float(row[5]))

        series = Series(times, opens, highs, lows, closes, volumes,
                        any(v > 0 for v in volumes))
        return _tail(series, bars)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _get_json_list(url: str) -> list[dict]:
    req = urllib.request.Request(url)
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - surfaced as FeedError
        raise FeedError(f"Could not load scrip master: {exc}") from exc


def _from_columns(stamps, o, h, l, c, v) -> Series:
    """Build a Series from column arrays, dropping bars with any gap."""
    times, opens, highs, lows, closes, volumes = [], [], [], [], [], []
    for i, ts in enumerate(stamps):
        vals = (o[i] if o else None, h[i] if h else None,
                l[i] if l else None, c[i] if c else None)
        if any(x is None for x in vals):
            continue
        times.append(datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None))
        opens.append(float(vals[0]))
        highs.append(float(vals[1]))
        lows.append(float(vals[2]))
        closes.append(float(vals[3]))
        vol = v[i] if v and i < len(v) and v[i] is not None else 0.0
        volumes.append(float(vol))

    if not closes:
        raise FeedError("Provider returned bars but all were incomplete.")
    return Series(times, opens, highs, lows, closes, volumes,
                  any(x > 0 for x in volumes))


def resample(series: Series, factor: int) -> Series:
    """Aggregate consecutive bars, for timeframes a provider does not serve."""
    if factor <= 1:
        return series
    times, opens, highs, lows, closes, volumes = [], [], [], [], [], []
    for i in range(0, len(series) - factor + 1, factor):
        chunk = slice(i, i + factor)
        times.append(series.times[i])
        opens.append(series.opens[i])
        highs.append(max(series.highs[chunk]))
        lows.append(min(series.lows[chunk]))
        closes.append(series.closes[i + factor - 1])
        volumes.append(sum(series.volumes[chunk]))
    return Series(times, opens, highs, lows, closes, volumes,
                  any(v > 0 for v in volumes))


def _tail(series: Series, bars: int) -> Series:
    if bars <= 0 or len(series) <= bars:
        return series
    s = slice(-bars, None)
    return Series(series.times[s], series.opens[s], series.highs[s],
                  series.lows[s], series.closes[s], series.volumes[s],
                  series.has_volume)


PROVIDERS = {"csv": CsvFeed, "yahoo": YahooFeed, "angelone": AngelOneFeed}


def build(provider: str, csv_path: str | None = None, exchange: str = "MCX"):
    """Instantiate a provider by name."""
    key = provider.lower().strip()
    if key == "csv":
        if not csv_path:
            raise FeedError("The csv provider needs --csv <path>.")
        return CsvFeed(csv_path)
    if key == "yahoo":
        return YahooFeed()
    if key == "angelone":
        return AngelOneFeed(exchange)
    raise FeedError(f"Unknown provider {provider!r}. "
                    f"Choose from: {', '.join(PROVIDERS)}.")


def fetch_with_retry(feed, symbol: str, timeframe: str, bars: int = 400,
                     attempts: int = 3) -> Series:
    """Retry transient network failures with exponential backoff."""
    delay = 2.0
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return feed.fetch(symbol, timeframe, bars)
        except FeedError as exc:
            last = exc
            # Credential and symbol errors will not fix themselves.
            text = str(exc).lower()
            if any(w in text for w in ("missing environment", "not found",
                                       "login failed", "does not support")):
                raise
            if attempt < attempts - 1:
                time.sleep(delay)
                delay *= 2
    raise last if last else FeedError("Fetch failed for an unknown reason.")
