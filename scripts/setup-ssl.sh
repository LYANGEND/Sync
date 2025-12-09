#!/bin/bash

# SSL Setup Script for sync.livingii.com
# Run this ONCE on your server to obtain SSL certificate

set -e

echo "🔒 Setting up SSL for sync.livingii.com"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run with sudo: sudo ./setup-ssl.sh"
  exit 1
fi

# Install certbot if not installed
if ! command -v certbot &> /dev/null; then
  echo "📦 Installing certbot..."
  apt update
  apt install -y certbot
fi

# Stop any services using port 80
echo "🛑 Stopping services on port 80..."
cd ~/app
docker-compose -f docker-compose.prod.yml down || true

# Create certbot directory
mkdir -p /var/www/certbot

# Obtain certificate
echo "📜 Obtaining SSL certificate..."
certbot certonly --standalone \
  -d sync.livingii.com \
  --email misheck@livingii.com \
  --agree-tos \
  --no-eff-email \
  --non-interactive

# Verify certificate
echo "✅ Verifying certificate..."
certbot certificates

# Setup auto-renewal
echo "🔄 Setting up auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --deploy-hook 'docker restart sync_nginx'") | crontab -

echo ""
echo "✅ SSL Certificate obtained successfully!"
echo ""
echo "Certificate location: /etc/letsencrypt/live/sync.livingii.com/"
echo ""
echo "Next steps:"
echo "1. Start your application: cd ~/app && docker-compose -f docker-compose.prod.yml up -d"
echo "2. Test HTTPS: curl -I https://sync.livingii.com"
echo ""
echo "Auto-renewal is configured to run daily at 3 AM"
