"""MetaTrader 5 adapter.

This is a documented integration point. The `MetaTrader5` Python package is
Windows-only and requires a running MT5 terminal plus broker credentials, so
it is not installed by default. To enable:

    pip install MetaTrader5
    export MARKET_ADAPTER=mt5
    export MT5_LOGIN=... MT5_PASSWORD=... MT5_SERVER=...

Then uncomment the integration block below. Every integration point is
marked with `TODO(mt5)`.
"""
from __future__ import annotations

import numpy as np

from app.adapters.base import MarketDataAdapter
from app.config import settings


TIMEFRAME_MAP = {
    "1m": "TIMEFRAME_M1",
    "5m": "TIMEFRAME_M5",
    "15m": "TIMEFRAME_M15",
    "1h": "TIMEFRAME_H1",
    "4h": "TIMEFRAME_H4",
    "1d": "TIMEFRAME_D1",
}


class MT5Adapter(MarketDataAdapter):
    def __init__(self) -> None:
        # TODO(mt5): import MetaTrader5 as mt5; mt5.initialize(...)
        # if not mt5.login(int(settings.mt5_login), settings.mt5_password, settings.mt5_server):
        #     raise RuntimeError("MT5 login failed")
        if not settings.mt5_login:
            raise RuntimeError(
                "MT5 adapter selected but MT5_LOGIN is empty. See backend/app/adapters/mt5.py."
            )
        raise NotImplementedError(
            "MT5 integration is wired as documentation only in M1. "
            "Install MetaTrader5, uncomment the TODO(mt5) blocks, and remove this raise."
        )

    def get_ohlc(self, symbol: str, timeframe: str, bars: int) -> np.ndarray:
        # TODO(mt5): tf = getattr(mt5, TIMEFRAME_MAP[timeframe])
        # rates = mt5.copy_rates_from_pos(symbol, tf, 0, bars)
        # return np.column_stack([rates["time"], rates["open"], rates["high"], rates["low"], rates["close"]])
        raise NotImplementedError

    def last_price(self, symbol: str) -> float:
        # TODO(mt5): tick = mt5.symbol_info_tick(symbol); return tick.bid
        raise NotImplementedError
