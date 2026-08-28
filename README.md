# Ghori Exch — Gaming Platform

Scalable, server-authoritative casino-style gaming platform foundation. Supports 50–100 games via a plugin architecture.

## Architecture

```
games/
├── apps/
│   ├── api/          # Express REST API + Socket.io realtime
│   ├── web/          # Player frontend (React + Vite)
│   └── admin/        # Admin dashboard (React + Vite)
├── packages/
│   ├── shared/       # Shared TypeScript types & constants
│   └── game-engine/  # Game plugin interface & registry
├── prisma/
│   ├── schema.prisma # Database schema
│   └── seed.ts       # Development seed data
└── docker-compose.yml
```

## Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- npm

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Start PostgreSQL
docker compose up -d

# 4. Run migrations & seed
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Start all services
npm run dev
```

## URLs

| Service | URL |
|---------|-----|
| Player app | http://localhost:5173 |
| Admin panel | http://localhost:5174 |
| API | http://localhost:3001 |
| API health | http://localhost:3001/health |

## Development Accounts

Password for all accounts: `DevPassword123!`

| Role | Email |
|------|-------|
| Super Admin | superadmin@games.local |
| Admin | admin@games.local |
| Player | player1@games.local |

## Key Features

- **Modular monorepo** — frontend, admin, API, shared packages
- **Game plugin system** — `@games/game-engine` with `GameDefinition` interface
- **Server-authoritative** — all game state & wallet changes on the server
- **Wallet system** — balance, available, locked, transactions, sandbox mode
- **RBAC** — USER, ADMIN, SUPER_ADMIN roles
- **Realtime ready** — Socket.io with room/session/event handlers
- **Audit logging** — all privileged admin actions logged
- **Idempotency** — financial operations support idempotency keys
- **Rate limiting** — global, auth, wallet, financial tiers

## Wallet Sandbox Mode

When `WALLET_SANDBOX_MODE=true` (default in development):

- `POST /api/wallet/sandbox/credit` — add test balance (players)
- `POST /api/admin/wallet/sandbox-credit` — admin credit any user

**Never enable sandbox mode in production.**

## Adding a New Game

1. Create a game module implementing `GameDefinition` in a new package or `apps/api/src/games/`
2. Register the plugin: `gameRegistry.register({ definition: myGame })`
3. Add catalog entry via seed or admin

No dice-specific logic lives in the platform core.

## Database Commands

```bash
npm run db:migrate      # Apply migrations
npm run db:seed         # Seed dev data
npm run db:studio       # Open Prisma Studio
npm run db:reset        # Reset & re-seed (destructive)
```

## API Overview

```
POST   /api/auth/register|login|logout
GET    /api/auth/me
GET    /api/wallet
POST   /api/wallet/deposit|withdraw|sandbox/credit
GET    /api/games
GET    /api/rooms
POST   /api/sessions
GET    /api/admin/dashboard
...    /api/admin/*
```

WebSocket events: `room:join`, `session:join`, `game:action`, `game:result`, etc.
