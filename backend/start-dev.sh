#!/bin/bash
# Development startup script

echo "🚀 Starting Genrolly API in DEVELOPMENT mode..."

# Set environment
export ENV=development

# Start server with hot reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
