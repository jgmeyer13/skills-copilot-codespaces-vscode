import numpy as np

from app.engines import lead_lag


def test_a_leads_b_by_two_bars():
    rng = np.random.default_rng(7)
    driver = rng.normal(0, 1, 600).cumsum() + 1000
    a = driver.copy()
    b = np.concatenate([[driver[0], driver[0]], driver[:-2]])  # b lags a by 2 bars
    b = b + rng.normal(0, 0.05, len(b))

    report = lead_lag.analyze(a, b, "A", "B", max_lag=5)
    assert report.leader == "A"
    assert report.follower == "B"
    assert report.lag_bars == 2
    assert report.strength > 0.5


def test_no_lead_when_random():
    rng = np.random.default_rng(11)
    a = rng.normal(0, 1, 500).cumsum() + 1000
    b = rng.normal(0, 1, 500).cumsum() + 1000
    report = lead_lag.analyze(a, b, "A", "B")
    # either no leader identified, or the strength is very low
    assert report.leader is None or report.strength < 0.3
