#!/bin/bash

# DataRheo Platform Setup Script
# This script sets up the development environment for the DataRheo platform

set -e

echo "🚀 Setting up DataRheo Platform..."

# Check for required tools
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running. Please start Docker Desktop from Applications."
    exit 1
fi

# Check for docker compose (V2) or docker-compose (V1)
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not available. Docker Desktop should include it automatically."
    echo "Please make sure Docker Desktop is running properly."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ All prerequisites are installed."

# Create environment files
echo "📝 Creating environment files..."

cd backend
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Backend .env file created from .env.example"
    echo "⚠️  Please update the .env file with your configuration before starting."
else
    echo "✅ Backend .env file already exists."
fi
cd ..

cd frontend
if [ ! -f .env.local ]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
    echo "✅ Frontend .env.local file created."
else
    echo "✅ Frontend .env.local file already exists."
fi
cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Generate Prisma client
echo "🔧 Generating Prisma client..."
cd backend
npx prisma generate
cd ..

# Build Docker images
echo "🐳 Building Docker images..."
docker compose -f docker/docker-compose.yml build

echo "✅ Setup complete!"
echo ""
echo "🎉 DataRheo Platform is ready to use!"
echo ""
echo "To start the platform, run:"
echo "  docker compose -f docker/docker-compose.yml up -d"
echo ""
echo "Then access the platform at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  Airflow: http://localhost:8080 (admin/admin)"
echo ""
echo "To start monitoring (optional):"
echo "  docker compose -f docker/docker-compose.monitoring.yml up -d"
echo "  Grafana: http://localhost:3001 (admin/admin)"
echo "  Prometheus: http://localhost:9090"
