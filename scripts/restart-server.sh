#!/bin/bash
# Local dev: kill node server processes, flush Redis, start API from repo root.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f "node.*server" 2>/dev/null || true
redis-cli FLUSHALL 2>/dev/null || echo "redis-cli not available or Redis not running — skipping FLUSHALL"
cd "$ROOT/server" && npm run dev
