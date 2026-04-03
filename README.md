# BUX Spades

Multiplayer Spades with real-time play, lobby, chat, and configurable rules. **Web** (Vite + React) and **mobile** (Capacitor) clients talk to a **Node** API with **Socket.IO**, **PostgreSQL** (Prisma), and **Redis**.

## Repository layout

```
bux-spades/
├── client/           # React + TypeScript (Vite). Primary UI.
├── server/           # Express + Socket.IO (JavaScript, Prisma schema in server/prisma).
├── scripts/          # Dev helpers, DB smoke tests, one-off maintenance (see scripts/README.md).
├── docs/             # Design notes, deploy guides, archived fix write-ups (docs/archive/).
├── redis/            # Local Redis config (if used).
├── migrations/       # Legacy / auxiliary SQL (prefer Prisma migrations under server/prisma).
└── vercel.json       # Frontend hosting config (typical setup: API elsewhere, client on Vercel).
```

There is **no** shared `shared/` package in this repo; types live in `client` (and server uses its own modules).

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** (or compatible host for Prisma)
- **Redis** (for game cache / sessions — match `server/.env`)
- **Optional:** [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) (`flyctl`) for `npm run deploy:server`
- **Optional:** Discord / Facebook app credentials for OAuth (see server auth routes)

## Quick start (local)

1. **Install**

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. **Environment**

   - Copy and fill env files for `server/` and `client/` (see any `.env.example` in those folders if present).
   - Server needs at least `DATABASE_URL`, JWT/session secrets, and Redis URL as required by `server/src/config`.

3. **Database**

   ```bash
   cd server
   npx prisma migrate dev
   ```

4. **Run API + web**

   From the **repo root**:

   ```bash
   npm run dev
   ```

   - API: `http://localhost:3000` (per `server` scripts)
   - Web: `http://localhost:5173` (Vite default)

   The script clears listeners on ports **3000** and **5173** before starting.

## Root `package.json` scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` / `start` | `./scripts/start-dev.sh` — both servers |
| `npm run deploy:server` | `flyctl deploy` for `bux-spades-server` (requires CLI + auth) |
| `npm run script:db:test` | Prisma connectivity smoke test |
| `npm run script:db:cleanup` | **Destructive** DB wipe helper (`DATABASE_URL` + `YES` confirmation) |
| `npm run script:server:restart` | Kill node server pattern, Redis flush, `server` dev |
| `cap:*`, `apk:*`, `ios:*` | Capacitor / mobile build helpers (see `client/` docs) |

More detail: [`scripts/README.md`](scripts/README.md).

## Documentation

| Doc | Topic |
|-----|--------|
| [`docs/DEPLOY_APP_STORES.md`](docs/DEPLOY_APP_STORES.md) | App store / mobile release notes |
| [`client/CAPACITOR_SETUP.md`](client/CAPACITOR_SETUP.md), [`client/MOBILE_SETUP.md`](client/MOBILE_SETUP.md) | Mobile tooling |
| [`server/ARCHITECTURE.md`](server/ARCHITECTURE.md) | Server-oriented overview |
| [`docs/archive/`](docs/archive/) | Old bug-fix write-ups (historical) |

## Tech stack (accurate to this repo)

**Client:** React 18, TypeScript, Vite, Tailwind, React Router, Redux Toolkit (where used), Socket.IO client, Capacitor for native shells.

**Server:** Node, Express, Socket.IO, Prisma → PostgreSQL, Redis, Passport (Discord/Facebook/etc. as configured). Main source is **JavaScript** (`server/src/**/*.js`); `npm run build` in server runs `tsc` if you add TS tooling.

## Game features (summary)

- Partners and solo modes, multiple bidding variants (regular, whiz, mirror, gimmicks), nil / blind nil where rules allow.
- Real-time table, bidding, tricks, scoring; anti-cheat-oriented UX (e.g. face-down deal until it is your turn to bid).
- Lobby, in-game chat, profiles, stats (see DB schema and client routes for current scope).

## Contributing

Use feature branches and small PRs. Run client typecheck (`cd client && npx tsc --noEmit`) and server smoke tests after server changes when possible.

## License

No `LICENSE` file is present in this repository; treat usage as **all rights reserved** unless you add a license.
