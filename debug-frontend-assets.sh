#!/bin/bash

echo "=========================================="
echo "Frontend Assets Debug"
echo "=========================================="
echo ""

echo "1. Checking frontend container status..."
if docker ps --format '{{.Names}}' | grep -q "^sync_mt_frontend$"; then
    echo "✅ sync_mt_frontend is running"
else
    echo "❌ sync_mt_frontend is NOT running"
    exit 1
fi
echo ""

echo "2. Checking files in /usr/share/nginx/html..."
echo "Directory listing:"
docker exec sync_mt_frontend ls -la /usr/share/nginx/html/
echo ""

echo "3. Checking assets directory..."
if docker exec sync_mt_frontend test -d /usr/share/nginx/html/assets; then
    echo "✅ assets directory exists"
    echo ""
    echo "Assets files:"
    docker exec sync_mt_frontend ls -la /usr/share/nginx/html/assets/ | head -20
else
    echo "❌ assets directory NOT found!"
    echo ""
    echo "This means the build didn't complete or files weren't copied correctly"
fi
echo ""

echo "4. Checking index.html content..."
echo "Looking for asset references in index.html:"
docker exec sync_mt_frontend cat /usr/share/nginx/html/index.html | grep -o 'assets/[^"]*' | head -5
echo ""

echo "5. Testing file access from inside container..."
ASSET_FILE=$(docker exec sync_mt_frontend sh -c "ls /usr/share/nginx/html/assets/*.js 2>/dev/null | head -1")
if [ -n "$ASSET_FILE" ]; then
    echo "Found asset file: $ASSET_FILE"
    echo "Testing if readable:"
    docker exec sync_mt_frontend test -r "$ASSET_FILE" && echo "✅ File is readable" || echo "❌ File is NOT readable"
    
    echo ""
    echo "File permissions:"
    docker exec sync_mt_frontend ls -la "$ASSET_FILE"
else
    echo "❌ No JS files found in assets directory!"
fi
echo ""

echo "6. Checking nginx configuration inside container..."
echo "Nginx config:"
docker exec sync_mt_frontend cat /etc/nginx/conf.d/default.conf | grep -A5 "location"
echo ""

echo "7. Testing nginx from inside container..."
echo "Testing localhost:80 from inside container:"
docker exec sync_mt_frontend wget -q -O- http://localhost:80/ | grep -o 'assets/[^"]*' | head -1
echo ""

echo "8. Checking nginx error logs..."
echo "Recent nginx errors:"
docker exec sync_mt_frontend cat /var/log/nginx/error.log 2>/dev/null | tail -10 || echo "No error log found"
echo ""

echo "9. Testing asset access from inside container..."
ASSET_PATH=$(docker exec sync_mt_frontend sh -c "cat /usr/share/nginx/html/index.html | grep -o 'assets/index-[^\"]*\.js' | head -1")
if [ -n "$ASSET_PATH" ]; then
    echo "Testing access to: /$ASSET_PATH"
    docker exec sync_mt_frontend wget -q -O /dev/null -S http://localhost:80/$ASSET_PATH 2>&1 | grep "HTTP/" || echo "Failed to access"
else
    echo "Could not find asset path in index.html"
fi
echo ""

echo "10. Checking Docker image build..."
echo "Frontend image details:"
docker images | grep sync.*frontend
echo ""

echo "=========================================="
echo "DIAGNOSIS"
echo "=========================================="
echo ""

# Check if assets exist
if docker exec sync_mt_frontend test -d /usr/share/nginx/html/assets; then
    ASSET_COUNT=$(docker exec sync_mt_frontend sh -c "ls /usr/share/nginx/html/assets/*.js 2>/dev/null | wc -l")
    if [ "$ASSET_COUNT" -gt 0 ]; then
        echo "✅ Assets directory exists with $ASSET_COUNT JS files"
        echo ""
        echo "Possible issues:"
        echo "1. Nginx routing problem (check location blocks)"
        echo "2. File permissions issue"
        echo "3. Docker nginx proxy issue"
        echo ""
        echo "Try accessing directly:"
        echo "  docker exec sync_mt_frontend wget -O- http://localhost:80/assets/index-*.js"
    else
        echo "❌ Assets directory exists but NO JS files found!"
        echo ""
        echo "SOLUTION: Rebuild the frontend image"
        echo "  cd ~/app-mt"
        echo "  docker compose -f docker-compose.prod.yml build frontend"
        echo "  docker compose -f docker-compose.prod.yml up -d frontend"
    fi
else
    echo "❌ Assets directory does NOT exist!"
    echo ""
    echo "SOLUTION: The build failed or dist folder wasn't copied"
    echo ""
    echo "Steps to fix:"
    echo "1. Check if frontend/dist exists locally:"
    echo "   ls -la frontend/dist/"
    echo ""
    echo "2. Rebuild the frontend image:"
    echo "   cd ~/app-mt"
    echo "   docker compose -f docker-compose.prod.yml build --no-cache frontend"
    echo "   docker compose -f docker-compose.prod.yml up -d frontend"
    echo ""
    echo "3. If using pre-built images, check the image:"
    echo "   docker pull ghcr.io/lyangend/sync/frontend:latest"
fi

echo ""
