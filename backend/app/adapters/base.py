from abc import ABC, abstractmethod

import numpy as np


class MarketDataAdapter(ABC):
    """Abstract adapter. Implementations fetch OHLCV for a symbol.

    `get_ohlc` returns a numpy array of shape (n, 5): [ts, open, high, low, close].
    Timestamps are unix seconds.
    """

    @abstractmethod
    def get_ohlc(self, symbol: str, timeframe: str, bars: int) -> np.ndarray: ...

    @abstractmethod
    def last_price(self, symbol: str) -> float: ...
