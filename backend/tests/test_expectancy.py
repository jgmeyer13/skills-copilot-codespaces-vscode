from app.engines import expectancy as ex


def test_expectancy_math():
    e = ex.expectancy(p_win=0.5, avg_win_r=2.0, avg_loss_r=1.0)
    assert abs(e - 0.5) < 1e-9

    e2 = ex.expectancy(p_win=0.4, avg_win_r=2.0, avg_loss_r=1.0)
    assert abs(e2 - 0.2) < 1e-9

    e3 = ex.expectancy(p_win=0.3, avg_win_r=1.0, avg_loss_r=1.0)
    assert e3 < 0  # losing system


def test_expectancy_from_history():
    results = [2, -1, 2, -1, 3, -1, -1, 2]
    r = ex.compute_from_history(results)
    assert 0 < r.p_win < 1
    assert r.avg_win_r > 0
    assert r.avg_loss_r > 0


def test_empty_history_defaults():
    r = ex.compute_from_history([])
    assert r.p_win == 0.5
    assert r.expectancy_r == 0.0
