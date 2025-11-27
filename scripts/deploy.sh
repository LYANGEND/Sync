#!/bin/bash

# Sync School Management System - Deployment Script
# Run this on your Azure VM after cloning the repo

set -e

echo "🚀 Starting Sync deployment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Creating from example..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your production values, then run this script again."
    exit 1
fi

# Build and start containers
echo "📦 Building Docker images..."
docker compose -f docker-compose.prod.yml build

echo "🗄️  Starting database..."
docker compose -f docker-compose.prod.yml up -d postgres

echo "⏳ Waiting for database to be ready..."
sleep 10

echo "🔄 Running database migrations..."
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

echo "🌱 Seeding database (optional - comment out if not needed)..."
docker compose -f docker-compose.prod.yml run --rm backend npx prisma db seed

echo "🚀 Starting all services..."
docker compose -f docker-compose.prod.yml up -d

echo "✅ Deployment complete!"
echo ""
echo "📊 Check status with: docker compose -f docker-compose.prod.yml ps"
echo "📜 View logs with: docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "🌐 Your app should be available at http://YOUR_VM_IP"
