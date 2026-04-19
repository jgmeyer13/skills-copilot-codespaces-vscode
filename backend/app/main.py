"""ATLAS FastAPI entrypoint."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.adapters import get_adapter
from app.config import settings
from app.db import get_session, init_db
from app.runtime import run_once, signal_loop
from app.schemas import JournalStats, SignalPayload, TradeOut
from app.services import journal
from app.services.broadcaster import broadcaster

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("atlas")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(signal_loop())
    log.info("ATLAS boot complete. Adapter=%s", settings.market_adapter)
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="ATLAS", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "adapter": settings.market_adapter}


@app.get("/api/signal", response_model=SignalPayload)
async def get_signal() -> SignalPayload:
    return await run_once()


@app.get("/api/ohlc")
def get_ohlc(symbol: str, timeframe: str = "5m", bars: int = 200) -> dict:
    adapter = get_adapter()
    data = adapter.get_ohlc(symbol, timeframe, bars).tolist()
    return {"symbol": symbol, "timeframe": timeframe, "bars": data}


@app.get("/api/journal/trades", response_model=list[TradeOut])
def trades(limit: int = 100, db: Session = Depends(get_session)) -> list[TradeOut]:
    return [TradeOut.model_validate(t) for t in journal.list_trades(db, limit=limit)]


@app.get("/api/journal/stats", response_model=JournalStats)
def trade_stats(db: Session = Depends(get_session)) -> JournalStats:
    return journal.stats(db)


@app.websocket("/ws/signals")
async def ws_signals(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = await broadcaster.subscribe()
    try:
        while True:
            msg = await queue.get()
            await websocket.send_text(json.dumps(msg, default=str))
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.unsubscribe(queue)
