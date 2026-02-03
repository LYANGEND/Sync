#!/bin/bash

echo "=========================================="
echo "Rebuild Frontend Container"
echo "=========================================="
echo ""

cd ~/app-mt || exit 1

echo "Step 1: Checking current frontend status..."
docker exec sync_mt_frontend ls -la /usr/share/nginx/html/assets/ 2>/dev/null | head -5 || echo "Assets directory not found or empty"
echo ""

echo "Step 2: Stopping frontend container..."
docker compose -f docker-compose.prod.yml stop frontend
echo ""

echo "Step 3: Removing old frontend container and image..."
docker compose -f docker-compose.prod.yml rm -f frontend
docker rmi sync-frontend 2>/dev/null || echo "Local image not found"
echo ""

echo "Step 4: Building frontend locally..."
echo "This will take a few minutes..."
echo ""

# Build with proper API URL
docker compose -f docker-compose.prod.yml build --no-cache frontend

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build failed!"
    echo ""
    echo "Possible issues:"
    echo "1. Missing dependencies in frontend/"
    echo "2. Build errors in TypeScript/React code"
    echo "3. Out of disk space"
    echo ""
    echo "Check build logs above for errors"
    exit 1
fi

echo ""
echo "✅ Build completed successfully"
echo ""

echo "Step 5: Starting new frontend container..."
docker compose -f docker-compose.prod.yml up -d frontend
echo ""

echo "Step 6: Waiting for container to be ready..."
sleep 5
echo ""

echo "Step 7: Verifying assets..."
echo "Files in /usr/share/nginx/html:"
docker exec sync_mt_frontend ls -la /usr/share/nginx/html/
echo ""

echo "Files in assets directory:"
docker exec sync_mt_frontend ls -la /usr/share/nginx/html/assets/ 2>/dev/null | head -10 || echo "❌ Assets directory not found!"
echo ""

echo "Step 8: Testing frontend..."
echo ""

# Test from inside container
echo "Testing from inside container:"
RESPONSE=$(docker exec sync_mt_frontend wget -q -O /dev/null -S http://localhost:80/ 2>&1 | grep "HTTP/" | awk '{print $2}')
echo "  HTML page: HTTP $RESPONSE"

# Get asset path from HTML
ASSET_PATH=$(docker exec sync_mt_frontend sh -c "cat /usr/share/nginx/html/index.html | grep -o 'assets/index-[^\"]*\.js' | head -1")
if [ -n "$ASSET_PATH" ]; then
    echo "  Found asset: $ASSET_PATH"
    ASSET_RESPONSE=$(docker exec sync_mt_frontend wget -q -O /dev/null -S http://localhost:80/$ASSET_PATH 2>&1 | grep "HTTP/" | awk '{print $2}')
    echo "  Asset file: HTTP $ASSET_RESPONSE"
    
    if [ "$ASSET_RESPONSE" = "200" ]; then
        echo "  ✅ Assets are accessible!"
    else
        echo "  ❌ Assets returned HTTP $ASSET_RESPONSE"
    fi
else
    echo "  ❌ Could not find asset path in HTML"
fi

echo ""

# Test from host
echo "Testing from host (via Docker nginx on port 5080):"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ops.bwangubwangu.net" http://localhost:5080/)
echo "  HTML page: HTTP $RESPONSE"

if [ -n "$ASSET_PATH" ]; then
    ASSET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ops.bwangubwangu.net" http://localhost:5080/$ASSET_PATH)
    echo "  Asset file: HTTP $ASSET_RESPONSE"
    
    if [ "$ASSET_RESPONSE" = "200" ]; then
        echo "  ✅ Assets accessible via Docker nginx!"
    else
        echo "  ❌ Assets returned HTTP $ASSET_RESPONSE via Docker nginx"
    fi
fi

echo ""

# Test via system nginx
echo "Testing via system nginx (port 80):"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ops.bwangubwangu.net" http://localhost/)
echo "  HTML page: HTTP $RESPONSE"

if [ -n "$ASSET_PATH" ]; then
    ASSET_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ops.bwangubwangu.net" http://localhost/$ASSET_PATH)
    echo "  Asset file: HTTP $ASSET_RESPONSE"
    
    if [ "$ASSET_RESPONSE" = "200" ]; then
        echo "  ✅ Assets accessible via system nginx!"
    else
        echo "  ❌ Assets returned HTTP $ASSET_RESPONSE via system nginx"
    fi
fi

echo ""
echo "=========================================="
echo "REBUILD COMPLETE"
echo "=========================================="
echo ""

# Final check
if docker exec sync_mt_frontend test -d /usr/share/nginx/html/assets; then
    ASSET_COUNT=$(docker exec sync_mt_frontend sh -c "ls /usr/share/nginx/html/assets/*.js 2>/dev/null | wc -l")
    if [ "$ASSET_COUNT" -gt 0 ]; then
        echo "✅ SUCCESS! Frontend rebuilt with $ASSET_COUNT JS files"
        echo ""
        echo "Test in browser:"
        echo "  http://ops.bwangubwangu.net"
        echo "  http://bwangubwangu.net"
    else
        echo "⚠️  Assets directory exists but no JS files found"
        echo "Check build logs above for errors"
    fi
else
    echo "❌ Assets directory still not found after rebuild"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if build completed: docker logs sync_mt_frontend"
    echo "2. Verify Dockerfile: cat frontend/Dockerfile"
    echo "3. Try building manually:"
    echo "   cd frontend"
    echo "   npm install"
    echo "   npm run build"
    echo "   ls -la dist/"
fi

echo ""
