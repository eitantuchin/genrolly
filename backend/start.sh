#!/bin/bash
# Railway start script for Genrolly API

echo "🚀 Starting Genrolly API on Railway..."

# Install Python dependencies if needed
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
fi

# Check environment and run appropriate start script
if [ "$ENV" = "development" ] || [ "$RAILWAY_ENVIRONMENT" = "development" ]; then
    echo "Running in DEVELOPMENT mode..."
    exec ./start-dev.sh
else
    echo "Running in PRODUCTION mode..."
    exec ./start-prod.sh
fi