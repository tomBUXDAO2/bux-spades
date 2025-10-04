#!/bin/bash

# Start Redis locally for development
echo "Starting Redis for development..."

# Check if Redis is already running
if pgrep -x "redis-server" > /dev/null; then
    echo "Redis is already running"
else
    # Start Redis server
    redis-server --daemonize yes --port 6379
    echo "Redis started on port 6379"
fi

# Test Redis connection
redis-cli ping
