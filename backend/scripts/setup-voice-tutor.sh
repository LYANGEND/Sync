#!/bin/bash

# Voice AI Tutor Setup Script (Azure OpenAI)
# This script sets up the voice tutor feature with Azure OpenAI

echo "🎤 Setting up Voice AI Tutor with Azure OpenAI..."

# 1. Create upload directories
echo "📁 Creating upload directories..."
mkdir -p uploads/audio/temp
mkdir -p uploads/audio
chmod 755 uploads/audio
chmod 755 uploads/audio/temp

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install openai@latest multer @types/multer

# 3. Check for Azure OpenAI credentials
if [ -z "$AZURE_OPENAI_API_KEY" ]; then
    echo "⚠️  Warning: Azure OpenAI credentials not set"
    echo ""
    echo "Please add to your .env file:"
    echo ""
    echo "AZURE_OPENAI_API_KEY=your-azure-api-key"
    echo "AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/"
    echo "AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o"
    echo "AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper"
    echo "AZURE_OPENAI_TTS_DEPLOYMENT=tts"
    echo "AZURE_OPENAI_API_VERSION=2024-08-01-preview"
    echo ""
else
    echo "✅ Azure OpenAI credentials found"
fi

# 4. Run Prisma migrations
echo "🗄️  Running database migrations..."
npx prisma migrate dev --name add_voice_tutor

# 5. Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Voice AI Tutor setup complete!"
echo ""
echo "Next steps:"
echo "1. Ensure Azure OpenAI credentials are in .env file"
echo "2. Test configuration: npx ts-node scripts/test-azure-openai.ts"
echo "3. Restart your backend server"
echo "4. Navigate to /student/voice-tutor in the frontend"
echo ""
echo "📚 Documentation:"
echo "   - Azure Setup: docs/AZURE_OPENAI_SETUP.md"
echo "   - Implementation: docs/VOICE_AI_TUTOR_IMPLEMENTATION.md"
