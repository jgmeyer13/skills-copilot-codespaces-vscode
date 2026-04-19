"""Risk and position sizing.

position_size in units/contracts =
  (equity * risk_pct) / stop_distance_in_price

Stop is ATR-scaled by `atr_mult` below the/above entry (long/short).
Take-profit set by R multiple.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TradePlan:
    direction: str  # BUY / SELL
    entry: float
    stop: float
    take_profit: float
    size: float
    risk_amount: float
    rr: float


def plan_trade(
    *,
    direction: str,
    entry: float,
    atr: float,
    equity: float,
    risk_pct: float,
    atr_mult: float = 1.5,
    rr: float = 2.0,
) -> TradePlan:
    if direction not in ("BUY", "SELL"):
        raise ValueError("direction must be BUY or SELL")
    if atr <= 0:
        raise ValueError("atr must be positive")

    stop_distance = atr * atr_mult
    if direction == "BUY":
        stop = entry - stop_distance
        tp = entry + stop_distance * rr
    else:
        stop = entry + stop_distance
        tp = entry - stop_distance * rr

    risk_amount = equity * (risk_pct / 100.0)
    size = risk_amount / stop_distance
    return TradePlan(
        direction=direction,
        entry=round(entry, 4),
        stop=round(stop, 4),
        take_profit=round(tp, 4),
        size=round(size, 6),
        risk_amount=round(risk_amount, 2),
        rr=rr,
    )
