"""Tests for indicator math, sizing rules, and the WAIT guard.

Data here is synthetic and exists only to exercise the code paths. It is not
market data and must never be read as analysis of a real instrument.
"""

from __future__ import annotations

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzer import contracts, indicators, structure  # noqa: E402
from analyzer.data import Series  # noqa: E402
from analyzer.engine import analyse  # noqa: E402


def make_series(closes, volumes=None):
    highs = [c * 1.004 for c in closes]
    lows = [c * 0.996 for c in closes]
    vols = volumes if volumes is not None else [1000.0] * len(closes)
    return Series(
        times=[None] * len(closes), opens=list(closes), highs=highs,
        lows=lows, closes=list(closes), volumes=vols,
        has_volume=any(v > 0 for v in vols),
    )


class TestIndicators(unittest.TestCase):
    def test_sma_warmup_and_value(self):
        out = indicators.sma([1, 2, 3, 4, 5], 3)
        self.assertEqual(out[:2], [None, None])
        self.assertAlmostEqual(out[2], 2.0)
        self.assertAlmostEqual(out[4], 4.0)

    def test_ema_seeded_with_sma(self):
        out = indicators.ema([1, 2, 3, 4, 5], 3)
        self.assertIsNone(out[1])
        self.assertAlmostEqual(out[2], 2.0)  # SMA seed of 1,2,3
        self.assertAlmostEqual(out[3], 3.0)  # (4-2)*0.5 + 2

    def test_ema_shorter_than_period_is_all_none(self):
        self.assertEqual(indicators.ema([1, 2], 5), [None, None])

    def test_rsi_bounds(self):
        closes = [100 + math.sin(i / 3) * 5 for i in range(80)]
        for v in indicators.rsi(closes, 14):
            if v is not None:
                self.assertGreaterEqual(v, 0.0)
                self.assertLessEqual(v, 100.0)

    def test_rsi_is_100_when_only_gains(self):
        out = indicators.rsi(list(range(1, 40)), 14)
        self.assertAlmostEqual(out[-1], 100.0)

    def test_rsi_alignment(self):
        closes = [float(i) for i in range(40)]
        out = indicators.rsi(closes, 14)
        self.assertEqual(len(out), len(closes))
        self.assertIsNone(out[13])
        self.assertIsNotNone(out[14])

    def test_macd_alignment_and_histogram(self):
        closes = [100 + i * 0.5 for i in range(60)]
        line, signal, hist = indicators.macd(closes)
        self.assertEqual(len(line), len(closes))
        self.assertIsNone(line[24])
        self.assertIsNotNone(line[25])
        for m, s, h in zip(line, signal, hist):
            if None not in (m, s, h):
                self.assertAlmostEqual(h, m - s)

    def test_atr_is_positive(self):
        closes = [100 + math.sin(i / 5) * 3 for i in range(60)]
        s = make_series(closes)
        for v in indicators.atr(s.highs, s.lows, s.closes, 14):
            if v is not None:
                self.assertGreater(v, 0)

    def test_vwap_resets_on_session_boundary(self):
        closes = [10.0, 20.0, 30.0, 40.0]
        s = make_series(closes)
        starts = [True, False, True, False]
        out = indicators.vwap(s.highs, s.lows, s.closes, s.volumes, starts)
        # Third bar starts a new session, so it equals its own typical price.
        typical = (s.highs[2] + s.lows[2] + s.closes[2]) / 3
        self.assertAlmostEqual(out[2], typical)


def zigzag(pivots, bars_between=3):
    """Interpolate between pivot prices so fractal detection can confirm them."""
    out = [pivots[0]]
    for a, b in zip(pivots, pivots[1:]):
        for k in range(1, bars_between + 1):
            out.append(a + (b - a) * k / bars_between)
    return out


class TestStructure(unittest.TestCase):
    def test_uptrend_is_recognised(self):
        # Oscillation must exceed drift or there are no confirmed pivots.
        pivots = [100, 115, 106, 121, 112, 127, 118, 133]
        s = make_series(zigzag(pivots))
        atr = indicators.atr(s.highs, s.lows, s.closes, 5)
        atr_value = next(v for v in reversed(atr) if v is not None)
        swings = structure.find_swings(s.highs, s.lows)
        desc, _ = structure.describe_structure(swings, atr_value)
        self.assertEqual(desc, "higher highs and higher lows")

    def test_flat_oscillation_is_a_range_not_a_trend(self):
        # Regression: sub-ATR differences between swings must not read as trend.
        closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        s = make_series(closes)
        atr = indicators.atr(s.highs, s.lows, s.closes, 14)
        atr_value = next(v for v in reversed(atr) if v is not None)
        swings = structure.find_swings(s.highs, s.lows)
        desc, strength = structure.describe_structure(swings, atr_value)
        self.assertEqual(desc, "range")
        self.assertEqual(strength, "Weak")

    def test_zones_are_bands_not_lines(self):
        closes = [100 + math.sin(i / 4) * 6 for i in range(120)]
        s = make_series(closes)
        swings = structure.find_swings(s.highs, s.lows)
        sup, res = structure.build_zones(swings, s.closes[-1], 1.5)
        for z in sup + res:
            self.assertGreater(z.high, z.low)


class TestSizing(unittest.TestCase):
    def test_lots_derived_from_stop_distance(self):
        c = contracts.resolve("SILVERM")  # 5 kg lot, INR per kg
        # 1000/kg stop x 5 = 5,000 risk per lot; 1% of 500,000 = 5,000.
        sizing = contracts.size_position(500_000, 90_000, 89_000, c, 1.0)
        self.assertTrue(sizing.affordable)
        self.assertAlmostEqual(sizing.lots, 1.0)

    def test_refuses_when_one_lot_exceeds_budget(self):
        c = contracts.resolve("GOLDM")
        sizing = contracts.size_position(200_000, 115_000, 113_500, c, 1.0)
        self.assertFalse(sizing.affordable)
        self.assertIn("Do not tighten the stop", sizing.message)

    def test_risk_pct_is_capped_at_one_percent(self):
        c = contracts.resolve("SILVERM")
        sizing = contracts.size_position(500_000, 90_000, 89_000, c, 5.0)
        self.assertEqual(sizing.risk_pct, contracts.MAX_RISK_PCT)

    def test_suggests_smaller_contract(self):
        c = contracts.resolve("GOLD")
        sizing = contracts.size_position(100_000, 115_000, 113_000, c, 1.0)
        self.assertFalse(sizing.affordable)
        self.assertIn("Mini", sizing.message)


class TestEngineGuards(unittest.TestCase):
    def test_choppy_market_returns_wait(self):
        closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        self.assertEqual(a.decision, "WAIT")

    def test_never_sells_the_floor_of_a_range(self):
        # Regression: bearish votes at range support previously emitted Sell.
        closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        self.assertEqual(a.decision, "WAIT")
        self.assertTrue(any("no edge" in w for w in a.warnings))

    def test_short_history_is_flagged(self):
        closes = [100 + i * 0.1 for i in range(60)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        self.assertTrue(any("200 SMA needs 200" in w for w in a.warnings))

    def test_tick_volume_is_not_used_for_confirmation(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), "XAUUSD", "daily")
        self.assertIn("tick", a.volume_note.lower())
        self.assertTrue(any("tick-count" in w for w in a.warnings))

    def test_real_volume_is_used_for_confirmation(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        self.assertIn("average", a.volume_note.lower())

    def test_vwap_skipped_on_daily(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        vwap_votes = [v for v in a.votes if v.name == "VWAP"]
        self.assertEqual(vwap_votes[0].direction, 0)

    def test_any_signal_meets_rr_floor(self):
        closes = [100 + math.sin(i / 9) * 4 + i * 0.15 for i in range(300)]
        a = analyse(make_series(closes), "GOLDM", "daily")
        if a.decision in ("Buy", "Sell"):
            self.assertGreaterEqual(a.rr, 1.5)
            self.assertIsNotNone(a.stop)
            self.assertIsNotNone(a.invalidation)


if __name__ == "__main__":
    unittest.main(verbosity=2)
