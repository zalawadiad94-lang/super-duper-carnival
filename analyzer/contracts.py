"""Contract specifications and risk-first position sizing.

`multiplier` converts a one-unit move in the quoted price into currency P&L
for one lot. MCX gold is quoted per 10g while lots are defined in grams, so
the multiplier is lot_size / quote_unit.

Exchanges revise these. Verify against your broker's contract note before
sizing real positions.
"""

from __future__ import annotations

from dataclasses import dataclass

# The hard ceiling from the analysis brief. Sizing never exceeds this.
MAX_RISK_PCT = 1.0


@dataclass(frozen=True)
class Contract:
    symbol: str
    name: str
    currency: str
    quote_unit: str
    multiplier: float
    note: str = ""


CONTRACTS: dict[str, Contract] = {
    # --- MCX gold: quoted in INR per 10g (petal per 1g) ---
    "GOLD": Contract("GOLD", "MCX Gold", "INR", "per 10g", 100.0, "1 kg lot"),
    "GOLDM": Contract("GOLDM", "MCX Gold Mini", "INR", "per 10g", 10.0, "100 g lot"),
    "GOLDGUINEA": Contract(
        "GOLDGUINEA", "MCX Gold Guinea", "INR", "per 8g", 1.0, "8 g lot"
    ),
    "GOLDPETAL": Contract(
        "GOLDPETAL", "MCX Gold Petal", "INR", "per 1g", 1.0, "1 g lot"
    ),
    # --- MCX silver: quoted in INR per kg ---
    "SILVER": Contract("SILVER", "MCX Silver", "INR", "per kg", 30.0, "30 kg lot"),
    "SILVERM": Contract("SILVERM", "MCX Silver Mini", "INR", "per kg", 5.0, "5 kg lot"),
    "SILVERMIC": Contract(
        "SILVERMIC", "MCX Silver Micro", "INR", "per kg", 1.0, "1 kg lot"
    ),
    # --- International ---
    "XAUUSD": Contract(
        "XAUUSD", "Spot Gold", "USD", "per oz", 100.0, "100 oz standard lot"
    ),
    "XAGUSD": Contract(
        "XAGUSD", "Spot Silver", "USD", "per oz", 5000.0, "5000 oz standard lot"
    ),
    "GC": Contract("GC", "COMEX Gold Futures", "USD", "per oz", 100.0, "100 oz"),
    "SI": Contract("SI", "COMEX Silver Futures", "USD", "per oz", 5000.0, "5000 oz"),
}

# Instruments where reported volume is genuine exchange volume. Spot/CFD feeds
# report tick counts from a single broker, which cannot confirm a breakout.
REAL_VOLUME = {"GOLD", "GOLDM", "GOLDGUINEA", "GOLDPETAL",
               "SILVER", "SILVERM", "SILVERMIC", "GC", "SI"}


def resolve(symbol: str) -> Contract | None:
    return CONTRACTS.get(symbol.upper().strip())


def has_real_volume(symbol: str) -> bool:
    return symbol.upper().strip() in REAL_VOLUME


@dataclass
class Sizing:
    lots: float
    risk_amount: float
    risk_per_lot: float
    capital: float
    risk_pct: float
    affordable: bool
    message: str


def size_position(
    capital: float,
    entry: float,
    stop: float,
    contract: Contract,
    risk_pct: float = MAX_RISK_PCT,
) -> Sizing:
    """Derive lot count from stop distance — never the other way round.

    If one lot risks more than the budget, that is reported as unaffordable
    rather than solved by tightening the stop. Shrinking a stop to fit a lot
    is how accounts die; the correct fix is a smaller contract.
    """
    risk_pct = min(risk_pct, MAX_RISK_PCT)
    risk_amount = capital * (risk_pct / 100.0)
    stop_distance = abs(entry - stop)

    if stop_distance <= 0:
        return Sizing(0, risk_amount, 0, capital, risk_pct, False,
                      "Stop distance is zero — cannot size.")

    risk_per_lot = stop_distance * contract.multiplier
    lots = risk_amount / risk_per_lot

    if lots < 1:
        smaller = _smaller_alternatives(contract)
        hint = f" Consider {', '.join(smaller)}." if smaller else ""
        return Sizing(
            lots, risk_amount, risk_per_lot, capital, risk_pct, False,
            f"One lot of {contract.name} risks "
            f"{contract.currency} {risk_per_lot:,.0f}, above the "
            f"{contract.currency} {risk_amount:,.0f} budget "
            f"({risk_pct:.2f}% of capital).{hint} "
            f"Do not tighten the stop to make it fit.",
        )

    return Sizing(
        lots, risk_amount, risk_per_lot, capital, risk_pct, True,
        f"{int(lots)} lot(s) — risking {contract.currency} "
        f"{int(lots) * risk_per_lot:,.0f} ({risk_pct:.2f}% of capital).",
    )


def _smaller_alternatives(contract: Contract) -> list[str]:
    """Same metal and currency, strictly smaller multiplier."""
    return [
        c.name
        for c in CONTRACTS.values()
        if c.currency == contract.currency
        and c.multiplier < contract.multiplier
        and _metal(c.symbol) == _metal(contract.symbol)
    ]


def _metal(symbol: str) -> str:
    s = symbol.upper()
    if s.startswith("GOLD") or s in {"XAUUSD", "GC"}:
        return "gold"
    if s.startswith("SILVER") or s in {"XAGUSD", "SI"}:
        return "silver"
    return "other"
