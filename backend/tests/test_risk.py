from app.services.risk import plan_trade


def test_long_plan_math():
    plan = plan_trade(
        direction="BUY",
        entry=100.0,
        atr=2.0,
        equity=100_000,
        risk_pct=0.5,
        atr_mult=1.5,
        rr=2.0,
    )
    # stop distance = 1.5 * 2 = 3
    assert abs(plan.stop - 97.0) < 1e-6
    assert abs(plan.take_profit - 106.0) < 1e-6
    # risk = 500, size = 500 / 3 ~ 166.667
    assert abs(plan.risk_amount - 500.0) < 1e-6
    assert abs(plan.size - (500.0 / 3.0)) < 1e-3


def test_short_plan_math():
    plan = plan_trade(
        direction="SELL",
        entry=100.0,
        atr=2.0,
        equity=100_000,
        risk_pct=1.0,
        atr_mult=1.0,
        rr=3.0,
    )
    assert plan.stop > plan.entry
    assert plan.take_profit < plan.entry
    assert plan.risk_amount == 1000.0


def test_rejects_invalid_atr():
    import pytest
    with pytest.raises(ValueError):
        plan_trade(direction="BUY", entry=100, atr=0, equity=100_000, risk_pct=0.5)
