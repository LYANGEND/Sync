#!/bin/bash

# Fix for current deployment setup
# This updates docker-compose.prod.yml to expose backend and frontend on ports 4002 and 4003

set -e

echo "=========================================="
echo "Fix Current Deployment Setup"
echo "Exposing containers on ports 4002 & 4003"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "Step 1: Backing up docker-compose.prod.yml..."
cp docker-compose.prod.yml docker-compose.prod.yml.backup-$(date +%Y%m%d-%H%M%S)
echo "✅ Backup created"
echo ""

echo "Step 2: Creating docker-compose.ports-fix.yml override..."
cat > docker-compose.ports-fix.yml << 'EOF'
# Override file to expose backend and frontend on ports expected by system nginx
version: '3.8'

services:
  backend:
    ports:
      - "4002:3000"  # Expose backend on port 4002 for system nginx

  frontend:
    ports:
      - "4003:80"    # Expose frontend on port 4003 for system nginx

  # Keep Docker nginx on different ports to avoid conflict
  nginx:
    ports:
      - "5080:80"
      - "5443:443"
EOF

echo "✅ Override file created"
echo ""

echo "Step 3: Stopping containers..."
docker compose -f docker-compose.prod.yml down
echo ""

echo "Step 4: Starting containers with new port configuration..."
docker compose -f docker-compose.prod.yml -f docker-compose.ports-fix.yml up -d
echo ""

echo "Step 5: Waiting for containers to start..."
sleep 10
echo ""

echo "Step 6: Checking container status..."
docker ps --filter "name=sync_mt" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "Step 7: Testing port accessibility..."
echo ""

echo "Testing backend on port 4002..."
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4002/api/health 2>/dev/null)
if [ "$BACKEND_RESPONSE" = "200" ]; then
    echo "✅ Backend accessible on port 4002 (HTTP $BACKEND_RESPONSE)"
else
    echo "⚠️  Backend returned HTTP $BACKEND_RESPONSE"
    echo "Checking backend logs..."
    docker logs --tail 10 sync_mt_backend
fi

echo ""
echo "Testing frontend on port 4003..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4003/ 2>/dev/null)
if [ "$FRONTEND_RESPONSE" = "200" ]; then
    echo "✅ Frontend accessible on port 4003 (HTTP $FRONTEND_RESPONSE)"
else
    echo "⚠️  Frontend returned HTTP $FRONTEND_RESPONSE"
fi

echo ""
echo "Testing through system nginx..."
NGINX_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
if [ "$NGINX_RESPONSE" = "200" ]; then
    echo "✅ System nginx routing working (HTTP $NGINX_RESPONSE)"
else
    echo "⚠️  System nginx returned HTTP $NGINX_RESPONSE"
fi

echo ""
echo "Testing API through system nginx..."
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null)
if [ "$API_RESPONSE" = "200" ]; then
    echo "✅ API routing working (HTTP $API_RESPONSE)"
else
    echo "⚠️  API returned HTTP $API_RESPONSE"
fi

echo ""
echo "=========================================="
echo "DEPLOYMENT STATUS"
echo "=========================================="
echo ""

if [ "$BACKEND_RESPONSE" = "200" ] && [ "$FRONTEND_RESPONSE" = "200" ] && [ "$NGINX_RESPONSE" = "200" ]; then
    echo "✅ SUCCESS! Your deployment is now working!"
    echo ""
    echo "Port configuration:"
    echo "  - Backend: localhost:4002 → sync_mt_backend:3000"
    echo "  - Frontend: localhost:4003 → sync_mt_frontend:80"
    echo "  - System Nginx: Port 80 → routes to 4002/4003"
    echo "  - Docker Nginx: Port 5080 (internal routing)"
    echo ""
    echo "Next steps:"
    echo "1. Test in browser: http://bwangubwangu.net"
    echo "2. Test subdomain: http://school1.bwangubwangu.net"
    echo "3. Run migrations: docker exec sync_mt_backend npm run migrate"
    echo "4. Check backend logs if you see errors: docker logs sync_mt_backend"
else
    echo "⚠️  Some services are not responding correctly"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check backend logs: docker logs sync_mt_backend"
    echo "2. Check frontend logs: docker logs sync_mt_frontend"
    echo "3. Verify .env configuration"
    echo "4. Check if database is accessible"
    echo ""
    echo "To see detailed logs:"
    echo "  docker logs sync_mt_backend --tail 50"
    echo "  docker logs sync_mt_frontend --tail 50"
fi

echo ""
echo "To restart with this configuration in the future:"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.ports-fix.yml up -d"
echo ""
