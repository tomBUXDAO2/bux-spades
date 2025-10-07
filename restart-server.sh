#!/bin/bash

# Kill any existing node processes
pkill -f "node.*server"

# Clear Redis cache
redis-cli FLUSHALL

# Start the server
cd server && npm run dev
