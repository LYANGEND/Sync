#!/bin/bash

# Deployment Diagnostic Script for SYNC
# Run this on your VM to diagnose the 404 issue

echo "=========================================="
echo "SYNC Deployment Diagnostic Tool"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Running as root - this is OK for diagnostics"
else 
    echo "ℹ️  Not running as root - some checks may require sudo"
fi
echo ""

# 1. Check Docker
echo "1. Checking Docker..."
if command -v docker &> /dev/null; then
    echo "✅ Docker is installed"
    docker --version
    echo ""
    echo "Running containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo "❌ Docker is not installed"
fi
echo ""

# 2. Check Docker Compose
echo "2. Checking Docker Compose..."
if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    echo "✅ Docker Compose is available"
    docker compose version 2>/dev/null || docker-compose version
else
    echo "❌ Docker Compose is not available"
fi
echo ""

# 3. Check System Nginx
echo "3. Checking System Nginx..."
if command -v nginx &> /dev/null; then
    echo "✅ System Nginx is installed"
    nginx -v 2>&1
    
    if systemctl is-active --quiet nginx; then
        echo "✅ Nginx is running"
    else
        echo "⚠️  Nginx is not running"
    fi
    
    echo ""
    echo "Nginx configuration test:"
    nginx -t 2>&1
else
    echo "❌ System Nginx is not installed"
fi
echo ""

# 4. Check Port Usage
echo "4. Checking Port Usage..."
echo "Ports 80, 443, 4002, 4003, 5080, 5443:"
if command -v netstat &> /dev/null; then
    netstat -tulpn 2>/dev/null | grep -E ':(80|443|4002|4003|5080|5443)' || echo "No processes found on these ports"
elif command -v ss &> /dev/null; then
    ss -tulpn 2>/dev/null | grep -E ':(80|443|4002|4003|5080|5443)' || echo "No processes found on these ports"
else
    echo "⚠️  Neither netstat nor ss available"
fi
echo ""

# 5. Check .env file
echo "5. Checking .env file..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    echo "Environment variables set:"
    grep -E '^[A-Z_]+=' .env | cut -d'=' -f1 | sed 's/^/  - /'
else
    echo "❌ .env file not found"
    if [ -f ".env.production.example" ]; then
        echo "ℹ️  .env.production.example exists - copy it to .env"
    fi
fi
echo ""

# 6. Check Docker Networks
echo "6. Checking Docker Networks..."
if command -v docker &> /dev/null; then
    echo "Docker networks:"
    docker network ls | grep sync || echo "No SYNC networks found"
fi
echo ""

# 7. Test Endpoints
echo "7. Testing Endpoints..."
echo "Testing localhost:80..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost/ 2>/dev/null || echo "Connection failed"

echo "Testing localhost:5080..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:5080/ 2>/dev/null || echo "Connection failed"

echo "Testing localhost:4002/api/health..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:4002/api/health 2>/dev/null || echo "Connection failed"

echo "Testing localhost:4003..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:4003/ 2>/dev/null || echo "Connection failed"
echo ""

# 8. Check DNS
echo "8. Checking DNS..."
if command -v nslookup &> /dev/null; then
    echo "Resolving bwangubwangu.net:"
    nslookup bwangubwangu.net 2>/dev/null | grep -A1 "Name:" || echo "DNS resolution failed"
elif command -v dig &> /dev/null; then
    echo "Resolving bwangubwangu.net:"
    dig +short bwangubwangu.net || echo "DNS resolution failed"
else
    echo "⚠️  No DNS tools available (nslookup/dig)"
fi
echo ""

# 9. Check Container Logs (if Docker is available)
echo "9. Checking Container Logs (last 10 lines)..."
if command -v docker &> /dev/null; then
    for container in sync_mt_nginx sync_mt_backend sync_mt_frontend; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo ""
            echo "--- ${container} ---"
            docker logs --tail 10 ${container} 2>&1
        fi
    done
else
    echo "Docker not available"
fi
echo ""

# 10. Summary
echo "=========================================="
echo "DIAGNOSTIC SUMMARY"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Review the output above"
echo "2. Check DEPLOYMENT_FIX.md for solutions"
echo "3. Verify your .env file is configured"
echo "4. Choose Solution A, B, or C from DEPLOYMENT_FIX.md"
echo ""
echo "Quick Fix (Solution A - Recommended):"
echo "  1. sudo systemctl stop nginx"
echo "  2. Edit docker-compose.prod.yml: change ports to '80:80' and '443:443'"
echo "  3. docker compose -f docker-compose.prod.yml up -d"
echo ""
