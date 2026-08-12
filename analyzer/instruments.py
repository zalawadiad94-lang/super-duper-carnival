"""Instrument specifications and risk-first position sizing.

`multiplier` converts a one-unit move in the quoted price into currency P&L
for one lot or share. MCX gold is quoted per 10g while its lot is defined in
grams, so the multiplier is lot_size / quote_unit. Equities are quoted per
share and sized in shares, so the multiplier is 1.

Exchanges revise lot sizes, and index F&O lots change often. Verify against
your broker's contract note before sizing real positions; the CLI and UI both
accept an override.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

# The hard ceiling on risk per trade. Sizing never exceeds this.
MAX_RISK_PCT = 1.0

EQUITY = "equity"
COMMODITY = "commodity"
SPOT = "spot"
INDEX = "index"


@dataclass(frozen=True)
class Instrument:
    symbol: str
    name: str
    currency: str
    quote_unit: str
    multiplier: float
    asset_class: str
    # True only where reported volume is genuine exchange volume. Spot and CFD
    # feeds report one broker's tick count, which cannot confirm a breakout.
    real_volume: bool = True
    note: str = ""
    verify_lot: bool = False


def _mcx(symbol, name, multiplier, quote_unit, note="", verify=False):
    return Instrument(symbol, name, "INR", quote_unit, multiplier,
                      COMMODITY, True, note, verify)


INSTRUMENTS: dict[str, Instrument] = {
    # --- MCX bullion ---
    "GOLD": _mcx("GOLD", "MCX Gold", 100.0, "per 10g", "1 kg lot"),
    "GOLDM": _mcx("GOLDM", "MCX Gold Mini", 10.0, "per 10g", "100 g lot"),
    "GOLDGUINEA": _mcx("GOLDGUINEA", "MCX Gold Guinea", 1.0, "per 8g", "8 g lot"),
    "GOLDPETAL": _mcx("GOLDPETAL", "MCX Gold Petal", 1.0, "per 1g", "1 g lot"),
    "SILVER": _mcx("SILVER", "MCX Silver", 30.0, "per kg", "30 kg lot"),
    "SILVERM": _mcx("SILVERM", "MCX Silver Mini", 5.0, "per kg", "5 kg lot"),
    "SILVERMIC": _mcx("SILVERMIC", "MCX Silver Micro", 1.0, "per kg", "1 kg lot"),

    # --- MCX energy ---
    "CRUDEOIL": _mcx("CRUDEOIL", "MCX Crude Oil", 100.0, "per barrel",
                     "100 barrels"),
    "CRUDEOILM": _mcx("CRUDEOILM", "MCX Crude Oil Mini", 10.0, "per barrel",
                      "10 barrels"),
    "NATURALGAS": _mcx("NATURALGAS", "MCX Natural Gas", 1250.0, "per mmBtu",
                       "1250 mmBtu"),
    "NATGASMINI": _mcx("NATGASMINI", "MCX Natural Gas Mini", 250.0, "per mmBtu",
                       "250 mmBtu"),

    # --- MCX base metals ---
    "COPPER": _mcx("COPPER", "MCX Copper", 2500.0, "per kg", "2.5 MT"),
    "ZINC": _mcx("ZINC", "MCX Zinc", 5000.0, "per kg", "5 MT"),
    "ZINCMINI": _mcx("ZINCMINI", "MCX Zinc Mini", 1000.0, "per kg", "1 MT"),
    "LEAD": _mcx("LEAD", "MCX Lead", 5000.0, "per kg", "5 MT"),
    "LEADMINI": _mcx("LEADMINI", "MCX Lead Mini", 1000.0, "per kg", "1 MT"),
    "ALUMINIUM": _mcx("ALUMINIUM", "MCX Aluminium", 5000.0, "per kg", "5 MT"),
    "ALUMINIMINI": _mcx("ALUMINIMINI", "MCX Aluminium Mini", 1000.0, "per kg",
                        "1 MT"),
    "NICKEL": _mcx("NICKEL", "MCX Nickel", 1500.0, "per kg", "1.5 MT"),
    "MENTHAOIL": _mcx("MENTHAOIL", "MCX Mentha Oil", 360.0, "per kg", "360 kg"),

    # --- International ---
    "XAUUSD": Instrument("XAUUSD", "Spot Gold", "USD", "per oz", 100.0, SPOT,
                         False, "100 oz standard lot"),
    "XAGUSD": Instrument("XAGUSD", "Spot Silver", "USD", "per oz", 5000.0, SPOT,
                         False, "5000 oz standard lot"),
    "GC": Instrument("GC", "COMEX Gold Futures", "USD", "per oz", 100.0,
                     COMMODITY, True, "100 oz"),
    "SI": Instrument("SI", "COMEX Silver Futures", "USD", "per oz", 5000.0,
                     COMMODITY, True, "5000 oz"),
    "CL": Instrument("CL", "NYMEX Crude Futures", "USD", "per barrel", 1000.0,
                     COMMODITY, True, "1000 barrels"),

    # --- Indices. Lot sizes change frequently; always override. ---
    "NIFTY": Instrument("NIFTY", "Nifty 50", "INR", "per index point", 1.0,
                        INDEX, True,
                        "Pass the current F&O lot size via --lot-size", True),
    "BANKNIFTY": Instrument("BANKNIFTY", "Bank Nifty", "INR", "per index point",
                            1.0, INDEX, True,
                            "Pass the current F&O lot size via --lot-size", True),
}


def generic_equity(symbol: str, currency: str = "INR") -> Instrument:
    """Any listed share, sized in shares.

    Equities are open-ended — hardcoding a table would silently reject most
    tickers. Unknown symbols resolve here so any stock export works, with
    --lot-size supplied when trading the F&O contract instead of delivery.
    """
    return Instrument(
        symbol.upper(), symbol.upper(), currency, "per share", 1.0,
        EQUITY, True, "Sized in shares; pass --lot-size for the F&O contract",
    )


def resolve(symbol: str, lot_size: float | None = None) -> Instrument:
    """Look up a symbol, falling back to a generic equity.

    A `lot_size` override replaces the multiplier — required for index F&O and
    stock futures, where exchange lot sizes are revised regularly.
    """
    key = symbol.upper().strip()
    inst = INSTRUMENTS.get(key) or generic_equity(key)
    if lot_size is not None and lot_size > 0:
        inst = replace(inst, multiplier=float(lot_size), verify_lot=False,
                       note=f"{inst.note} (lot size overridden to {lot_size:g})".strip())
    return inst


def is_known(symbol: str) -> bool:
    return symbol.upper().strip() in INSTRUMENTS


@dataclass
class Sizing:
    quantity: float
    risk_amount: float
    risk_per_unit: float
    capital: float
    risk_pct: float
    affordable: bool
    message: str
    unit: str = "lot"


def size_position(
    capital: float,
    entry: float,
    stop: float,
    instrument: Instrument,
    risk_pct: float = MAX_RISK_PCT,
) -> Sizing:
    """Derive quantity from stop distance — never the other way round.

    If one unit risks more than the budget, that is reported as unaffordable
    rather than solved by tightening the stop. Shrinking a stop to fit a lot
    is how accounts die; the correct fix is a smaller contract or fewer shares.
    """
    risk_pct = min(risk_pct, MAX_RISK_PCT)
    risk_amount = capital * (risk_pct / 100.0)
    stop_distance = abs(entry - stop)
    unit = "share" if instrument.asset_class == EQUITY else "lot"

    if stop_distance <= 0:
        return Sizing(0, risk_amount, 0, capital, risk_pct, False,
                      "Stop distance is zero — cannot size.", unit)

    risk_per_unit = stop_distance * instrument.multiplier
    quantity = risk_amount / risk_per_unit

    if quantity < 1:
        hint = ""
        if instrument.asset_class == EQUITY:
            hint = (" Even one share exceeds the budget — this stock is too "
                    "expensive for this account at this stop distance.")
        else:
            smaller = _smaller_alternatives(instrument)
            if smaller:
                hint = f" Consider {', '.join(smaller)}."
        return Sizing(
            quantity, risk_amount, risk_per_unit, capital, risk_pct, False,
            f"One {unit} of {instrument.name} risks {instrument.currency} "
            f"{risk_per_unit:,.0f}, above the {instrument.currency} "
            f"{risk_amount:,.0f} budget ({risk_pct:.2f}% of capital).{hint} "
            f"Do not tighten the stop to make it fit.", unit,
        )

    whole = int(quantity)
    return Sizing(
        quantity, risk_amount, risk_per_unit, capital, risk_pct, True,
        f"{whole} {unit}{'s' if whole != 1 else ''} — risking "
        f"{instrument.currency} {whole * risk_per_unit:,.0f} "
        f"({risk_pct:.2f}% of capital).", unit,
    )


def _smaller_alternatives(instrument: Instrument) -> list[str]:
    """Same underlying and currency, strictly smaller multiplier."""
    group = _group(instrument.symbol)
    if group == "other":
        return []
    return [
        i.name
        for i in INSTRUMENTS.values()
        if i.currency == instrument.currency
        and i.multiplier < instrument.multiplier
        and _group(i.symbol) == group
    ]


_GROUPS = {
    "gold": ("GOLD", "GOLDM", "GOLDGUINEA", "GOLDPETAL", "XAUUSD", "GC"),
    "silver": ("SILVER", "SILVERM", "SILVERMIC", "XAGUSD", "SI"),
    "crude": ("CRUDEOIL", "CRUDEOILM", "CL"),
    "natgas": ("NATURALGAS", "NATGASMINI"),
    "zinc": ("ZINC", "ZINCMINI"),
    "lead": ("LEAD", "LEADMINI"),
    "aluminium": ("ALUMINIUM", "ALUMINIMINI"),
}


def _group(symbol: str) -> str:
    s = symbol.upper()
    for name, members in _GROUPS.items():
        if s in members:
            return name
    return "other"
