#!/bin/bash

# Term-Based Financial Tracking Setup Script
# This script sets up term-based financial tracking in the Sync system

set -e  # Exit on error

echo "================================================"
echo "Term-Based Financial Tracking Setup"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the backend directory${NC}"
    exit 1
fi

# Step 1: Generate Prisma Client
echo -e "${YELLOW}Step 1: Generating Prisma Client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"
echo ""

# Step 2: Create and apply migration
echo -e "${YELLOW}Step 2: Creating database migration...${NC}"
echo "This will update your database schema to support term-based financial tracking."
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 1
fi

npx prisma migrate dev --name add_term_financial_tracking
echo -e "${GREEN}✓ Database migration applied${NC}"
echo ""

# Step 3: Run data migration
echo -e "${YELLOW}Step 3: Migrating existing financial data...${NC}"
echo "This will:"
echo "  - Link fee structures to terms"
echo "  - Associate payments with terms"
echo "  - Generate term financial summaries"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Data migration cancelled."
    exit 1
fi

npx ts-node src/scripts/migrate-term-finances.ts
echo -e "${GREEN}✓ Data migration completed${NC}"
echo ""

# Step 4: Verify setup
echo -e "${YELLOW}Step 4: Verifying setup...${NC}"

# Check if TermFinancialSummary table exists
SUMMARY_COUNT=$(npx prisma db execute --stdin <<EOF
SELECT COUNT(*) as count FROM term_financial_summaries;
EOF
)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ TermFinancialSummary table exists${NC}"
else
    echo -e "${RED}✗ TermFinancialSummary table not found${NC}"
    exit 1
fi

echo ""
echo "================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Restart your backend server"
echo "  2. Test the new endpoints:"
echo "     GET /api/v1/financial/terms"
echo "     GET /api/v1/financial/terms/:termId/summary"
echo "     GET /api/v1/financial/terms/:termId/outstanding"
echo ""
echo "  3. Read the migration guide:"
echo "     cat TERM_FINANCIAL_MIGRATION.md"
echo ""
echo "Happy tracking! 🎉"
