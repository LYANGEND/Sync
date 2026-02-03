#!/bin/bash

# Analyze nginx configuration to understand routing

echo "=========================================="
echo "Nginx Configuration Analysis"
echo "=========================================="
echo ""

echo "1. System Nginx Configuration:"
echo "------------------------------"
echo "Active sites in /etc/nginx/sites-enabled:"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null | grep -v "^total" | grep -v "^d"

echo ""
echo "Checking sync-mt configuration..."
if [ -f "/etc/nginx/sites-available/sync-mt" ]; then
    echo "✅ /etc/nginx/sites-available/sync-mt exists"
    
    echo ""
    echo "Server names configured:"
    grep "server_name" /etc/nginx/sites-available/sync-mt | sed 's/^/  /'
    
    echo ""
    echo "Proxy pass targets:"
    grep "proxy_pass" /etc/nginx/sites-available/sync-mt | sed 's/^/  /'
else
    echo "❌ /etc/nginx/sites-available/sync-mt not found"
fi

echo ""
echo "Checking if sync-mt is enabled..."
if [ -L "/etc/nginx/sites-enabled/sync-mt" ]; then
    echo "✅ sync-mt is enabled (symlinked)"
else
    echo "⚠️  sync-mt is NOT enabled"
    echo "To enable: sudo ln -s /etc/nginx/sites-available/sync-mt /etc/nginx/sites-enabled/"
fi

echo ""
echo ""
echo "2. Docker Nginx Configuration:"
echo "------------------------------"
echo "Checking Docker nginx container..."
if docker ps --format '{{.Names}}' | grep -q "^sync_mt_nginx$"; then
    echo "✅ sync_mt_nginx container is running"
    
    echo ""
    echo "Port mappings:"
    docker port sync_mt_nginx
    
    echo ""
    echo "Upstream servers configured in Docker nginx:"
    docker exec sync_mt_nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep -A1 "upstream" | head -20
    
    echo ""
    echo "Server blocks in Docker nginx:"
    docker exec sync_mt_nginx cat /etc/nginx/nginx.conf 2>/dev/null | grep "server_name" | sed 's/^/  /'
else
    echo "❌ sync_mt_nginx container is not running"
fi

echo ""
echo ""
echo "3. Current Routing Flow:"
echo "------------------------"
echo ""
echo "Based on your configuration:"
echo ""
echo "Internet Request"
echo "       ↓"
echo "  [Port 80/443]"
echo "       ↓"
echo "  System Nginx (/etc/nginx)"
echo "       ↓"
echo "  Checks server_name:"
echo "    - bwangubwangu.net → proxy to localhost:4003 (frontend)"
echo "    - *.bwangubwangu.net → proxy to localhost:4003 (frontend)"
echo "    - /api/ → proxy to localhost:4002 (backend)"
echo "       ↓"
echo "  Docker Containers"
echo "    - sync_mt_nginx (internal router)"
echo "    - sync_mt_backend:3000"
echo "    - sync_mt_frontend:80"
echo "    - sync_mt_website:80"
echo ""

echo ""
echo "4. Port Status Check:"
echo "--------------------"
echo "Checking what's listening on key ports..."
echo ""

for port in 80 443 4002 4003 5080 5443; do
    PROCESS=$(sudo netstat -tulpn 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f2 | head -1)
    if [ -n "$PROCESS" ]; then
        echo "Port $port: ✅ $PROCESS"
    else
        echo "Port $port: ❌ Nothing listening"
    fi
done

echo ""
echo ""
echo "5. Testing Current Setup:"
echo "------------------------"

# Test if ports 4002 and 4003 are accessible
echo ""
echo "Testing localhost:4002 (backend expected by system nginx)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4002/api/health 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Backend accessible on port 4002 (HTTP $RESPONSE)"
else
    echo "❌ Backend NOT accessible on port 4002 (HTTP $RESPONSE)"
    echo "   System nginx expects backend here!"
fi

echo ""
echo "Testing localhost:4003 (frontend expected by system nginx)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4003/ 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Frontend accessible on port 4003 (HTTP $RESPONSE)"
else
    echo "❌ Frontend NOT accessible on port 4003 (HTTP $RESPONSE)"
    echo "   System nginx expects frontend here!"
fi

echo ""
echo "Testing localhost:5080 (Docker nginx)..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5080/ 2>/dev/null)
if [ "$RESPONSE" = "200" ]; then
    echo "✅ Docker nginx accessible on port 5080 (HTTP $RESPONSE)"
else
    echo "❌ Docker nginx NOT accessible on port 5080 (HTTP $RESPONSE)"
fi

echo ""
echo ""
echo "=========================================="
echo "DIAGNOSIS"
echo "=========================================="
echo ""

# Check if the mismatch exists
BACKEND_4002=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4002/api/health 2>/dev/null)
FRONTEND_4003=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4003/ 2>/dev/null)
DOCKER_5080=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5080/ 2>/dev/null)

if [ "$BACKEND_4002" != "200" ] || [ "$FRONTEND_4003" != "200" ]; then
    echo "⚠️  PORT MISMATCH DETECTED!"
    echo ""
    echo "Your system nginx expects:"
    echo "  - Backend on localhost:4002"
    echo "  - Frontend on localhost:4003"
    echo ""
    echo "But these ports are not responding."
    echo ""
    echo "Your Docker containers are likely on different ports."
    echo ""
    echo "SOLUTIONS:"
    echo ""
    echo "Option 1: Update docker-compose.prod.yml to expose correct ports"
    echo "  Add to backend service:"
    echo "    ports:"
    echo "      - \"4002:3000\""
    echo ""
    echo "  Add to frontend service:"
    echo "    ports:"
    echo "      - \"4003:80\""
    echo ""
    echo "Option 2: Update system nginx to use Docker nginx"
    echo "  Change proxy_pass in /etc/nginx/sites-available/sync-mt:"
    echo "    location / {"
    echo "      proxy_pass http://localhost:5080;"
    echo "    }"
    echo ""
    echo "Option 3: Use Docker nginx only (recommended)"
    echo "  1. sudo systemctl stop nginx"
    echo "  2. Update docker-compose.prod.yml nginx ports to \"80:80\""
    echo "  3. docker compose -f docker-compose.prod.yml up -d"
    echo ""
else
    echo "✅ Port configuration looks correct!"
    echo ""
    echo "If you're still seeing 404 errors, check:"
    echo "1. DNS configuration"
    echo "2. Firewall rules"
    echo "3. Backend logs: docker logs sync_mt_backend"
fi

echo ""
