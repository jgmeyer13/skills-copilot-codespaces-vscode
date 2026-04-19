"""Bayesian posterior over {BUY, SELL} via log-odds accumulation.

prior from HTF trend (EMA slope vs price). Each signal contributes an evidence
weight in log-odds space, which keeps combination well-behaved.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class BayesInput:
    htf_trend: float           # -1..+1  (bearish .. bullish)
    bos_probability: float     # 0..1
    bos_bias: str              # "bullish" | "bearish" | "neutral"
    liquidity_sweep: float     # 0..1
    correlation_coef: float    # -1..+1
    peer_bos_bias: str         # structure bias of the correlated symbol
    volatility_regime: str     # "low" | "normal" | "high"


def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def ema(x: np.ndarray, period: int) -> np.ndarray:
    alpha = 2.0 / (period + 1)
    out = np.empty_like(x, dtype=float)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = out[i - 1] * (1 - alpha) + x[i] * alpha
    return out


def htf_trend(closes: np.ndarray, period: int = 50) -> float:
    """Return a scalar in [-1, 1] indicating higher-timeframe bias."""
    if len(closes) < period + 2:
        return 0.0
    e = ema(closes, period)
    slope = (e[-1] - e[-period]) / max(abs(e[-period]), 1e-9)
    price_vs_ema = (closes[-1] - e[-1]) / max(abs(e[-1]), 1e-9)
    raw = slope * 50 + price_vs_ema * 20
    return float(max(-1.0, min(1.0, raw)))


def posterior(inp: BayesInput) -> tuple[float, float]:
    """Return (p_buy, p_sell)."""
    # prior: translate HTF trend into log-odds of BUY
    lo = inp.htf_trend * 1.2  # weight 1.2

    # BOS contribution
    bos_dir = {"bullish": 1, "bearish": -1, "neutral": 0}[inp.bos_bias]
    lo += bos_dir * inp.bos_probability * 1.5

    # liquidity sweep: interpreted as reversal fuel
    # sweep of highs (sweep>0 and bos bullish extending) — ambiguous, so weight smaller
    lo += bos_dir * inp.liquidity_sweep * 0.6

    # correlation agreement: peer symbol's structure confirms or denies
    peer_dir = {"bullish": 1, "bearish": -1, "neutral": 0}[inp.peer_bos_bias]
    agreement = peer_dir * bos_dir  # +1 agree, -1 disagree, 0 neutral
    lo += agreement * abs(inp.correlation_coef) * 1.0

    # volatility regime: high-vol regime boosts confidence in a break, low-vol damps
    regime_weight = {"low": 0.7, "normal": 1.0, "high": 1.15}[inp.volatility_regime]
    lo *= regime_weight

    p_buy = _sigmoid(lo)
    return p_buy, 1 - p_buy
