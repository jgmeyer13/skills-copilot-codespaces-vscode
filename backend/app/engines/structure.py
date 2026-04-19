"""Quantify SMC / ICT concepts into 0..1 scores.

These are deliberately simple, auditable heuristics — not magic. The point is
that every SMC concept becomes a number the confidence scorer can combine.
"""
from __future__ import annotations

import numpy as np

from app.schemas import StructureReport


def _swing_points(close: np.ndarray, lookback: int = 20) -> tuple[float, float]:
    recent = close[-lookback:]
    return float(recent.max()), float(recent.min())


def bos_probability(ohlc: np.ndarray, lookback: int = 20) -> tuple[float, str]:
    """Break-of-structure score. High if last close pierces swing high/low on momentum."""
    close = ohlc[:, 4]
    if len(close) < lookback + 2:
        return 0.0, "neutral"

    swing_high, swing_low = _swing_points(close[:-1], lookback)
    last = close[-1]
    prev = close[-2]

    momentum = abs(last - prev) / max(abs(prev) * 0.001, 1e-9)

    if last > swing_high:
        score = min(1.0, 0.5 + momentum * 0.1 + (last - swing_high) / max(swing_high, 1e-9) * 50)
        return float(min(max(score, 0.0), 1.0)), "bullish"
    if last < swing_low:
        score = min(1.0, 0.5 + momentum * 0.1 + (swing_low - last) / max(swing_low, 1e-9) * 50)
        return float(min(max(score, 0.0), 1.0)), "bearish"
    # no break — score decays with distance from nearest swing
    nearest = min(abs(last - swing_high), abs(last - swing_low))
    rng = max(swing_high - swing_low, 1e-9)
    return float(0.2 * (1 - nearest / rng)), "neutral"


def liquidity_sweep_score(ohlc: np.ndarray, lookback: int = 20) -> float:
    """Detect a wick that takes out a recent high/low then closes back inside."""
    if len(ohlc) < lookback + 2:
        return 0.0
    high, low, close = ohlc[:, 2], ohlc[:, 3], ohlc[:, 4]
    prior_high = float(high[-lookback - 1 : -1].max())
    prior_low = float(low[-lookback - 1 : -1].min())

    last_h, last_l, last_c = high[-1], low[-1], close[-1]

    up_sweep = last_h > prior_high and last_c < prior_high
    down_sweep = last_l < prior_low and last_c > prior_low

    if up_sweep:
        over = (last_h - prior_high) / max(prior_high, 1e-9)
        return float(min(1.0, 0.5 + over * 1000))
    if down_sweep:
        over = (prior_low - last_l) / max(prior_low, 1e-9)
        return float(min(1.0, 0.5 + over * 1000))
    return 0.0


def order_block_strength(ohlc: np.ndarray, lookback: int = 30) -> float:
    """Find the largest engulfing candle in the lookback and return a normalized strength."""
    if len(ohlc) < lookback:
        return 0.0
    window = ohlc[-lookback:]
    bodies = np.abs(window[:, 4] - window[:, 1])  # |close - open|
    avg_body = bodies.mean()
    if avg_body == 0:
        return 0.0
    strongest = bodies.max()
    return float(min(1.0, (strongest / avg_body - 1.0) / 3.0))


def analyze(ohlc: np.ndarray) -> StructureReport:
    bos, bias = bos_probability(ohlc)
    sweep = liquidity_sweep_score(ohlc)
    ob = order_block_strength(ohlc)
    return StructureReport(
        bos_probability=round(bos, 4),
        liquidity_sweep=round(sweep, 4),
        order_block_strength=round(ob, 4),
        bias=bias,
    )
