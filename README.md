# NGFunded — NextGen Prop Trading Platform

A full-stack proprietary trading evaluation engine with real-time risk enforcement, sub-50ms drawdown monitoring, and advanced trade analytics.

## 🎨 Design System

| Token | Value | Use |
|---|---|---|
| Background | `#0B080C` | App background |
| Crimson | `#E63946` | Danger, shorts, breaches |
| Amber | `#FFB703` | Warnings, progress |
| Cyan | `#00F5D4` | Longs, profits, live data |

## 🏗 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── accounts/         GET list + GET [id]
│   │   ├── trades/           GET + POST + PATCH
│   │   ├── metrics/          GET (perf metrics + equity curve)
│   │   ├── risk/check/       POST manual risk trigger
│   │   └── auth/[...nextauth]/
│   ├── auth/login/           Login page
│   ├── dashboard/            Protected dashboard
│   └── page.tsx              Landing page
├── components/
│   ├── dashboard/
│   │   ├── top-bar.tsx       Account selector, P&L, progress
│   │   ├── sidebar.tsx       Icon nav
│   │   ├── metric-cards.tsx  4-card KPI grid
│   │   ├── equity-chart.tsx  TradingView Lightweight Charts
│   │   └── trade-table.tsx   Paginated, filterable journal
│   └── providers.tsx         TanStack Query + NextAuth
├── hooks/
│   └── use-account-websocket.ts  WS with auto-reconnect
├── lib/
│   ├── auth.ts               NextAuth v5 config
│   ├── prisma.ts             Singleton client
│   ├── redis.ts              Singleton + cache key helpers
│   ├── risk-engine.ts        Daily & total drawdown checker
│   ├── metrics.ts            Profit factor, win rate, equity curve
│   ├── utils.ts              Currency/PnL formatters
│   └── api.ts                Error shapes, pagination, validation
├── server/
│   └── mock-exchange.ts      WebSocket tick + equity simulator
├── store/
│   └── account-store.ts      Zustand global state
└── types/
    └── index.ts              All domain types
prisma/
├── schema.prisma             Full data model
└── seed.ts                   Dev seed data
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your DB and Redis URLs

# 3. Run database migrations
npx prisma migrate dev --name init

# 4. Seed development data
npm run db:seed

# 5. Generate Prisma client
npm run db:generate

# 6. Start Next.js dev server
npm run dev

# 7. (Optional) Start mock exchange WebSocket server
npm run exchange:dev
```

Visit `http://localhost:3000`

### Dev Credentials (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | admin@ngfunded.io | Admin@1234 |
| Trader 1 | trader1@ngfunded.io | Trader@1234 |
| Trader 2 | trader2@ngfunded.io | Trader@1234 |

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/accounts` | List trading accounts (paginated) |
| `GET` | `/api/accounts/[id]` | Single account detail |
| `GET` | `/api/trades` | Trade journal (filterable) |
| `POST` | `/api/trades` | Open a new trade |
| `PATCH` | `/api/trades` | Close a trade + trigger risk check |
| `GET` | `/api/metrics` | Performance metrics + equity curve |
| `POST` | `/api/risk/check` | Manual risk engine trigger |

## ⚡ Risk Engine

Two rules enforced on every tick (target: <50ms via Redis):

1. **Daily Loss Limit** — `(SOD Equity - Current Equity) >= maxDailyLossLimit`
2. **Max Total Drawdown** — `(Initial Balance - Current Equity) >= maxTotalDrawdownLimit`

On breach: atomic DB transaction writes `BreachLog` + sets account status to `BREACHED`, then publishes event to Redis pub/sub channel for WebSocket fanout.

## 🗄 Database Schema

Core models: `User`, `TradingAccount`, `Trade`, `DailyEquitySnapshot`, `BreachLog`, `Payout`

Run `npm run db:studio` to open Prisma Studio.

## 🛠 Next Steps (Phase 2+)

- [ ] Admin panel (breach audit logs, payout approvals, manual overrides)
- [ ] Trade journal upload (screenshot + form with Shadcn Dialog)
- [ ] Analytics page (by symbol, by tag, R:R distribution chart)
- [ ] Email notifications (breach alerts, payout confirmations)
- [ ] CI/CD pipeline + Docker Compose for local stack
