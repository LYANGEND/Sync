#!/usr/bin/env pwsh
# =============================================================
# Sync School Management System — Safe Update Deployment Script
# =============================================================
# PURPOSE: Build & push new Docker images, run safe DB migrations,
#          update container apps. NEVER touches infrastructure or
#          drops/resets the database.
#
# USAGE:
#   .\scripts\deploy.ps1              # auto-increments patch version
#   .\scripts\deploy.ps1 -Tag v2.4.0  # explicit version tag
#
# SAFE COMMANDS ONLY:
#   - prisma migrate deploy  (applies pending migrations, never resets)
#   - az containerapp update (swaps image, zero-downtime)
# =============================================================

param(
    [string]$Tag = "",
    [switch]$SkipMigrations,
    [switch]$BackendOnly,
    [switch]$FrontendOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Config ────────────────────────────────────────────────────
$ACR          = "syncprodacr.azurecr.io"
$RESOURCE_GROUP = "sync-rg"
$BACKEND_APP  = "sync-prod-backend"
$FRONTEND_APP = "sync-prod-frontend"
$ROOT         = Split-Path -Parent $PSScriptRoot

# ── Resolve version tag ───────────────────────────────────────
if (-not $Tag) {
    # Auto-detect latest tag from ACR and bump patch
    $latestTags = az acr repository show-tags --name syncprodacr --repository sync-backend --orderby time_desc --output tsv 2>$null
    $latestSemver = $latestTags | Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } | Select-Object -First 1
    if ($latestSemver -match '^v(\d+)\.(\d+)\.(\d+)$') {
        $major = [int]$Matches[1]
        $minor = [int]$Matches[2]
        $patch = [int]$Matches[3] + 1
        $Tag = "v${major}.${minor}.${patch}"
    } else {
        $Tag = "v1.0.0"
    }
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Sync — Safe Update Deployment              ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Tag:      $Tag" -ForegroundColor Cyan
Write-Host "║  ACR:      $ACR" -ForegroundColor Cyan
Write-Host "║  RG:       $RESOURCE_GROUP" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Pre-flight: verify Azure login ───────────────────────────
Write-Host "🔍 Verifying Azure login..." -ForegroundColor Yellow
$account = az account show --query "name" -o tsv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not logged in. Run: az login" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Logged in: $account" -ForegroundColor Green

# ── Pre-flight: verify Docker ─────────────────────────────────
Write-Host "🐳 Checking Docker..." -ForegroundColor Yellow
docker version --format "Client: {{.Client.Version}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Docker is running" -ForegroundColor Green

# ── Login to ACR ──────────────────────────────────────────────
Write-Host ""
Write-Host "1️⃣  Logging in to ACR..." -ForegroundColor Yellow
az acr login --name syncprodacr | Out-Null
Write-Host "   ✅ ACR login successful" -ForegroundColor Green

# ── Build & push backend ──────────────────────────────────────
if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "2️⃣  Building backend image ($Tag)..." -ForegroundColor Yellow
    Set-Location "$ROOT\backend"
    docker build `
        -t "${ACR}/sync-backend:${Tag}" `
        -t "${ACR}/sync-backend:latest" `
        . 2>&1 | Tee-Object -Variable buildOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Backend build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Backend built" -ForegroundColor Green

    Write-Host "   Pushing backend..." -ForegroundColor Yellow
    docker push "${ACR}/sync-backend:${Tag}" | Out-Null
    docker push "${ACR}/sync-backend:latest" | Out-Null
    Write-Host "   ✅ Backend pushed: ${ACR}/sync-backend:${Tag}" -ForegroundColor Green
}

# ── Build & push frontend ─────────────────────────────────────
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "3️⃣  Building frontend image ($Tag)..." -ForegroundColor Yellow
    Set-Location "$ROOT\frontend"
    docker build `
        --build-arg VITE_API_URL=/api `
        -t "${ACR}/sync-frontend:${Tag}" `
        -t "${ACR}/sync-frontend:latest" `
        . 2>&1 | Tee-Object -Variable buildOutputFe
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Frontend build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Frontend built" -ForegroundColor Green

    Write-Host "   Pushing frontend..." -ForegroundColor Yellow
    docker push "${ACR}/sync-frontend:${Tag}" | Out-Null
    docker push "${ACR}/sync-frontend:latest" | Out-Null
    Write-Host "   ✅ Frontend pushed: ${ACR}/sync-frontend:${Tag}" -ForegroundColor Green
}

# ── Run database migrations (SAFE — deploy only, never reset) ─
if (-not $SkipMigrations) {
    Write-Host ""
    Write-Host "4️⃣  Running database migrations (prisma migrate deploy)..." -ForegroundColor Yellow
    Write-Host "   ℹ️  Using 'migrate deploy' — only applies pending migrations, NEVER resets data." -ForegroundColor Cyan

    # Retrieve DATABASE_URL from the Azure Container App secret (never hardcoded)
    $DB_URL = az containerapp secret show `
        --name $BACKEND_APP `
        --resource-group $RESOURCE_GROUP `
        --secret-name database-url `
        --query "value" -o tsv 2>$null

    if (-not $DB_URL) {
        Write-Host "   ⚠️  Could not retrieve DATABASE_URL from Azure secret. Skipping migrations." -ForegroundColor Yellow
        Write-Host "   Run manually: cd backend ; `$env:DATABASE_URL='<url>' ; npx prisma migrate deploy" -ForegroundColor Yellow
    } else {
        Set-Location "$ROOT\backend"
        $env:DATABASE_URL = $DB_URL
        # Generate Prisma client first
        npx prisma generate 2>&1 | Out-Null
        # Deploy migrations — safe, idempotent, never drops data
        npx prisma migrate deploy 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Migration failed! Container apps NOT updated. Fix migrations before redeploying." -ForegroundColor Red
            exit 1
        }
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
        Write-Host "   ✅ Migrations applied successfully" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "4️⃣  Skipping migrations (--SkipMigrations flag set)" -ForegroundColor Yellow
}

# ── Update Container Apps ─────────────────────────────────────
Write-Host ""
Write-Host "5️⃣  Updating Container Apps..." -ForegroundColor Yellow

if (-not $FrontendOnly) {
    Write-Host "   Updating backend → ${Tag}..." -ForegroundColor Yellow
    az containerapp update `
        --name $BACKEND_APP `
        --resource-group $RESOURCE_GROUP `
        --image "${ACR}/sync-backend:${Tag}" `
        --query "properties.latestRevisionName" -o tsv 2>&1 | Select-Object -Last 1
    Write-Host "   ✅ Backend updated" -ForegroundColor Green
}

if (-not $BackendOnly) {
    Write-Host "   Updating frontend → ${Tag}..." -ForegroundColor Yellow
    az containerapp update `
        --name $FRONTEND_APP `
        --resource-group $RESOURCE_GROUP `
        --image "${ACR}/sync-frontend:${Tag}" `
        --query "properties.latestRevisionName" -o tsv 2>&1 | Select-Object -Last 1
    Write-Host "   ✅ Frontend updated" -ForegroundColor Green
}

# ── Health check ──────────────────────────────────────────────
Write-Host ""
Write-Host "6️⃣  Waiting for containers to stabilise..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

$frontendFqdn = az containerapp show `
    --name $FRONTEND_APP `
    --resource-group $RESOURCE_GROUP `
    --query "properties.configuration.ingress.fqdn" -o tsv 2>$null

if ($frontendFqdn) {
    $status = (Invoke-WebRequest -Uri "https://$frontendFqdn" -UseBasicParsing -TimeoutSec 15 -ErrorAction SilentlyContinue).StatusCode
    if ($status -eq 200) {
        Write-Host "   ✅ Frontend health check: HTTP $status" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Frontend returned: $status (may still be starting)" -ForegroundColor Yellow
    }
}

# ── Done ──────────────────────────────────────────────────────
Set-Location $ROOT
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  🎉 Deployment Complete!                     ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Version:  $Tag" -ForegroundColor Green
if ($frontendFqdn) {
Write-Host "║  URL:      https://$frontendFqdn" -ForegroundColor Green
}
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Database was NOT touched except for safe migration apply." -ForegroundColor Cyan
