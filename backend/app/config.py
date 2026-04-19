from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./atlas.db"
    redis_url: str = "redis://localhost:6379/0"

    market_adapter: str = "mock"
    mt5_login: str = ""
    mt5_password: str = ""
    mt5_server: str = ""

    symbol_us100: str = "NAS100"
    symbol_spx: str = "SPX500"

    account_equity: float = 100_000.0
    risk_per_trade_pct: float = 0.5
    min_confidence: float = 0.60
    min_expectancy_r: float = 0.10

    signal_interval_sec: float = 2.0


settings = Settings()
