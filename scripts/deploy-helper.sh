#!/bin/bash

# SYNC Multi-Tenant Deployment Helper
# Run this on the server to deploy the power branch

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Deployment Helper for Power Branch (Multi-Tenant)${NC}"

# 1. Check for Nginx Configuration
if [ ! -f "./nginx/nginx.conf" ]; then
    echo -e "${YELLOW}WARNING: nginx.conf not found in ./nginx/${NC}"
    echo -e "Creating directory and copying default configuration..."
    
    mkdir -p ./nginx
    
    # Create a basic nginx.conf if it doesn't exist
    # This should match the one in the repo
    cat > ./nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    upstream backend {
        server backend:3000;
    }
    
    upstream frontend {
        server frontend:80;
    }
    
    upstream website {
        server website:80;
    }
    
    server {
        listen 80;
        server_name localhost;
        
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        location /api/ {
            proxy_pass http://backend/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        location /health {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF
    echo -e "${GREEN}Created basic nginx.conf${NC}"
else
    echo -e "${GREEN}Found nginx/nginx.conf${NC}"
fi

# 2. Pull latest images
echo -e "${GREEN}Pulling latest images...${NC}"
docker compose -f docker-compose.prod.yml pull

# 3. Restart services
echo -e "${GREEN}Restarting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

# 4. Check status
echo -e "${GREEN}Deployment complete. Checking status...${NC}"
docker compose -f docker-compose.prod.yml ps

echo -e "${YELLOW}Wait a few seconds and run 'docker compose -f docker-compose.prod.yml logs nginx' if challenges persist.${NC}"
