#!/bin/bash
# One-command fix for deployment 404 issue
# This exposes backend on 4002 and frontend on 4003 as expected by system nginx

cd ~/app-mt || exit 1

# Create override file
cat > docker-compose.ports-fix.yml << 'EOF'
version: '3.8'
services:
  backend:
    ports:
      - "4002:3000"
  frontend:
    ports:
      - "4003:80"
EOF

# Restart with new ports
docker compose -f docker-compose.prod.yml -f docker-compose.ports-fix.yml up -d

# Wait and test
sleep 10
echo ""
echo "Testing..."
curl -s -o /dev/null -w "Backend (4002): HTTP %{http_code}\n" http://localhost:4002/api/health
curl -s -o /dev/null -w "Frontend (4003): HTTP %{http_code}\n" http://localhost:4003/
curl -s -o /dev/null -w "Via Nginx: HTTP %{http_code}\n" http://localhost/
echo ""
echo "If all show HTTP 200, you're good! Test in browser: http://bwangubwangu.net"
