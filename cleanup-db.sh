#!/bin/bash

# Database cleanup script for BUX Spades testing
# Deletes all games, bots, and related data from the database

echo "🧹 Starting database cleanup..."

# Database connection string
DB_URL="postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-withered-fire-ab21hp42-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require"

# Delete in order to respect foreign key constraints
echo "🗑️  Deleting cards..."
psql "$DB_URL" -c "DELETE FROM \"Card\";" 2>/dev/null || echo "No cards to delete"

echo "🗑️  Deleting tricks..."
psql "$DB_URL" -c "DELETE FROM \"Trick\";" 2>/dev/null || echo "No tricks to delete"

echo "🗑️  Deleting round bids..."
psql "$DB_URL" -c "DELETE FROM \"RoundBid\";" 2>/dev/null || echo "No round bids to delete"

echo "🗑️  Deleting player trick counts..."
psql "$DB_URL" -c "DELETE FROM \"PlayerTrickCount\";" 2>/dev/null || echo "No player trick counts to delete"

echo "🗑️  Deleting rounds..."
psql "$DB_URL" -c "DELETE FROM \"Round\";" 2>/dev/null || echo "No rounds to delete"

echo "🗑️  Deleting game players..."
psql "$DB_URL" -c "DELETE FROM \"GamePlayer\";" 2>/dev/null || echo "No game players to delete"

echo "🗑️  Deleting game scores..."
psql "$DB_URL" -c "DELETE FROM \"GameScore\";" 2>/dev/null || echo "No game scores to delete"

echo "🗑️  Deleting game results..."
psql "$DB_URL" -c "DELETE FROM \"GameResult\";" 2>/dev/null || echo "No game results to delete"

echo "🗑️  Deleting games..."
psql "$DB_URL" -c "DELETE FROM \"Game\";" 2>/dev/null || echo "No games to delete"

echo "🗑️  Deleting bot users..."
psql "$DB_URL" -c "DELETE FROM \"User\" WHERE id LIKE 'bot-%';" 2>/dev/null || echo "No bot users to delete"

echo "✅ Database cleanup complete!"
echo "🎮 Ready for testing!"
