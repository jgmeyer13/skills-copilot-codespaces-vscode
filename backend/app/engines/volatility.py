"""ATR and volatility regime detection."""
from __future__ import annotations

import numpy as np

from app.schemas import VolatilityReport


def atr(ohlc: np.ndarray, period: int = 14) -> float:
    """Wilder ATR. `ohlc` is (n, 5) with columns [ts, o, h, l, c]."""
    if len(ohlc) < period + 1:
        raise ValueError(f"need at least {period + 1} bars for ATR({period})")
    high, low, close = ohlc[:, 2], ohlc[:, 3], ohlc[:, 4]
    prev_close = np.concatenate([[close[0]], close[:-1]])
    tr = np.maximum.reduce([
        high - low,
        np.abs(high - prev_close),
        np.abs(low - prev_close),
    ])
    # Wilder smoothing
    a = np.empty_like(tr)
    a[:period] = tr[:period].mean()
    alpha = 1.0 / period
    for i in range(period, len(tr)):
        a[i] = a[i - 1] * (1 - alpha) + tr[i] * alpha
    return float(a[-1])


def analyze(ohlc: np.ndarray, period: int = 14, regime_lookback: int = 120) -> VolatilityReport:
    current = atr(ohlc, period)

    # baseline ATR over a longer window using the same Wilder smoother
    lb = min(regime_lookback, len(ohlc) - period - 1)
    baseline_atr = atr(ohlc[-(lb + period + 1):], period) if lb > period else current

    # also track an average ATR across a rolling window to smooth comparison
    closes = ohlc[:, 4]
    std_pct = float(closes[-regime_lookback:].std() / closes[-1]) if len(closes) >= regime_lookback else 0.0

    ratio = current / baseline_atr if baseline_atr > 0 else 1.0
    if ratio >= 1.4:
        regime = "high"
    elif ratio <= 0.7:
        regime = "low"
    else:
        regime = "normal"

    return VolatilityReport(atr=round(current, 4), regime=regime, std_pct=round(std_pct, 5))
