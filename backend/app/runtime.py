"""Background signal loop: fetch data, run engines, broadcast.

Runs as an asyncio task started by FastAPI's lifespan. Each tick:
  1. Pull OHLC for both symbols from the adapter.
  2. Run correlation / lead-lag / volatility / structure engines.
  3. Compose a Bayesian posterior + expectancy and score confidence.
  4. Plan a trade (sizing / stops) if confidence gate passes.
  5. Persist a SignalLog row and broadcast the payload over the WebSocket.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.adapters import get_adapter
from app.config import settings
from app.db import SessionLocal
from app.engines import (
    bayesian,
    confidence as confidence_engine,
    correlation,
    lead_lag,
    structure,
    volatility,
)
from app.models import SignalLog
from app.schemas import SignalPayload
from app.services.broadcaster import broadcaster
from app.services import journal
from app.services.risk import plan_trade


log = logging.getLogger("atlas.runtime")


async def run_once() -> SignalPayload:
    adapter = get_adapter()
    us = settings.symbol_us100
    spx = settings.symbol_spx

    us_ohlc = adapter.get_ohlc(us, "5m", bars=500)
    spx_ohlc = adapter.get_ohlc(spx, "5m", bars=500)

    us_close = us_ohlc[:, 4]
    spx_close = spx_ohlc[:, 4]

    corr = correlation.analyze(us_close, spx_close)
    ll = lead_lag.analyze(us_close, spx_close, us, spx)
    vol_us = volatility.analyze(us_ohlc)
    vol_spx = volatility.analyze(spx_ohlc)
    struct_us = structure.analyze(us_ohlc)
    struct_spx = structure.analyze(spx_ohlc)

    htf_us = bayesian.htf_trend(us_close, period=50)

    with SessionLocal() as db:
        hist_wr = journal.historical_win_rate(db)

    conf = confidence_engine.score(
        symbol=us,
        htf_trend=htf_us,
        structure=struct_us,
        peer_structure=struct_spx,
        correlation=corr,
        lead_lag=ll,
        volatility=vol_us,
        historical_win_rate=hist_wr,
        min_confidence=settings.min_confidence,
        min_expectancy_r=settings.min_expectancy_r,
    )

    stop_price = tp_price = size = None
    if conf.accepted:
        plan = plan_trade(
            direction=conf.direction,
            entry=float(us_close[-1]),
            atr=vol_us.atr,
            equity=settings.account_equity,
            risk_pct=settings.risk_per_trade_pct,
        )
        stop_price, tp_price, size = plan.stop, plan.take_profit, plan.size

    payload = SignalPayload(
        ts=datetime.utcnow(),
        us100_price=float(us_close[-1]),
        spx_price=float(spx_close[-1]),
        correlation=corr,
        lead_lag=ll,
        volatility_us100=vol_us,
        volatility_spx=vol_spx,
        structure_us100=struct_us,
        structure_spx=struct_spx,
        confidence=conf,
        suggested_stop=stop_price,
        suggested_tp=tp_price,
        suggested_size=size,
    )

    with SessionLocal() as db:
        db.add(
            SignalLog(
                symbol=us,
                direction=conf.direction,
                confidence=conf.confidence,
                expectancy_r=conf.expectancy_r,
                taken=1 if conf.accepted else 0,
                payload=payload.model_dump(mode="json"),
            )
        )
        db.commit()

    return payload


async def signal_loop() -> None:
    log.info("ATLAS signal loop started (interval=%.2fs)", settings.signal_interval_sec)
    while True:
        try:
            payload = await run_once()
            await broadcaster.publish(payload.model_dump(mode="json"))
        except Exception:  # keep loop alive; log the failure
            log.exception("signal loop iteration failed")
        await asyncio.sleep(settings.signal_interval_sec)
