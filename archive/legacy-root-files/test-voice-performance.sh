#!/bin/bash

# Voice AI Performance Test Script
# Tests the response time of voice AI endpoints

echo "🎙️ Voice AI Performance Test"
echo "=============================="
echo ""

# Check if backend is running
if ! curl -s http://localhost:4000/health > /dev/null 2>&1; then
  echo "❌ Backend is not running on port 4000"
  echo "   Start it with: cd backend && npm run dev"
  exit 1
fi

echo "✅ Backend is running"
echo ""

# Get auth token (you'll need to replace this with a valid token)
TOKEN="${1:-YOUR_TOKEN_HERE}"

if [ "$TOKEN" = "YOUR_TOKEN_HERE" ]; then
  echo "⚠️  No auth token provided"
  echo "   Usage: ./test-voice-performance.sh YOUR_AUTH_TOKEN"
  echo ""
  echo "   To get a token:"
  echo "   1. Login to your app"
  echo "   2. Open browser DevTools > Application > Local Storage"
  echo "   3. Copy the 'token' value"
  echo ""
  exit 1
fi

echo "🔍 Testing endpoints..."
echo ""

# Test 1: Transcription endpoint
echo "1️⃣ Testing transcription speed..."
START=$(date +%s%3N)
# Note: This requires an actual audio file to test properly
echo "   ⏭️  Skipped (requires audio file)"
echo ""

# Test 2: TTS endpoint
echo "2️⃣ Testing TTS generation speed..."
START=$(date +%s%3N)
curl -s -X POST http://localhost:4000/api/v1/master-ai/speech \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is a test"}' \
  -o /tmp/tts-test.mp3 > /dev/null 2>&1
END=$(date +%s%3N)
DURATION=$((END - START))

if [ -f /tmp/tts-test.mp3 ]; then
  SIZE=$(stat -f%z /tmp/tts-test.mp3 2>/dev/null || stat -c%s /tmp/tts-test.mp3 2>/dev/null)
  echo "   ✅ TTS generated in ${DURATION}ms (${SIZE} bytes)"
  rm /tmp/tts-test.mp3
else
  echo "   ❌ TTS generation failed"
fi
echo ""

# Test 3: Voice execute endpoint
echo "3️⃣ Testing voice command execution..."
START=$(date +%s%3N)
RESPONSE=$(curl -s -X POST http://localhost:4000/api/v1/master-ai/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the weather today?"}')
END=$(date +%s%3N)
DURATION=$((END - START))

if echo "$RESPONSE" | grep -q "message"; then
  echo "   ✅ Command executed in ${DURATION}ms"
  echo "   Response: $(echo "$RESPONSE" | jq -r '.message' 2>/dev/null | head -c 60)..."
else
  echo "   ❌ Command execution failed"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 4: Check Azure configuration
echo "4️⃣ Checking Azure configuration..."
if grep -q "AZURE_WHISPER_ENDPOINT" backend/.env; then
  WHISPER_ENDPOINT=$(grep "AZURE_WHISPER_ENDPOINT" backend/.env | cut -d'=' -f2)
  echo "   ✅ Whisper endpoint configured: $WHISPER_ENDPOINT"
else
  echo "   ❌ Whisper endpoint not configured"
fi

if grep -q "AZURE_TTS_ENDPOINT" backend/.env; then
  TTS_ENDPOINT=$(grep "AZURE_TTS_ENDPOINT" backend/.env | cut -d'=' -f2)
  echo "   ✅ TTS endpoint configured: $TTS_ENDPOINT"
else
  echo "   ❌ TTS endpoint not configured"
fi
echo ""

# Performance benchmarks
echo "📊 Performance Benchmarks"
echo "========================"
echo ""
echo "Target Response Times:"
echo "  • TTS Generation:     < 500ms  (for short text)"
echo "  • Voice Command:      < 3000ms (simple queries)"
echo "  • Voice Command:      < 5000ms (with tool execution)"
echo ""
echo "If your times are significantly higher:"
echo "  1. Verify Azure endpoints are configured correctly"
echo "  2. Check network latency to Azure regions"
echo "  3. Ensure backend timeout is set to 30s (not 120s)"
echo "  4. Restart backend to load new environment variables"
echo ""
