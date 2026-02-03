#!/bin/bash

# Quick deployment status check script

echo "=========================================="
echo "SYNC Deployment Status Check"
echo "=========================================="
echo ""

echo "1. Docker Containers Status:"
echo "----------------------------"
docker ps --filter "name=sync_mt" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "2. Testing Internal Container Connectivity:"
echo "-------------------------------------------"

# Test if nginx can reach backend
echo "Testing nginx → backend connectivity..."
docker exec sync_mt_nginx wget -q -O- http://backend:3000/api/health 2>/dev/null && echo "✅ Backend reachable from nginx" || echo "❌ Backend NOT reachable from nginx"

# Test if nginx can reach frontend
echo "Testing nginx → frontend connectivity..."
docker exec sync_mt_nginx wget -q -O- http://frontend:80/ 2>/dev/null > /dev/null && echo "✅ Frontend reachable from nginx" || echo "❌ Frontend NOT reachable from nginx"

# Test if nginx can reach website
echo "Testing nginx → website connectivity..."
docker exec sync_mt_nginx wget -q -O- http://website:80/ 2>/dev/null > /dev/null && echo "✅ Website reachable from nginx" || echo "❌ Website NOT reachable from nginx"

echo ""

echo "3. Testing External Access (via system nginx):"
echo "----------------------------------------------"

# Test main domain
echo "Testing http://localhost/ (should route to website)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Main domain working (HTTP $RESPONSE)"
else
    echo "❌ Main domain failed (HTTP $RESPONSE)"
fi

# Test subdomain routing
echo "Testing subdomain routing (school1.bwangubwangu.net)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: school1.bwangubwangu.net" http://localhost/ 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Subdomain routing working (HTTP $RESPONSE)"
else
    echo "❌ Subdomain routing failed (HTTP $RESPONSE)"
fi

# Test API endpoint
echo "Testing API endpoint (/api/health)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: school1.bwangubwangu.net" http://localhost/api/health 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ API endpoint working (HTTP $RESPONSE)"
else
    echo "❌ API endpoint failed (HTTP $RESPONSE)"
fi

echo ""

echo "4. Recent Container Logs:"
echo "------------------------"

echo ""
echo "--- sync_mt_nginx (last 5 lines) ---"
docker logs --tail 5 sync_mt_nginx 2>&1 | grep -v "^$"

echo ""
echo "--- sync_mt_backend (last 5 lines) ---"
docker logs --tail 5 sync_mt_backend 2>&1 | grep -v "^$"

echo ""
echo "--- sync_mt_frontend (last 5 lines) ---"
docker logs --tail 5 sync_mt_frontend 2>&1 | grep -v "^$"

echo ""

echo "5. Port Bindings:"
echo "----------------"
echo "Docker nginx ports:"
docker port sync_mt_nginx 2>/dev/null || echo "Container not found"

echo ""

echo "6. Network Configuration:"
echo "------------------------"
docker network inspect sync_mt_external --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}' 2>/dev/null || echo "Network not found"

echo ""

echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo ""

# Count running containers
RUNNING=$(docker ps --filter "name=sync_mt" --format "{{.Names}}" | wc -l)
EXPECTED=5  # nginx, backend, frontend, website, redis

if [ "$RUNNING" -eq "$EXPECTED" ]; then
    echo "✅ All $EXPECTED containers are running"
else
    echo "⚠️  Only $RUNNING/$EXPECTED containers are running"
    echo "Missing containers:"
    for container in sync_mt_nginx sync_mt_backend sync_mt_frontend sync_mt_website sync_mt_redis; do
        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo "  - $container"
        fi
    done
fi

echo ""
echo "Next steps:"
echo "1. If all tests pass, your deployment is working!"
echo "2. Test from browser: http://bwangubwangu.net"
echo "3. Test subdomain: http://school1.bwangubwangu.net"
echo "4. If API fails, check backend logs: docker logs sync_mt_backend"
echo "5. Verify .env configuration, especially DATABASE_URL"
echo ""
