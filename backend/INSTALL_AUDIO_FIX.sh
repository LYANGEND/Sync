#!/bin/bash

# Audio Transcription Fix - Installation Script
echo "Installing audio transcription dependencies..."

# Install form-data package
npm install form-data@^4.0.0

# Install type definitions
npm install --save-dev @types/form-data@^2.5.0

echo "✅ Dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Restart your backend server: npm run dev"
echo "2. Test the microphone feature in Master AI"
echo ""
