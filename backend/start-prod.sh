#!/bin/bash
# Production startup script

echo "🚀 Starting Genrolly API in PRODUCTION mode..."

# Set environment
export ENV=production

# Start server with Gunicorn for production
# Using 4 workers (adjust based on your server capacity)
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-8000} \
  --access-logfile - \
  --error-logfile - \
  --log-level info
