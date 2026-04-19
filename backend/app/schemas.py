from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class Candle(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class CorrelationReport(BaseModel):
    coefficient: float
    strength: Literal["weak", "moderate", "strong"]
    divergence: bool
    window: int


class LeadLagReport(BaseModel):
    leader: str | None
    follower: str | None
    lag_bars: int
    strength: float  # |cross-correlation| at best lag


class VolatilityReport(BaseModel):
    atr: float
    regime: Literal["low", "normal", "high"]
    std_pct: float


class StructureReport(BaseModel):
    bos_probability: float
    liquidity_sweep: float
    order_block_strength: float
    bias: Literal["bullish", "bearish", "neutral"]


class ConfidenceReport(BaseModel):
    direction: Literal["BUY", "SELL", "FLAT"]
    confidence: float
    expectancy_r: float
    reasoning: list[str]
    accepted: bool


class SignalPayload(BaseModel):
    ts: datetime
    us100_price: float
    spx_price: float
    correlation: CorrelationReport
    lead_lag: LeadLagReport
    volatility_us100: VolatilityReport
    volatility_spx: VolatilityReport
    structure_us100: StructureReport
    structure_spx: StructureReport
    confidence: ConfidenceReport
    suggested_stop: float | None = None
    suggested_tp: float | None = None
    suggested_size: float | None = None


class TradeOut(BaseModel):
    id: int
    created_at: datetime
    closed_at: datetime | None
    symbol: str
    direction: str
    entry: float
    stop: float
    take_profit: float
    size: float
    confidence: float
    expectancy_r: float
    exit_price: float | None
    pnl: float | None
    pnl_r: float | None
    status: str

    model_config = ConfigDict(from_attributes=True)


class JournalStats(BaseModel):
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    avg_rr: float
    expectancy_r: float
    net_pnl: float
