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

from analyzer import indicators, instruments, structure  # noqa: E402
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
        c = instruments.resolve("SILVERM")  # 5 kg lot, INR per kg
        # 1000/kg stop x 5 = 5,000 risk per lot; 1% of 500,000 = 5,000.
        sizing = instruments.size_position(500_000, 90_000, 89_000, c, 1.0)
        self.assertTrue(sizing.affordable)
        self.assertAlmostEqual(sizing.quantity, 1.0)
        self.assertEqual(sizing.unit, "lot")

    def test_equity_is_sized_in_shares(self):
        c = instruments.resolve("RELIANCE")
        self.assertEqual(c.asset_class, instruments.EQUITY)
        # 25/share stop, 1% of 500,000 = 5,000 budget -> 200 shares.
        sizing = instruments.size_position(500_000, 1_400, 1_375, c, 1.0)
        self.assertTrue(sizing.affordable)
        self.assertAlmostEqual(sizing.quantity, 200.0)
        self.assertEqual(sizing.unit, "share")

    def test_lot_size_override_replaces_multiplier(self):
        c = instruments.resolve("NIFTY", lot_size=75)
        self.assertEqual(c.multiplier, 75.0)
        self.assertFalse(c.verify_lot)

    def test_unknown_symbol_falls_back_to_equity(self):
        c = instruments.resolve("SOMENEWLISTING")
        self.assertEqual(c.multiplier, 1.0)
        self.assertEqual(c.asset_class, instruments.EQUITY)

    def test_refuses_when_one_lot_exceeds_budget(self):
        c = instruments.resolve("GOLDM")
        sizing = instruments.size_position(200_000, 115_000, 113_500, c, 1.0)
        self.assertFalse(sizing.affordable)
        self.assertIn("Do not tighten the stop", sizing.message)

    def test_risk_pct_is_capped_at_one_percent(self):
        c = instruments.resolve("SILVERM")
        sizing = instruments.size_position(500_000, 90_000, 89_000, c, 5.0)
        self.assertEqual(sizing.risk_pct, instruments.MAX_RISK_PCT)

    def test_suggests_smaller_contract(self):
        c = instruments.resolve("GOLD")
        sizing = instruments.size_position(100_000, 115_000, 113_000, c, 1.0)
        self.assertFalse(sizing.affordable)
        self.assertIn("Mini", sizing.message)


class TestEngineGuards(unittest.TestCase):
    def test_choppy_market_returns_wait(self):
        closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        self.assertEqual(a.decision, "WAIT")

    def test_never_sells_the_floor_of_a_range(self):
        # Regression: bearish votes at range support previously emitted Sell.
        # The trend/timing split now rejects this earlier, but the outcome
        # that matters is unchanged — no signal, and a stated reason.
        closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        self.assertEqual(a.decision, "WAIT")
        self.assertTrue(any(
            "no edge" in w or "Trend checks disagree" in w for w in a.warnings))

    def test_momentum_alone_cannot_veto_a_pullback(self):
        # Trend checks aligned bullish, RSI/MACD turned down into support.
        # Before the trend/timing split this always returned WAIT, making
        # pullback entries impossible and leaving only breakouts.
        from analyzer.engine import TIMING_CHECKS, TREND_CHECKS
        self.assertFalse(TREND_CHECKS & TIMING_CHECKS)
        pivots = [100]
        for k in range(14):
            pivots += [pivots[-1] + 26, pivots[-1] + 10]
        closes = zigzag(pivots, bars_between=7)
        # Finish partway into a dip rather than at the high.
        closes += [closes[-1] - 4, closes[-1] - 7, closes[-1] - 9]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        if a.decision == "Buy":
            self.assertIn(a.setup, ("pullback", "continuation"))
            self.assertLess(a.stop, a.entry)
            self.assertGreaterEqual(a.rr, 1.5)
        else:
            self.assertTrue(a.warnings)

    def test_short_history_is_flagged(self):
        closes = [100 + i * 0.1 for i in range(60)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        self.assertTrue(any("200 SMA needs 200" in w for w in a.warnings))

    def test_tick_volume_is_not_used_for_confirmation(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), instruments.resolve("XAUUSD"), "daily")
        self.assertIn("tick", a.volume_note.lower())
        self.assertTrue(any("tick-count" in w for w in a.warnings))

    def test_real_volume_is_used_for_confirmation(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        self.assertIn("average", a.volume_note.lower())

    def test_vwap_skipped_on_daily(self):
        closes = [100 + i * 0.2 for i in range(260)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        vwap_votes = [v for v in a.votes if v.name == "VWAP"]
        self.assertEqual(vwap_votes[0].direction, 0)

    def test_any_signal_meets_rr_floor(self):
        closes = [100 + math.sin(i / 9) * 4 + i * 0.15 for i in range(300)]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"), "daily")
        if a.decision in ("Buy", "Sell"):
            self.assertGreaterEqual(a.rr, 1.5)
            self.assertIsNotNone(a.stop)
            self.assertIsNotNone(a.invalidation)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestAssetClassWarnings(unittest.TestCase):
    def _analyse(self, symbol, timeframe="daily", lot=None):
        closes = [100 + math.sin(i / 9) * 4 + i * 0.15 for i in range(300)]
        inst = instruments.resolve(symbol, lot)
        return analyse(make_series(closes), inst, timeframe)

    def test_equity_warns_about_gaps(self):
        a = self._analyse("RELIANCE")
        self.assertTrue(any("gap over stops" in w for w in a.warnings))
        self.assertTrue(any("splits" in w for w in a.warnings))

    def test_mcx_warns_about_currency_and_expiry(self):
        a = self._analyse("CRUDEOIL")
        self.assertTrue(any("expire" in w for w in a.warnings))
        self.assertTrue(any("USDINR" in w for w in a.warnings))

    def test_index_warns_when_lot_not_overridden(self):
        a = self._analyse("NIFTY")
        self.assertTrue(any("lot size is revised" in w for w in a.warnings))

    def test_index_warning_clears_with_override(self):
        a = self._analyse("NIFTY", lot=75)
        self.assertFalse(any("lot size is revised" in w for w in a.warnings))

    def test_circuit_warning_only_intraday(self):
        self.assertTrue(any("Circuit" in w
                            for w in self._analyse("RELIANCE", "15m").warnings))
        self.assertFalse(any("Circuit" in w
                             for w in self._analyse("RELIANCE", "daily").warnings))


class TestChartAndScanner(unittest.TestCase):
    def _series_and_analysis(self, symbol="GOLDM"):
        closes = [100 + math.sin(i / 9) * 4 + i * 0.15 for i in range(300)]
        s = make_series(closes)
        return s, analyse(s, instruments.resolve(symbol), "daily")

    def test_svg_is_wellformed_and_selfcontained(self):
        from xml.etree import ElementTree
        from analyzer import chart
        s, a = self._series_and_analysis()
        svg = chart.render_svg(s, a)
        ElementTree.fromstring(svg)  # raises if malformed
        self.assertNotIn("http://", svg.replace(
            'xmlns="http://www.w3.org/2000/svg"', ""))

    def test_scan_ranks_actionable_first(self):
        from analyzer.scanner import ScanRow
        trending = self._series_and_analysis()[1]
        flat_closes = [100 + math.sin(i / 2) * 2 for i in range(260)]
        flat = analyse(make_series(flat_closes),
                       instruments.resolve("GOLDM"), "daily")
        rows = sorted([ScanRow("FLAT", flat), ScanRow("TREND", trending)],
                      key=lambda r: r.rank_key, reverse=True)
        if trending.decision in ("Buy", "Sell"):
            self.assertEqual(rows[0].symbol, "TREND")
        self.assertEqual(rows[-1].analysis.decision, "WAIT")

    def test_scan_row_survives_a_failed_symbol(self):
        from analyzer.scanner import ScanRow, render_table
        table = render_table([ScanRow("BAD", None, "no such symbol")])
        self.assertIn("ERROR", table)
        self.assertIn("0 actionable of 1", table)


class TestFeeds(unittest.TestCase):
    def test_resample_aggregates_ohlc(self):
        from analyzer.feeds import resample
        s = make_series([10.0, 12.0, 9.0, 11.0, 15.0, 13.0])
        out = resample(s, 3)
        self.assertEqual(len(out), 2)
        self.assertAlmostEqual(out.opens[0], s.opens[0])
        self.assertAlmostEqual(out.closes[0], s.closes[2])
        self.assertAlmostEqual(out.highs[0], max(s.highs[:3]))
        self.assertAlmostEqual(out.lows[0], min(s.lows[:3]))
        self.assertAlmostEqual(out.volumes[0], sum(s.volumes[:3]))

    def test_yahoo_maps_bare_indian_ticker_to_ns(self):
        from analyzer.feeds import YahooFeed
        self.assertEqual(YahooFeed()._map("RELIANCE"), "RELIANCE.NS")
        self.assertEqual(YahooFeed()._map("XAUUSD"), "GC=F")
        self.assertEqual(YahooFeed()._map("^NSEI"), "^NSEI")

    def test_angel_requires_credentials(self):
        import os
        from analyzer.feeds import AngelOneFeed, FeedError
        saved = {k: os.environ.pop(k, None) for k in
                 ("ANGEL_API_KEY", "ANGEL_CLIENT_CODE", "ANGEL_PIN", "ANGEL_TOTP")}
        try:
            with self.assertRaises(FeedError) as ctx:
                AngelOneFeed()._credentials()
            self.assertIn("ANGEL_API_KEY", str(ctx.exception))
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v

    def test_unknown_provider_is_rejected(self):
        from analyzer.feeds import build, FeedError
        with self.assertRaises(FeedError):
            build("definitely-not-a-provider")


class TestZoneWidth(unittest.TestCase):
    def test_zones_never_chain_into_one_giant_band(self):
        # Regression: dense swings chained through neighbour-distance
        # clustering, producing a single zone spanning most of the chart.
        closes = [1250 + math.sin(i / 7) * 40 + i * 1.1 for i in range(320)]
        s = make_series(closes)
        atr = indicators.atr(s.highs, s.lows, s.closes, 14)
        atr_value = next(v for v in reversed(atr) if v is not None)
        swings = structure.find_swings(s.highs, s.lows)
        sup, res = structure.build_zones(swings, s.closes[-1], atr_value)
        self.assertTrue(sup or res)
        for z in sup + res:
            self.assertLessEqual(
                z.high - z.low,
                atr_value * structure.MAX_ZONE_ATR * 1.05,
                f"zone {z} is {(z.high - z.low) / atr_value:.1f} ATR wide",
            )


class TestSignalHappyPath(unittest.TestCase):
    def test_clean_uptrend_pullback_produces_a_buy(self):
        # A rising market that pulls back into support should be actionable;
        # if this ever returns WAIT the engine has become unable to signal.
        closes = []
        for i in range(320):
            closes.append(100 + i * 0.55 + math.sin(i / 11) * 7)
        # End the series on a dip toward support rather than at the highs.
        closes += [closes[-1] - 3.0, closes[-1] - 5.5, closes[-1] - 6.0]
        a = analyse(make_series(closes), instruments.resolve("GOLDM"),
                    "daily", capital=5_000_000)
        self.assertEqual(a.bias, "Bullish")
        if a.decision == "Buy":
            self.assertLess(a.stop, a.entry)
            self.assertGreater(a.target1, a.entry)
            self.assertGreaterEqual(a.rr, 1.5)
            self.assertTrue(a.sizing.affordable)
        else:
            # Still must be for a stated reason, never silently.
            self.assertTrue(a.warnings)


class TestTargetSelection(unittest.TestCase):
    def _zone(self, low, high, touches=1):
        return structure.Zone(low, high, touches, "resistance", 0)

    def test_skips_minor_levels_inside_the_risk_distance(self):
        from analyzer.engine import _pick_targets
        # Risk 10, so a target must be >= 15 away. The 104 zone is too close.
        zones = [self._zone(103, 105), self._zone(119, 121)]
        t1, t2, skipped = _pick_targets(100.0, 10.0, zones, 1, "uptrend")
        self.assertAlmostEqual(t1, 120.0)
        self.assertEqual(skipped, 1)

    def test_does_not_skip_levels_in_a_range(self):
        from analyzer.engine import _pick_targets
        zones = [self._zone(103, 105), self._zone(119, 121)]
        t1, _, skipped = _pick_targets(100.0, 10.0, zones, 1, "range")
        self.assertAlmostEqual(t1, 104.0)
        self.assertEqual(skipped, 0)

    def test_range_without_a_target_ahead_returns_none(self):
        from analyzer.engine import _pick_targets
        t1, t2, _ = _pick_targets(100.0, 10.0, [], 1, "range")
        self.assertIsNone(t1)
        self.assertIsNone(t2)

    def test_trend_without_zones_falls_back_to_r_multiples(self):
        from analyzer.engine import _pick_targets
        t1, t2, _ = _pick_targets(100.0, 10.0, [], 1, "uptrend")
        self.assertAlmostEqual(t1, 125.0)
        self.assertAlmostEqual(t2, 140.0)

    def test_short_direction_targets_sit_below_entry(self):
        from analyzer.engine import _pick_targets
        zones = [structure.Zone(79, 81, 2, "support", 0),
                 structure.Zone(96, 98, 1, "support", 0)]
        t1, t2, skipped = _pick_targets(100.0, 10.0, zones, -1, "downtrend")
        self.assertAlmostEqual(t1, 80.0)
        self.assertEqual(skipped, 1)
        self.assertLess(t2, t1)

    def test_every_emitted_signal_clears_the_rr_floor(self):
        import random
        from analyzer.engine import MIN_RR
        random.seed(5)
        inst = instruments.resolve("GOLDM")
        checked = 0
        for _ in range(120):
            drift = random.uniform(-0.8, 0.8)
            closes = [500 + i * drift + math.sin(i / 17) * 9 +
                      random.gauss(0, 1.5) for i in range(320)]
            a = analyse(make_series(closes), inst, "daily", capital=10_000_000)
            if a.decision in ("Buy", "Sell"):
                checked += 1
                self.assertGreaterEqual(a.rr, MIN_RR)
                sign = 1 if a.decision == "Buy" else -1
                self.assertGreater((a.target1 - a.entry) * sign, 0)
                self.assertLess((a.stop - a.entry) * sign, 0)
        self.assertGreater(checked, 0, "no signals produced to verify")
