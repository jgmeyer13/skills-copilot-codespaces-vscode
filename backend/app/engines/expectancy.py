"""Expectancy per trade, in R units.

expectancy_R = p_win * avg_win_R - (1 - p_win) * avg_loss_R

`avg_loss_R` is the absolute value (loss taken as 1R by construction when
we stop at the planned stop, otherwise measured).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ExpectancyResult:
    p_win: float
    avg_win_r: float
    avg_loss_r: float
    expectancy_r: float


def expectancy(p_win: float, avg_win_r: float, avg_loss_r: float = 1.0) -> float:
    avg_loss_r = abs(avg_loss_r)
    return p_win * avg_win_r - (1 - p_win) * avg_loss_r


def compute_from_history(results_r: list[float]) -> ExpectancyResult:
    """Given a history of per-trade R outcomes, derive expectancy parameters."""
    if not results_r:
        return ExpectancyResult(0.5, 1.0, 1.0, 0.0)
    wins = [r for r in results_r if r > 0]
    losses = [abs(r) for r in results_r if r <= 0]
    p_win = len(wins) / len(results_r) if results_r else 0.0
    avg_win = sum(wins) / len(wins) if wins else 0.0
    avg_loss = sum(losses) / len(losses) if losses else 1.0
    e = expectancy(p_win, avg_win, avg_loss)
    return ExpectancyResult(p_win=p_win, avg_win_r=avg_win, avg_loss_r=avg_loss, expectancy_r=e)
