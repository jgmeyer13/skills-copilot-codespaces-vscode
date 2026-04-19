# ATLAS — Autonomous Trading & Learning Algorithm System

Probability-driven trading research terminal for US indices (US100 / S&P 500).
Milestone 1: working skeleton end-to-end. Built to reason about setups in
expectancy and risk terms, not to promise returns.

## What's in Milestone 1

- FastAPI backend with a pluggable market-data adapter (mock by default, MT5
  integration documented)
- Engines: rolling correlation, lead–lag (cross-correlation), ATR + volatility
  regime, SMC/ICT structure scoring, Bayesian posterior, expectancy,
  combined confidence scorer
- ATR-based position sizing and risk service
- Postgres-backed trade journal (SQLAlchemy)
- WebSocket stream that pushes live signals + AI "thinking" reasoning
- Next.js + Tailwind dashboard: price charts, correlation panel, bias meter,
  thinking panel, trade journal
- Pytest suite covering the quant math

## Explicitly deferred (documented TODOs, not faked)

Monte Carlo equity simulator UI, walk-forward backtester, self-learning weight
adaptation, weekly AI reports, news sentiment, liquidity heatmaps, what-if
simulator, live MT5 order execution (adapter interface is there; live trading
is the next milestone).

## Layout

```
backend/      FastAPI app, engines, adapters, tests
frontend/     Next.js 14 app router dashboard
docker-compose.yml  Postgres + Redis + backend + frontend
.env.example  Environment template
```

## Quickstart (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Backend:  http://localhost:8000  (docs at /docs)
- Frontend: http://localhost:3000
- WebSocket: ws://localhost:8000/ws/signals

## Quickstart (local dev)

Backend:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=sqlite:///./atlas.db
uvicorn app.main:app --reload
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Tests:
```bash
cd backend && pytest
```

## Environment variables

See `.env.example`. The mock adapter needs no credentials. To switch to MT5
set `MARKET_ADAPTER=mt5` and populate `MT5_LOGIN`, `MT5_PASSWORD`,
`MT5_SERVER`. The MT5 adapter is stubbed with the real integration points
marked — fill them in once you have a broker account and the `MetaTrader5`
Python package installed (Windows-only dependency).

## Design notes

- Every engine takes numpy arrays and returns plain dataclasses. No hidden
  global state — easy to unit test and to feed from a backtester later.
- Confidence score is **probability + expectancy gated**: a high-probability
  setup is still rejected if expectancy ≤ 0.
- The mock adapter generates correlated US100 / SPX synthetic series using a
  two-factor model so the correlation and lead-lag engines have realistic
  inputs during development.
- Nothing here guarantees returns. The system's job is to quantify edge and
  refuse bad trades.

## License

MIT — see `LICENSE`.
