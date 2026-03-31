#!/bin/bash

# Update Azure Audio Configuration on Server
# This script adds the Azure Whisper and TTS endpoint configuration to the server's .env file

echo "Updating Azure Audio configuration on server..."

# SSH into server and update .env
ssh Misheck@meet.bwangubwangu.io << 'EOF'
cd ~/app

# Backup current .env
cp backend/.env backend/.env.backup.$(date +%Y%m%d_%H%M%S)

# Add Azure Whisper configuration
if ! grep -q "AZURE_WHISPER_ENDPOINT" backend/.env; then
  echo "" >> backend/.env
  echo "# Azure Whisper Configuration" >> backend/.env
  echo "AZURE_WHISPER_ENDPOINT=https://mishe-mkp01891-eastus2.cognitiveservices.azure.com/" >> backend/.env
  echo "AZURE_WHISPER_DEPLOYMENT=whisper" >> backend/.env
  echo "AZURE_WHISPER_API_VERSION=2024-06-01" >> backend/.env
  echo "Added Whisper configuration"
else
  echo "Whisper configuration already exists, updating..."
  sed -i 's|AZURE_WHISPER_ENDPOINT=.*|AZURE_WHISPER_ENDPOINT=https://mishe-mkp01891-eastus2.cognitiveservices.azure.com/|' backend/.env
  sed -i 's|AZURE_WHISPER_DEPLOYMENT=.*|AZURE_WHISPER_DEPLOYMENT=whisper|' backend/.env
  sed -i 's|AZURE_WHISPER_API_VERSION=.*|AZURE_WHISPER_API_VERSION=2024-06-01|' backend/.env
fi

# Add Azure TTS configuration
if ! grep -q "AZURE_TTS_ENDPOINT" backend/.env; then
  echo "" >> backend/.env
  echo "# Azure TTS Configuration" >> backend/.env
  echo "AZURE_TTS_ENDPOINT=https://mishe-mnenjk96-swedencentral.cognitiveservices.azure.com/" >> backend/.env
  echo "AZURE_TTS_DEPLOYMENT=tts-hd" >> backend/.env
  echo "AZURE_TTS_API_VERSION=2025-03-01-preview" >> backend/.env
  echo "Added TTS configuration"
else
  echo "TTS configuration already exists, updating..."
  sed -i 's|AZURE_TTS_ENDPOINT=.*|AZURE_TTS_ENDPOINT=https://mishe-mnenjk96-swedencentral.cognitiveservices.azure.com/|' backend/.env
  sed -i 's|AZURE_TTS_DEPLOYMENT=.*|AZURE_TTS_DEPLOYMENT=tts-hd|' backend/.env
  sed -i 's|AZURE_TTS_API_VERSION=.*|AZURE_TTS_API_VERSION=2025-03-01-preview|' backend/.env
fi

echo "Configuration updated successfully!"
echo ""
echo "Restarting backend container..."
docker-compose -f docker-compose.prod.yml restart backend

echo ""
echo "Done! Audio features should now work."
EOF
