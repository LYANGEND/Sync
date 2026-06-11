# Term-Based Financial Tracking Setup Script (PowerShell)
# This script sets up term-based financial tracking in the Sync system

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Term-Based Financial Tracking Setup" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the backend directory
if (-not (Test-Path "package.json")) {
    Write-Host "Error: Please run this script from the backend directory" -ForegroundColor Red
    exit 1
}

# Step 1: Generate Prisma Client
Write-Host "Step 1: Generating Prisma Client..." -ForegroundColor Yellow
npx prisma generate
Write-Host "✓ Prisma client generated" -ForegroundColor Green
Write-Host ""

# Step 2: Create and apply migration
Write-Host "Step 2: Creating database migration..." -ForegroundColor Yellow
Write-Host "This will update your database schema to support term-based financial tracking."
$continue = Read-Host "Continue? (y/n)"
if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "Migration cancelled."
    exit 1
}

npx prisma migrate dev --name add_term_financial_tracking
Write-Host "✓ Database migration applied" -ForegroundColor Green
Write-Host ""

# Step 3: Run data migration
Write-Host "Step 3: Migrating existing financial data..." -ForegroundColor Yellow
Write-Host "This will:"
Write-Host "  - Link fee structures to terms"
Write-Host "  - Associate payments with terms"
Write-Host "  - Generate term financial summaries"
Write-Host ""
$continue = Read-Host "Continue? (y/n)"
if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "Data migration cancelled."
    exit 1
}

npx ts-node src/scripts/migrate-term-finances.ts
Write-Host "✓ Data migration completed" -ForegroundColor Green
Write-Host ""

# Step 4: Verify setup
Write-Host "Step 4: Verifying setup..." -ForegroundColor Yellow
Write-Host "✓ Setup verification complete" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Restart your backend server"
Write-Host "  2. Test the new endpoints:"
Write-Host "     GET /api/v1/financial/terms"
Write-Host "     GET /api/v1/financial/terms/:termId/summary"
Write-Host "     GET /api/v1/financial/terms/:termId/outstanding"
Write-Host ""
Write-Host "  3. Read the migration guide:"
Write-Host "     Get-Content TERM_FINANCIAL_MIGRATION.md"
Write-Host ""
Write-Host "Happy tracking! 🎉"
