# Scripts

Run from the **repository root** unless noted.

| Script | Purpose |
|--------|---------|
| `start-dev.sh` | Kills processes on ports 3000/5173, starts `server` and `client` dev servers. |
| `restart-server.sh` | Kills matching node server processes, `redis-cli FLUSHALL`, runs `server/npm run dev`. |
| `cleanup-db.sh` | **Destructive** — deletes game-related rows via `psql`. Requires `DATABASE_URL` and confirmation (`YES`). |
| `test-db-connection.js` | Smoke test Prisma DB connectivity (`node scripts/test-db-connection.js`). |
| `test-database-service.js` | Exercise database game service (`node scripts/test-database-service.js`). |
| `test-game-flow.js` | Socket/HTTP game flow smoke test (CommonJS; uses root `node_modules`). |
| `test-database-game-flow.js` | ESM database-first flow test. |
| `check-stuck-game.js` / `fix-stuck-game.js` | One-off maintenance against specific game IDs — review before running. |
| `delete-game.js` | Hard-coded game id delete helper — **edit or delete** before use. |

Obsolete one-off shell helpers live under `docs/archive/obsolete/`.
