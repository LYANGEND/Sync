#!/bin/bash

# Quick Fix Script for SYNC Deployment 404 Error
# This implements Solution A from DEPLOYMENT_FIX.md

set -e  # Exit on error

echo "=========================================="
echo "SYNC Deployment Quick Fix"
echo "Solution A: Docker Nginx Only"
echo "=========================================="
echo ""

# Check if running in project directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found"
    if [ -f ".env.production.example" ]; then
        echo "Creating .env from .env.production.example..."
        cp .env.production.example .env
        echo "✅ .env created - PLEASE EDIT IT WITH YOUR ACTUAL VALUES"
        echo ""
        echo "Required values to set:"
        echo "  - POSTGRES_HOST"
        echo "  - POSTGRES_PASSWORD"
        echo "  - REDIS_PASSWORD"
        echo "  - JWT_SECRET (min 32 characters)"
        echo ""
        read -p "Press Enter after you've edited .env, or Ctrl+C to exit..."
    else
        echo "❌ .env.production.example not found"
        exit 1
    fi
fi

echo "Step 1: Stopping system nginx..."
if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet nginx; then
        echo "Stopping nginx..."
        sudo systemctl stop nginx
        sudo systemctl disable nginx
        echo "✅ System nginx stopped and disabled"
    else
        echo "ℹ️  System nginx is not running"
    fi
else
    echo "⚠️  systemctl not available - please stop nginx manually"
fi
echo ""

echo "Step 2: Backing up docker-compose.prod.yml..."
cp docker-compose.prod.yml docker-compose.prod.yml.backup
echo "✅ Backup created: docker-compose.prod.yml.backup"
echo ""

echo "Step 3: Updating docker-compose.prod.yml ports..."
# Update nginx ports from 5080:80 to 80:80 and 5443:443 to 443:443
sed -i.tmp 's/"5080:80"/"80:80"/g' docker-compose.prod.yml
sed -i.tmp 's/"5443:443"/"443:443"/g' docker-compose.prod.yml
rm -f docker-compose.prod.yml.tmp
echo "✅ Ports updated"
echo ""

echo "Step 4: Stopping existing containers..."
docker compose -f docker-compose.prod.yml down 2>/dev/null || docker-compose -f docker-compose.prod.yml down 2>/dev/null || echo "No containers to stop"
echo ""

echo "Step 5: Pulling latest images..."
docker compose -f docker-compose.prod.yml pull || docker-compose -f docker-compose.prod.yml pull
echo ""

echo "Step 6: Starting containers..."
docker compose -f docker-compose.prod.yml up -d || docker-compose -f docker-compose.prod.yml up -d
echo ""

echo "Step 7: Waiting for containers to be healthy..."
sleep 10
echo ""

echo "Step 8: Checking container status..."
docker ps --filter "name=sync_mt" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "Step 9: Testing endpoints..."
echo ""
echo "Testing root endpoint..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost/ || echo "Failed"

echo "Testing API health..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost/api/health || echo "Failed"
echo ""

echo "Step 10: Checking logs for errors..."
echo ""
echo "--- Nginx Logs (last 5 lines) ---"
docker logs --tail 5 sync_mt_nginx 2>&1

echo ""
echo "--- Backend Logs (last 5 lines) ---"
docker logs --tail 5 sync_mt_backend 2>&1

echo ""
echo "--- Frontend Logs (last 5 lines) ---"
docker logs --tail 5 sync_mt_frontend 2>&1

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "✅ If you see HTTP Status: 200 above, your deployment is working!"
echo ""
echo "Next steps:"
echo "1. Test in browser: http://your-server-ip/"
echo "2. Configure DNS to point to your server"
echo "3. Set up SSL certificates (Let's Encrypt)"
echo "4. Run database migrations:"
echo "   docker exec sync_mt_backend npm run migrate"
echo ""
echo "If you still see 404 errors:"
echo "1. Check container logs: docker logs sync_mt_nginx"
echo "2. Verify .env configuration"
echo "3. Check DEPLOYMENT_FIX.md for alternative solutions"
echo ""
