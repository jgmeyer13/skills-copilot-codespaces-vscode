"""Identify which symbol leads the other via cross-correlation of returns.

For each lag k in [-max_lag, max_lag] we compute corr(returns_a[t], returns_b[t+k]).
The lag with maximum |corr| tells us the lead relationship:
  k > 0  -> a leads b by k bars
  k < 0  -> b leads a by |k| bars
"""
from __future__ import annotations

import numpy as np

from app.schemas import LeadLagReport


def _returns(x: np.ndarray) -> np.ndarray:
    return np.diff(x) / x[:-1]


def best_lag(a: np.ndarray, b: np.ndarray, max_lag: int = 5) -> tuple[int, float]:
    ra, rb = _returns(a), _returns(b)
    n = min(len(ra), len(rb))
    if n < 2 * max_lag + 2:
        return 0, 0.0
    ra, rb = ra[-n:], rb[-n:]

    best_k = 0
    best_corr = 0.0
    for k in range(-max_lag, max_lag + 1):
        if k > 0:
            x, y = ra[:-k], rb[k:]
        elif k < 0:
            x, y = ra[-k:], rb[:k]
        else:
            x, y = ra, rb
        if len(x) < 2 or x.std() == 0 or y.std() == 0:
            continue
        c = float(np.corrcoef(x, y)[0, 1])
        if abs(c) > abs(best_corr):
            best_corr = c
            best_k = k
    return best_k, best_corr


def analyze(
    a: np.ndarray, b: np.ndarray, name_a: str, name_b: str, max_lag: int = 5
) -> LeadLagReport:
    k, corr = best_lag(a, b, max_lag)
    if k == 0 or abs(corr) < 0.15:
        return LeadLagReport(leader=None, follower=None, lag_bars=0, strength=abs(corr))
    if k > 0:
        leader, follower, lag = name_a, name_b, k
    else:
        leader, follower, lag = name_b, name_a, -k
    return LeadLagReport(leader=leader, follower=follower, lag_bars=lag, strength=round(abs(corr), 4))
