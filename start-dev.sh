#!/bin/bash

echo "🚀 Starting BUX Spades Development Servers..."
echo "=============================================="

# Kill any existing processes on ports 3000 and 5173
echo "🧹 Cleaning up existing processes..."
lsof -ti:3000,5173 | xargs kill -9 2>/dev/null || true
sleep 2

# Function to start server
start_server() {
    echo "🔧 Starting backend server on port 3000..."
    cd server && npm run dev &
    SERVER_PID=$!
    echo "Backend PID: $SERVER_PID"
}

# Function to start client
start_client() {
    echo "🎨 Starting frontend client on port 5173..."
    cd client && npm run dev &
    CLIENT_PID=$!
    echo "Frontend PID: $CLIENT_PID"
}

# Start both servers
start_server
start_client

echo ""
echo "✅ Both servers starting..."
echo "📡 Backend: http://localhost:3000"
echo "🎮 Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "=============================================="

# Wait for both processes
wait
