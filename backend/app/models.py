from datetime import datetime

from sqlalchemy import JSON, Float, Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    symbol: Mapped[str] = mapped_column(String(16), index=True)
    direction: Mapped[str] = mapped_column(String(4))  # BUY / SELL
    entry: Mapped[float] = mapped_column(Float)
    stop: Mapped[float] = mapped_column(Float)
    take_profit: Mapped[float] = mapped_column(Float)
    size: Mapped[float] = mapped_column(Float)

    confidence: Mapped[float] = mapped_column(Float)
    expectancy_r: Mapped[float] = mapped_column(Float)
    reasoning: Mapped[dict] = mapped_column(JSON, default=dict)

    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    pnl: Mapped[float | None] = mapped_column(Float, nullable=True)
    pnl_r: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="OPEN")  # OPEN / WIN / LOSS / FLAT


class SignalLog(Base):
    """Persist every signal the runtime produces, regardless of whether a trade was taken."""
    __tablename__ = "signal_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    symbol: Mapped[str] = mapped_column(String(16), index=True)
    direction: Mapped[str] = mapped_column(String(4))
    confidence: Mapped[float] = mapped_column(Float)
    expectancy_r: Mapped[float] = mapped_column(Float)
    taken: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
