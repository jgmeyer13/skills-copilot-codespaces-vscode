"""Trade journal persistence + aggregate stats."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Trade
from app.schemas import JournalStats


def list_trades(db: Session, limit: int = 100) -> list[Trade]:
    stmt = select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    return list(db.scalars(stmt))


def stats(db: Session) -> JournalStats:
    total = db.scalar(select(func.count()).select_from(Trade)) or 0
    wins = db.scalar(select(func.count()).select_from(Trade).where(Trade.status == "WIN")) or 0
    losses = db.scalar(select(func.count()).select_from(Trade).where(Trade.status == "LOSS")) or 0
    net_pnl = db.scalar(select(func.coalesce(func.sum(Trade.pnl), 0.0))) or 0.0
    avg_rr = db.scalar(
        select(func.coalesce(func.avg(Trade.pnl_r), 0.0)).where(Trade.pnl_r.is_not(None))
    ) or 0.0

    decided = wins + losses
    win_rate = wins / decided if decided else 0.0
    expectancy_r = (
        win_rate * (avg_rr if avg_rr > 0 else 0.0)
        - (1 - win_rate) * 1.0
    )

    return JournalStats(
        total_trades=total,
        wins=wins,
        losses=losses,
        win_rate=round(win_rate, 4),
        avg_rr=round(avg_rr, 4),
        expectancy_r=round(expectancy_r, 4),
        net_pnl=round(net_pnl, 2),
    )


def historical_win_rate(db: Session, fallback: float = 0.52) -> float:
    decided = db.scalar(
        select(func.count()).select_from(Trade).where(Trade.status.in_(("WIN", "LOSS")))
    ) or 0
    if decided < 10:
        # not enough data — assume a conservative prior so expectancy gate works meaningfully
        return fallback
    wins = db.scalar(select(func.count()).select_from(Trade).where(Trade.status == "WIN")) or 0
    return wins / decided
