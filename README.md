# NGFunded — NextGen Prop Trading Platform

A full-stack proprietary trading evaluation engine with real-time risk enforcement, market-data-driven paper trading, and advanced trade analytics.

## 🎨 Design System

| Token | Value | Use |
|---|---|---|
| Background | `#0B080C` | App background |
| Crimson | `#E63946` | Danger, shorts, breaches |
| Amber | `#FFB703` | Warnings, progress |
| Cyan | `#00F5D4` | Longs, profits, live data |

## 🏗 Architecture

NgFunded is **always paper trading**. MetaTrader 5 is used only as a real-time market-data source; NgFunded never sends orders to MT5.

```text
MetaTrader 5 terminal
        │
        │ bid / ask ticks
        ▼
Python MT5 market-data bridge
        │
        │ Redis pub/sub
        ▼
NgFunded market-data fanout
        │
        ├── WebSocket → dashboard
        │
        └── mark-to-market → risk engine
                              │
                              ▼
                         paper account
```

### Project structure

```text
src/
├── app/api/
│   ├── accounts/
│   ├── trades/
│   ├── metrics/
│   ├── risk/check/
│   ├── market-data/          MT5 connection/status API
│   └── integrations/tradingview/webhook/
├── components/dashboard/
│   ├── market-data-status.tsx MT5 live-data indicator
│   ├── order-ticket.tsx       Paper order entry
│   ├── equity-chart.tsx
│   └── trade-table.tsx
├── lib/
│   ├── broker/paper-broker.ts
│   ├── redis.ts
│   └── risk-engine.ts         MT5 quote-based mark-to-market
├── server/
│   ├── mock-exchange.ts       Redis → WebSocket market-data fanout
│   └── mt5-bridge.py          MT5 → Redis market-data bridge
└── types/

requirements-mt5.txt           Python bridge dependencies
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- MetaTrader 5 terminal on the machine running the market-data bridge
- Python 3 + the packages in `requirements-mt5.txt`

### App setup

```bash
npm install
cp .env.example .env.local
npx prisma migrate dev --name init
npm run db:seed
npm run db:generate
npm run dev
```

### MT5 market-data bridge

```bash
python -m pip install -r requirements-mt5.txt
python src/server/mt5-bridge.py
```

Configure `.env.local` / the MT5 host environment with:

```env
REDIS_URL="redis://localhost:6379"
MARKET_DATA_PROVIDER="mt5"
MT5_SYMBOLS="EURUSD,GBPUSD,USDJPY,XAUUSD,NAS100,US30"
MT5_POLL_INTERVAL_MS=100
MT5_TERMINAL_PATH=""
MT5_LOGIN=""
MT5_PASSWORD=""
MT5_SERVER=""
```

### Start the WebSocket fanout

```bash
npm run market:dev
```

The fanout subscribes to the Redis market-data channel, sends ticks to connected paper-trading clients, and marks open paper positions to market using the MT5 bid/ask quote.

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List trading accounts |
| `GET` | `/api/accounts/[id]` | Single trading account |
| `GET` | `/api/trades` | Trade journal |
| `POST` | `/api/trades` | Open a paper trade |
| `PATCH` | `/api/trades` | Close a paper trade |
| `GET` | `/api/metrics` | Performance metrics + equity curve |
| `POST` | `/api/risk/check` | Manual risk-engine trigger |
| `GET` | `/api/market-data` | MT5 market-data connection and latest quotes |
| `POST` | `/api/integrations/tradingview/webhook` | TradingView → NgFunded paper orders |

## ⚡ Risk Engine

The risk engine is driven by **simulated account equity marked from real-time MT5 prices**.

1. **Daily Loss Limit** — `(SOD Equity - Current Equity) >= maxDailyLossLimit`
2. **Max Total Drawdown** — `(Initial Balance - Current Equity) >= maxTotalDrawdownLimit`

For a BUY position, NgFunded marks the position against the **MT5 bid**. For a SELL position, it marks against the **MT5 ask**, so the simulated P&L includes the live spread.

On breach, an atomic DB transaction writes `BreachLog`, changes the paper account to `BREACHED`, and publishes an event to Redis.

## 🧪 Trading model

There is deliberately **no live trading adapter**. All orders in NgFunded are simulated paper orders. MT5 provides prices only.
