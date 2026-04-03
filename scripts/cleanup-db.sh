#!/bin/bash
# Destructive: wipes game-related tables. Requires psql and DATABASE_URL (same as server .env).
set -euo pipefail
DB_URL="${DATABASE_URL:?Set DATABASE_URL (e.g. export DATABASE_URL=... from server/.env)}"

echo "Database cleanup will use DATABASE_URL from your environment (not printed here)."

read -r -p "Type YES to delete game data: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Aborted."
  exit 1
fi

run_sql() {
  psql "$DB_URL" -c "$1" 2>/dev/null || true
}

echo "Deleting in FK-safe order..."
run_sql 'DELETE FROM "Card";'
run_sql 'DELETE FROM "Trick";'
run_sql 'DELETE FROM "RoundBid";'
run_sql 'DELETE FROM "PlayerTrickCount";'
run_sql 'DELETE FROM "Round";'
run_sql 'DELETE FROM "GamePlayer";'
run_sql 'DELETE FROM "GameScore";'
run_sql 'DELETE FROM "GameResult";'
run_sql 'DELETE FROM "Game";'
run_sql "DELETE FROM \"User\" WHERE id LIKE 'bot-%';"
echo "Done."
