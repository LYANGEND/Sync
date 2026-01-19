#!/bin/bash

# Installation script for Ops Admin Advanced Features
# Run this script to install all required packages

echo "🚀 Installing Ops Admin Advanced Features..."
echo ""

# Navigate to backend
cd backend || exit

echo "📦 Installing backend packages..."
echo ""

# Email Services
echo "1️⃣ Installing Azure Communication Services..."
npm install @azure/communication-email

# PDF Generation
echo "2️⃣ Installing PDFKit for invoice generation..."
npm install pdfkit
npm install --save-dev @types/pdfkit

# Scheduled Reports
echo "3️⃣ Installing node-cron for scheduled reports..."
npm install node-cron
npm install --save-dev @types/node-cron

echo ""
echo "✅ Backend packages installed successfully!"
echo ""

# Navigate to frontend
cd ../frontend || exit

echo "📦 Installing frontend packages (optional)..."
echo ""

# Charts (optional)
echo "4️⃣ Installing Chart.js for advanced charts (optional)..."
read -p "Install Chart.js? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    npm install chart.js react-chartjs-2
    echo "✅ Chart.js installed!"
else
    echo "⏭️  Skipped Chart.js installation"
fi

echo ""
echo "🎉 Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Configure environment variables in backend/.env"
echo "2. Add Azure credentials (optional)"
echo "3. Initialize scheduled reports in server.ts"
echo "4. Test features in Platform Admin dashboard"
echo ""
echo "📚 See docs/OPS_ADMIN_FEATURES.md for detailed setup guide"
echo ""
