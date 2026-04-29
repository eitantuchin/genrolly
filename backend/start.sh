#!/bin/bash
# Railway start script for Genrolly API

echo "🚀 Starting Genrolly API on Railway..."

# Install Python dependencies if needed
if [ -f requirements.txt ]; then
    pip install -r requirements.txt
fi

# Start server with Gunicorn
# Using 1 worker for Railway (adjust based on plan)
exec gunicorn app.main:app \
  --workers 1 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-8000} \
  --access-logfile - \
  --error-logfile - \
  --log-level info