import numpy as np

from app.engines import volatility


def _ohlc(closes: np.ndarray, wick: float = 1.0) -> np.ndarray:
    opens = np.concatenate([[closes[0]], closes[:-1]])
    highs = np.maximum(opens, closes) + wick
    lows = np.minimum(opens, closes) - wick
    ts = np.arange(len(closes))
    return np.column_stack([ts, opens, highs, lows, closes])


def test_atr_positive():
    rng = np.random.default_rng(3)
    closes = 100 + rng.normal(0, 1, 300).cumsum()
    ohlc = _ohlc(closes)
    a = volatility.atr(ohlc, period=14)
    assert a > 0


def test_high_vol_regime_detected():
    rng = np.random.default_rng(4)
    # calm period followed by a volatility shock
    calm = rng.normal(0, 0.2, 200).cumsum() + 100
    shock = calm[-1] + rng.normal(0, 3, 50).cumsum()
    closes = np.concatenate([calm, shock])
    ohlc = _ohlc(closes, wick=2.0)
    report = volatility.analyze(ohlc, period=14, regime_lookback=100)
    assert report.regime in ("normal", "high")
    assert report.atr > 0
