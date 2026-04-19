"""Rolling Pearson correlation between two closing-price series.

Divergence flag fires when the short-window correlation has decayed
meaningfully from the long-window baseline — often an early warning that the
two indices are about to disagree.
"""
from __future__ import annotations

import numpy as np

from app.schemas import CorrelationReport


def _returns(x: np.ndarray) -> np.ndarray:
    return np.diff(x) / x[:-1]


def rolling_correlation(a: np.ndarray, b: np.ndarray, window: int) -> float:
    if len(a) != len(b):
        raise ValueError("series must be equal length")
    if len(a) < window + 1:
        raise ValueError(f"need at least {window + 1} samples, got {len(a)}")
    ra = _returns(a)[-window:]
    rb = _returns(b)[-window:]
    if ra.std() == 0 or rb.std() == 0:
        return 0.0
    return float(np.corrcoef(ra, rb)[0, 1])


def classify(coef: float) -> str:
    c = abs(coef)
    if c >= 0.7:
        return "strong"
    if c >= 0.3:
        return "moderate"
    return "weak"


def analyze(a: np.ndarray, b: np.ndarray, short_window: int = 30, long_window: int = 120) -> CorrelationReport:
    short = rolling_correlation(a, b, short_window)
    long = rolling_correlation(a, b, long_window)
    # divergence: baseline was strong positive, short-window dropped by >0.4
    divergence = bool(long > 0.5 and (long - short) > 0.4)
    return CorrelationReport(
        coefficient=round(short, 4),
        strength=classify(short),
        divergence=divergence,
        window=short_window,
    )
