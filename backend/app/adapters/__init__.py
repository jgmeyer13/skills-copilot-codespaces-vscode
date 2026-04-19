from app.adapters.base import MarketDataAdapter
from app.adapters.mock import MockAdapter
from app.config import settings


def get_adapter() -> MarketDataAdapter:
    if settings.market_adapter == "mt5":
        from app.adapters.mt5 import MT5Adapter
        return MT5Adapter()
    return MockAdapter()
