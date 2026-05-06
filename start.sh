#!/bin/bash

# Start the backend in the background
echo "Starting backend..."
cd backend && node index.js &
BACKEND_PID=$!

# Start the frontend
echo "Starting frontend..."
cd frontend && npm run dev &
FRONTEND_PID=$!

# Handle shutdown
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

wait
