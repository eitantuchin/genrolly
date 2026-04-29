#!/bin/bash
# Development startup script

echo "🚀 Starting Genrolly API in DEVELOPMENT mode..."

# Set environment
export ENV=development

# Start server with hot reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
