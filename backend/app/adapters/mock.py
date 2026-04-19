"""Deterministic synthetic market data generator.

Generates correlated US100 / SPX series using a two-factor model so downstream
correlation and lead-lag engines receive realistic inputs. The US100 series is
intentionally given slightly higher volatility and a one-bar lead on the
common factor, which lets the lead-lag engine pick up a real signal.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

from app.adapters.base import MarketDataAdapter
from app.config import settings


TIMEFRAME_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


@dataclass
class _Series:
    closes: np.ndarray
    ts: np.ndarray
    last_updated: float = field(default_factory=time.time)


class MockAdapter(MarketDataAdapter):
    def __init__(self, seed: int = 42, bars: int = 2000) -> None:
        self._rng = np.random.default_rng(seed)
        self._bars = bars
        self._cache: dict[tuple[str, str], _Series] = {}
        self._us100_sym = settings.symbol_us100
        self._spx_sym = settings.symbol_spx

    def _generate(self, symbol: str, timeframe: str) -> _Series:
        """Two-factor model: common market factor + symbol-specific noise.

        US100 reacts to the common factor with a 1-bar lead (uses shift) —
        this is how the lead-lag engine gets a real signal in dev.
        """
        n = self._bars
        step = TIMEFRAME_SECONDS.get(timeframe, 60)
        # SHARED common factor across symbols (seed depends only on timeframe).
        common_rng = np.random.default_rng(abs(hash(("atlas-common-v1", timeframe))) % (2**32))
        common = common_rng.normal(0, 1.0, n + 5).cumsum()
        # Per-symbol idiosyncratic noise.
        idio_rng = np.random.default_rng(abs(hash((symbol, timeframe, "idio-v1"))) % (2**32))
        idio = idio_rng.normal(0, 0.25, n).cumsum()

        if symbol == self._us100_sym:
            # US100 is 70% same-bar + 30% one-bar-ahead → strong same-bar
            # correlation with SPX but still a detectable lead.
            factor = 0.7 * common[:n] + 0.3 * common[1 : n + 1]
            factor *= 1.2
            base = 18_000.0
            scale = 8.0
        else:
            factor = common[:n]
            base = 5_000.0
            scale = 2.5

        closes = base + factor * scale + idio * 0.4
        closes = np.maximum(closes, base * 0.5)  # floor

        now = int(time.time())
        ts = np.arange(now - step * (n - 1), now + 1, step, dtype=np.int64)[:n]
        return _Series(closes=closes, ts=ts)

    def _get_series(self, symbol: str, timeframe: str) -> _Series:
        key = (symbol, timeframe)
        if key not in self._cache:
            self._cache[key] = self._generate(symbol, timeframe)
        return self._cache[key]

    def get_ohlc(self, symbol: str, timeframe: str, bars: int) -> np.ndarray:
        series = self._get_series(symbol, timeframe)
        closes = series.closes[-bars:]
        ts = series.ts[-bars:]

        # synthesize OHLC around closes with realistic wicks
        rng = np.random.default_rng(abs(hash((symbol, timeframe, "ohlc"))) % (2**32))
        spread = np.abs(np.diff(closes, prepend=closes[0])) + 0.5
        opens = np.concatenate([[closes[0]], closes[:-1]])
        highs = np.maximum(opens, closes) + rng.uniform(0.1, 1.0, len(closes)) * spread
        lows = np.minimum(opens, closes) - rng.uniform(0.1, 1.0, len(closes)) * spread
        return np.column_stack([ts, opens, highs, lows, closes])

    def last_price(self, symbol: str) -> float:
        series = self._get_series(symbol, "1m")
        # drift the tail slightly each call so the dashboard sees movement
        drift = self._rng.normal(0, 0.3)
        series.closes[-1] = series.closes[-1] + drift
        return float(series.closes[-1])
