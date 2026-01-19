@echo off
REM Installation script for Ops Admin Advanced Features
REM Run this script to install all required packages

echo.
echo 🚀 Installing Ops Admin Advanced Features...
echo.

REM Navigate to backend
cd backend

echo 📦 Installing backend packages...
echo.

REM Email Services
echo 1️⃣ Installing Azure Communication Services...
call npm install @azure/communication-email

REM PDF Generation
echo 2️⃣ Installing PDFKit for invoice generation...
call npm install pdfkit
call npm install --save-dev @types/pdfkit

REM Scheduled Reports
echo 3️⃣ Installing node-cron for scheduled reports...
call npm install node-cron
call npm install --save-dev @types/node-cron

echo.
echo ✅ Backend packages installed successfully!
echo.

REM Navigate to frontend
cd ..\frontend

echo 📦 Installing frontend packages (optional)...
echo.

REM Charts (optional)
echo 4️⃣ Installing Chart.js for advanced charts (optional)...
set /p INSTALL_CHARTS="Install Chart.js? (y/n): "
if /i "%INSTALL_CHARTS%"=="y" (
    call npm install chart.js react-chartjs-2
    echo ✅ Chart.js installed!
) else (
    echo ⏭️  Skipped Chart.js installation
)

echo.
echo 🎉 Installation complete!
echo.
echo 📝 Next steps:
echo 1. Configure environment variables in backend\.env
echo 2. Add Azure credentials (optional)
echo 3. Initialize scheduled reports in server.ts
echo 4. Test features in Platform Admin dashboard
echo.
echo 📚 See docs\OPS_ADMIN_FEATURES.md for detailed setup guide
echo.

pause
