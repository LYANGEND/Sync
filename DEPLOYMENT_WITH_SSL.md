# Deployment Guide with SSL for sync.livingii.com

## 🚀 Automated Deployment with GitHub Actions

### Prerequisites

1. **GitHub Repository Secrets** - Add these in GitHub Settings → Secrets and variables → Actions:

```
SSH_PRIVATE_KEY          # Content of misheck12.pem file
DATABASE_URL             # postgresql://sync_user:sync_password@postgres:5432/sync_db?schema=public
JWT_SECRET               # Your JWT secret key
AZURE_OPENAI_API_KEY     # From Azure Portal
AZURE_OPENAI_ENDPOINT    # https://sync-openai-zambia.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME      # gpt-4o
AZURE_OPENAI_WHISPER_DEPLOYMENT   # whisper
AZURE_OPENAI_TTS_DEPLOYMENT       # tts
```

### One-Time SSL Setup on Server

**Run this ONCE on your server:**

```bash
# SSH into your server
ssh -i C:\Users\USSER\Downloads\misheck12.pem Misheck@102.37.128.242

# Download the SSL setup script
cd ~
curl -O https://raw.githubusercontent.com/your-repo/main/scripts/setup-ssl.sh
chmod +x setup-ssl.sh

# Run the SSL setup (requires sudo)
sudo ./setup-ssl.sh
```

This script will:
- Install certbot
- Stop any services on port 80
- Obtain SSL certificate for sync.livingii.com
- Set up auto-renewal cron job

### Automated Deployment

After SSL is set up, every push to `main` branch will automatically:

1. ✅ Deploy code to server
2. ✅ Build Docker containers
3. ✅ Run database migrations
4. ✅ Restart services with zero downtime

**To deploy manually:**

```bash
# In GitHub, go to Actions → Deploy to Production → Run workflow
```

---

## 📋 Manual Deployment (Alternative)

If you prefer manual deployment:

### Step 1: Copy Files to Server

From your local machine (PowerShell):

```powershell
# Set variables
$KEY = "C:\Users\USSER\Downloads\misheck12.pem"
$SERVER = "Misheck@102.37.128.242"

# Copy backend
scp -i $KEY -r backend $SERVER`:~/app/

# Copy frontend
scp -i $KEY -r frontend $SERVER`:~/app/

# Copy nginx config
scp -i $KEY -r nginx $SERVER`:~/app/

# Copy docker-compose
scp -i $KEY docker-compose.prod.yml $SERVER`:~/app/
```

### Step 2: Setup SSL (One-Time)

On your server:

```bash
cd ~/app

# Stop any running services
docker-compose -f docker-compose.prod.yml down

# Obtain SSL certificate
sudo certbot certonly --standalone -d sync.livingii.com --email misheck@livingii.com --agree-tos

# Verify certificate
sudo certbot certificates
```

### Step 3: Deploy Application

```bash
cd ~/app

# Create backend .env file
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql://sync_user:sync_password@postgres:5432/sync_db?schema=public
PORT=3000
JWT_SECRET=your-secret-key-here
NODE_ENV=production
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://sync-openai-zambia.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper
AZURE_OPENAI_TTS_DEPLOYMENT=tts
EOF

# Build and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Run database migrations
docker exec sync_backend npx prisma migrate deploy

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Step 4: Verify Deployment

```bash
# Check if services are running
docker ps

# Check nginx logs
docker logs sync_nginx

# Test HTTPS
curl -I https://sync.livingii.com

# Test backend API
curl https://sync.livingii.com/api/health
```

---

## 🔧 Troubleshooting

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# View certificate files
sudo ls -la /etc/letsencrypt/live/sync.livingii.com/
```

### Container Issues

```bash
# View all containers
docker ps -a

# View logs
docker logs sync_nginx
docker logs sync_backend
docker logs sync_frontend

# Restart specific service
docker-compose -f docker-compose.prod.yml restart nginx

# Rebuild everything
docker-compose -f docker-compose.prod.yml up -d --build --force-recreate
```

### Port Issues

```bash
# Check what's using port 80
sudo lsof -i :80

# Check what's using port 443
sudo lsof -i :443

# Kill process if needed
sudo kill <PID>
```

### DNS Issues

```bash
# Check DNS resolution
nslookup sync.livingii.com

# Should return: 102.37.128.242
```

---

## 🔄 Updates and Maintenance

### Update Application Code

**With GitHub Actions:**
```bash
git add .
git commit -m "Update feature"
git push origin main
# Automatically deploys!
```

**Manual:**
```bash
# On server
cd ~/app
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

### Renew SSL Certificate

Certificates auto-renew via cron job. To manually renew:

```bash
sudo certbot renew
docker restart sync_nginx
```

### Database Backup

```bash
# Backup database
docker exec sync_postgres pg_dump -U sync_user sync_db > backup_$(date +%Y%m%d).sql

# Restore database
docker exec -i sync_postgres psql -U sync_user sync_db < backup_20241209.sql
```

---

## 📊 Monitoring

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker logs -f sync_nginx
docker logs -f sync_backend

# Last 100 lines
docker logs --tail 100 sync_backend
```

### Check Resource Usage

```bash
# Container stats
docker stats

# Disk usage
df -h

# Docker disk usage
docker system df
```

---

## 🎯 Quick Commands Reference

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Restart specific service
docker-compose -f docker-compose.prod.yml restart nginx

# View status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Clean up
docker system prune -a
```

---

## ✅ Deployment Checklist

- [ ] DNS points to 102.37.128.242
- [ ] SSL certificate obtained
- [ ] GitHub secrets configured
- [ ] Backend .env file created
- [ ] Docker containers running
- [ ] Database migrations applied
- [ ] HTTPS working (https://sync.livingii.com)
- [ ] Backend API responding
- [ ] Frontend loading
- [ ] Auto-renewal cron job set up

---

## 🆘 Support

**Issues?**
1. Check container logs: `docker logs sync_nginx`
2. Verify SSL: `sudo certbot certificates`
3. Test DNS: `nslookup sync.livingii.com`
4. Check ports: `sudo lsof -i :80` and `sudo lsof -i :443`

**Need help?** Open a GitHub issue with:
- Error messages
- Container logs
- Output of `docker ps`
