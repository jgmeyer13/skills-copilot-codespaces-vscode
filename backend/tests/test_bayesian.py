import numpy as np

from app.engines import bayesian


def test_posterior_bullish_when_everything_aligns():
    p_buy, p_sell = bayesian.posterior(
        bayesian.BayesInput(
            htf_trend=0.8,
            bos_probability=0.9,
            bos_bias="bullish",
            liquidity_sweep=0.4,
            correlation_coef=0.9,
            peer_bos_bias="bullish",
            volatility_regime="normal",
        )
    )
    assert p_buy > 0.8
    assert p_buy + p_sell == 1.0 or abs(p_buy + p_sell - 1.0) < 1e-9


def test_posterior_bearish_when_everything_aligns():
    p_buy, p_sell = bayesian.posterior(
        bayesian.BayesInput(
            htf_trend=-0.8,
            bos_probability=0.9,
            bos_bias="bearish",
            liquidity_sweep=0.4,
            correlation_coef=0.9,
            peer_bos_bias="bearish",
            volatility_regime="normal",
        )
    )
    assert p_sell > 0.8


def test_peer_disagreement_dampens_conviction():
    aligned = bayesian.posterior(
        bayesian.BayesInput(
            htf_trend=0.3,
            bos_probability=0.6,
            bos_bias="bullish",
            liquidity_sweep=0.0,
            correlation_coef=0.9,
            peer_bos_bias="bullish",
            volatility_regime="normal",
        )
    )
    conflicted = bayesian.posterior(
        bayesian.BayesInput(
            htf_trend=0.3,
            bos_probability=0.6,
            bos_bias="bullish",
            liquidity_sweep=0.0,
            correlation_coef=0.9,
            peer_bos_bias="bearish",
            volatility_regime="normal",
        )
    )
    assert aligned[0] > conflicted[0]


def test_htf_trend_positive_for_uptrend():
    closes = np.linspace(100, 200, 300)
    t = bayesian.htf_trend(closes)
    assert t > 0


def test_htf_trend_negative_for_downtrend():
    closes = np.linspace(200, 100, 300)
    t = bayesian.htf_trend(closes)
    assert t < 0
