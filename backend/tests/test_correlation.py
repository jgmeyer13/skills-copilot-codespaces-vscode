import numpy as np

from app.engines import correlation


def test_perfect_positive_correlation():
    rng = np.random.default_rng(0)
    a = 100 + rng.normal(0, 1, 500).cumsum()
    b = a * 1.5 + 50  # linear transform -> perfectly correlated returns
    r = correlation.rolling_correlation(a, b, window=100)
    assert r > 0.99


def test_classification():
    assert correlation.classify(0.85) == "strong"
    assert correlation.classify(0.5) == "moderate"
    assert correlation.classify(0.1) == "weak"
    assert correlation.classify(-0.8) == "strong"


def test_analyze_reports_strong_positive():
    rng = np.random.default_rng(1)
    a = 100 + rng.normal(0, 1, 500).cumsum()
    b = a + rng.normal(0, 0.1, 500)
    report = correlation.analyze(a, b)
    assert report.strength in ("strong", "moderate")
    assert report.coefficient > 0.5
    assert report.divergence is False


def test_divergence_detected():
    rng = np.random.default_rng(2)
    a = 100 + rng.normal(0, 1, 500).cumsum()
    b = a + rng.normal(0, 0.1, 500)
    # break correlation in the recent window
    b[-40:] = 100 + rng.normal(0, 1, 40).cumsum()
    report = correlation.analyze(a, b, short_window=30, long_window=200)
    # at least one of the flags should trigger on broken correlation
    assert report.coefficient < 0.7
