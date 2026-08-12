"""OHLC loading.

Accepts the CSV shape TradingView's "Export chart data" produces, and the
common variants from broker terminals. Column names are matched case- and
separator-insensitively so `Date`, `time`, `Open Time` all resolve.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, date

INTRADAY = {"1m", "5m", "15m", "30m", "1h", "2h", "4h"}

_ALIASES = {
    "time": {"time", "date", "datetime", "timestamp", "opentime", "date_time"},
    "open": {"open", "o"},
    "high": {"high", "h"},
    "low": {"low", "l"},
    "close": {"close", "c", "price", "last", "adjclose"},
    "volume": {"volume", "vol", "v", "tickvolume", "realvolume"},
}

_TIME_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    "%d-%m-%Y %H:%M",
    "%d-%m-%Y",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%m/%d/%Y",
)


@dataclass
class Series:
    times: list[datetime | None]
    opens: list[float]
    highs: list[float]
    lows: list[float]
    closes: list[float]
    volumes: list[float]
    has_volume: bool

    def __len__(self) -> int:
        return len(self.closes)

    def session_starts(self) -> list[bool]:
        """True on the first bar of each calendar day, for VWAP resets."""
        flags: list[bool] = []
        prev: date | None = None
        for t in self.times:
            if t is None:
                flags.append(False)
                continue
            day = t.date()
            flags.append(prev is None or day != prev)
            prev = day
        return flags


def _normalize(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _map_columns(header: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, raw in enumerate(header):
        norm = _normalize(raw)
        for canonical, variants in _ALIASES.items():
            if canonical in mapping:
                continue
            if norm in variants:
                mapping[canonical] = idx
    return mapping


def _parse_time(raw: str) -> datetime | None:
    raw = raw.strip()
    if not raw:
        return None
    # Unix epoch, seconds or milliseconds.
    if raw.isdigit():
        value = int(raw)
        if value > 10_000_000_000:
            value //= 1000
        try:
            return datetime.utcfromtimestamp(value)
        except (OverflowError, OSError, ValueError):
            return None
    cleaned = raw.replace("Z", "").split("+")[0].strip()
    for fmt in _TIME_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def _parse_number(raw: str) -> float | None:
    """Tolerate thousands separators and currency symbols."""
    cleaned = raw.strip().replace(",", "").replace("₹", "").replace("$", "")
    if not cleaned or cleaned in {"-", "n/a", "N/A", "null"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def load_csv(path: str) -> Series:
    """Read an OHLC CSV into a Series, oldest bar first."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))

    if not rows:
        raise ValueError("CSV is empty.")

    mapping = _map_columns(rows[0])
    missing = [c for c in ("open", "high", "low", "close") if c not in mapping]
    if missing:
        raise ValueError(
            f"CSV is missing required column(s): {', '.join(missing)}. "
            f"Found header: {rows[0]}"
        )

    times: list[datetime | None] = []
    opens: list[float] = []
    highs: list[float] = []
    lows: list[float] = []
    closes: list[float] = []
    volumes: list[float] = []

    for row in rows[1:]:
        if not row or len(row) <= max(mapping.values()):
            continue
        o = _parse_number(row[mapping["open"]])
        h = _parse_number(row[mapping["high"]])
        l = _parse_number(row[mapping["low"]])
        c = _parse_number(row[mapping["close"]])
        if None in (o, h, l, c):
            continue
        times.append(_parse_time(row[mapping["time"]]) if "time" in mapping else None)
        opens.append(o)
        highs.append(h)
        lows.append(l)
        closes.append(c)
        v = _parse_number(row[mapping["volume"]]) if "volume" in mapping else None
        volumes.append(v if v is not None else 0.0)

    if not closes:
        raise ValueError("No usable data rows found in CSV.")

    # Charting exports are sometimes newest-first; normalise to chronological.
    known = [t for t in times if t is not None]
    if len(known) >= 2 and known[0] > known[-1]:
        times.reverse()
        opens.reverse()
        highs.reverse()
        lows.reverse()
        closes.reverse()
        volumes.reverse()

    return Series(
        times=times,
        opens=opens,
        highs=highs,
        lows=lows,
        closes=closes,
        volumes=volumes,
        has_volume=any(v > 0 for v in volumes),
    )
