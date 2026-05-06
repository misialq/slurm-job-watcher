#!/bin/bash

# Slurm Job Watcher - Launch Script
# This script prepares and starts the application using your local Node.js environment.

set -e

echo "--- Slurm Job Watcher ---"

# 1. Install dependencies if node_modules don't exist
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install --production && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# 2. Build the frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "Building frontend assets..."
    cd frontend && npm run build && cd ..
fi

# 3. Start the application
echo "Starting application on http://localhost:3001"
echo "Press Ctrl+C to stop"
cd backend && node index.js
