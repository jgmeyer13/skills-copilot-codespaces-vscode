"""Compose engine outputs into a single actionable signal.

Rules:
- Confidence is the Bayesian posterior probability of the chosen direction.
- A signal is only `accepted` when confidence >= min_confidence AND
  expectancy_r >= min_expectancy_r (probability + expectancy gate).
- Reasoning is a list of human-readable bullets describing why.
"""
from __future__ import annotations

from app.engines.bayesian import BayesInput, posterior
from app.engines.expectancy import expectancy
from app.schemas import (
    ConfidenceReport,
    CorrelationReport,
    LeadLagReport,
    StructureReport,
    VolatilityReport,
)


def _target_rr(vol_regime: str) -> float:
    # be more patient for targets in high-vol regimes
    return {"low": 1.5, "normal": 2.0, "high": 2.5}[vol_regime]


def score(
    *,
    symbol: str,
    htf_trend: float,
    structure: StructureReport,
    peer_structure: StructureReport,
    correlation: CorrelationReport,
    lead_lag: LeadLagReport,
    volatility: VolatilityReport,
    historical_win_rate: float,
    min_confidence: float,
    min_expectancy_r: float,
) -> ConfidenceReport:
    p_buy, p_sell = posterior(
        BayesInput(
            htf_trend=htf_trend,
            bos_probability=structure.bos_probability,
            bos_bias=structure.bias,
            liquidity_sweep=structure.liquidity_sweep,
            correlation_coef=correlation.coefficient,
            peer_bos_bias=peer_structure.bias,
            volatility_regime=volatility.regime,
        )
    )
    if p_buy >= p_sell:
        direction = "BUY"
        confidence = p_buy
    else:
        direction = "SELL"
        confidence = p_sell

    rr = _target_rr(volatility.regime)
    exp_r = expectancy(p_win=historical_win_rate, avg_win_r=rr, avg_loss_r=1.0)

    reasoning = []
    reasoning.append(f"{symbol}: {direction} posterior {confidence:.2%}")
    reasoning.append(f"HTF trend {htf_trend:+.2f}; BOS {structure.bos_probability:.2f} ({structure.bias})")
    if structure.liquidity_sweep > 0.3:
        reasoning.append(f"Liquidity sweep detected (score {structure.liquidity_sweep:.2f})")
    reasoning.append(
        f"Correlation {correlation.coefficient:+.2f} ({correlation.strength})"
        + (" — divergence" if correlation.divergence else "")
    )
    if lead_lag.leader:
        reasoning.append(
            f"{lead_lag.leader} leading {lead_lag.follower} by {lead_lag.lag_bars} bars "
            f"(|xcorr|={lead_lag.strength:.2f})"
        )
    reasoning.append(f"Volatility {volatility.regime}; ATR={volatility.atr}")
    reasoning.append(
        f"Historical win rate {historical_win_rate:.0%}; expectancy {exp_r:+.2f}R at target {rr:.1f}R"
    )

    accepted = confidence >= min_confidence and exp_r >= min_expectancy_r
    if not accepted:
        reasoning.append(
            "REJECTED — "
            + ("confidence below threshold" if confidence < min_confidence else "negative expectancy")
        )
        # still report direction for transparency, but mark FLAT on gate fail
        out_dir = "FLAT"
    else:
        out_dir = direction

    return ConfidenceReport(
        direction=out_dir,
        confidence=round(confidence, 4),
        expectancy_r=round(exp_r, 4),
        reasoning=reasoning,
        accepted=accepted,
    )
