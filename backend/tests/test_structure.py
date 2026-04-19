import numpy as np

from app.engines import structure


def _ohlc(closes: np.ndarray, wick: float = 0.5) -> np.ndarray:
    opens = np.concatenate([[closes[0]], closes[:-1]])
    highs = np.maximum(opens, closes) + wick
    lows = np.minimum(opens, closes) - wick
    ts = np.arange(len(closes))
    return np.column_stack([ts, opens, highs, lows, closes])


def test_bullish_bos_detected_on_breakout():
    closes = np.concatenate([np.full(30, 100.0), [101.0, 102.0, 108.0]])
    ohlc = _ohlc(closes)
    score, bias = structure.bos_probability(ohlc, lookback=20)
    assert bias == "bullish"
    assert score > 0.3


def test_bearish_bos_detected_on_breakdown():
    closes = np.concatenate([np.full(30, 100.0), [99.0, 98.0, 92.0]])
    ohlc = _ohlc(closes)
    score, bias = structure.bos_probability(ohlc, lookback=20)
    assert bias == "bearish"
    assert score > 0.3


def test_analyze_returns_all_fields():
    rng = np.random.default_rng(9)
    closes = 100 + rng.normal(0, 1, 200).cumsum()
    report = structure.analyze(_ohlc(closes))
    assert 0 <= report.bos_probability <= 1
    assert 0 <= report.liquidity_sweep <= 1
    assert 0 <= report.order_block_strength <= 1
    assert report.bias in ("bullish", "bearish", "neutral")
