# Azure OpenAI Setup for Voice AI Tutor

## Overview

This guide shows how to configure the Voice AI Tutor to use **Azure OpenAI** (Azure Foundry) instead of OpenAI directly. Azure OpenAI provides enterprise-grade security, compliance, and data residency options.

## Benefits of Azure OpenAI

✅ **Data Residency**: Keep data in specific regions (e.g., South Africa)
✅ **Enterprise Security**: Azure AD integration, private endpoints
✅ **Compliance**: GDPR, HIPAA, SOC 2 compliant
✅ **SLA**: 99.9% uptime guarantee
✅ **Cost Management**: Better billing and cost controls
✅ **Content Filtering**: Built-in content moderation

---

## Step 1: Create Azure OpenAI Resource

### 1.1 Azure Portal Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource**
3. Search for **Azure OpenAI**
4. Click **Create**

### 1.2 Configure Resource

```
Resource Group: sync-school-resources
Name: sync-openai-service
Region: South Africa North (or closest to Zambia)
Pricing Tier: Standard S0
```

5. Click **Review + Create**
6. Wait for deployment (2-3 minutes)

---

## Step 2: Deploy Models

You need to deploy 3 models for the Voice AI Tutor:

### 2.1 GPT-4o (Main AI Model)

1. Go to your Azure OpenAI resource
2. Click **Model deployments** → **Create new deployment**
3. Configure:
   ```
   Model: gpt-4o
   Deployment name: gpt-4o
   Model version: Latest
   Deployment type: Standard
   Tokens per minute rate limit: 60K (adjust based on usage)
   ```
4. Click **Create**

### 2.2 Whisper (Speech-to-Text)

1. Click **Create new deployment**
2. Configure:
   ```
   Model: whisper
   Deployment name: whisper
   Model version: Latest
   ```
3. Click **Create**

### 2.3 TTS (Text-to-Speech)

1. Click **Create new deployment**
2. Configure:
   ```
   Model: tts-1
   Deployment name: tts
   Model version: Latest
   ```
3. Click **Create**

---

## Step 3: Get Credentials

### 3.1 Get API Key

1. In your Azure OpenAI resource
2. Click **Keys and Endpoint** (left sidebar)
3. Copy **KEY 1** (starts with a long string)
4. Copy **Endpoint** (looks like: `https://sync-openai-service.openai.azure.com/`)

### 3.2 Note Deployment Names

Make sure you have:
- GPT-4o deployment name: `gpt-4o`
- Whisper deployment name: `whisper`
- TTS deployment name: `tts`

---

## Step 4: Configure Backend

### 4.1 Update Environment Variables

Edit `backend/.env`:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your-azure-api-key-here
AZURE_OPENAI_ENDPOINT=https://sync-openai-service.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper
AZURE_OPENAI_TTS_DEPLOYMENT=tts

# Optional: API Version (use latest)
AZURE_OPENAI_API_VERSION=2024-08-01-preview
```

### 4.2 Install Azure OpenAI SDK

```bash
cd backend
npm install openai@latest
```

The OpenAI SDK v4+ includes Azure OpenAI support.

---

## Step 5: Test Configuration

### 5.1 Test Script

Create `backend/scripts/test-azure-openai.ts`:

```typescript
import { AzureOpenAI } from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: '2024-08-01-preview',
});

async function testAzureOpenAI() {
  console.log('Testing Azure OpenAI connection...\n');

  try {
    // Test Chat Completion
    console.log('1. Testing GPT-4o...');
    const chatResponse = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages: [
        { role: 'user', content: 'Say "Azure OpenAI is working!"' }
      ],
      max_tokens: 50,
    });
    console.log('✅ GPT-4o Response:', chatResponse.choices[0].message.content);

    // Test TTS (if you have audio file to test)
    console.log('\n2. Testing TTS...');
    const ttsResponse = await client.audio.speech.create({
      model: process.env.AZURE_OPENAI_TTS_DEPLOYMENT || 'tts',
      voice: 'nova',
      input: 'Hello from Azure OpenAI!',
    });
    console.log('✅ TTS working! Audio generated.');

    console.log('\n✅ All tests passed! Azure OpenAI is configured correctly.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testAzureOpenAI();
```

### 5.2 Run Test

```bash
npx ts-node backend/scripts/test-azure-openai.ts
```

Expected output:
```
Testing Azure OpenAI connection...

1. Testing GPT-4o...
✅ GPT-4o Response: Azure OpenAI is working!

2. Testing TTS...
✅ TTS working! Audio generated.

✅ All tests passed! Azure OpenAI is configured correctly.
```

---

## Step 6: Update Setup Script

Update `backend/scripts/setup-voice-tutor.sh`:

```bash
#!/bin/bash

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
    echo "⚠️  Warning: AZURE_OPENAI_API_KEY not set"
    echo "Please add to your .env file:"
    echo ""
    echo "AZURE_OPENAI_API_KEY=your-key"
    echo "AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/"
    echo "AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o"
    echo "AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper"
    echo "AZURE_OPENAI_TTS_DEPLOYMENT=tts"
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
echo "1. Ensure Azure OpenAI credentials are in .env"
echo "2. Test with: npx ts-node scripts/test-azure-openai.ts"
echo "3. Restart your backend server"
echo "4. Navigate to /student/voice-tutor in the frontend"
```

---

## Azure OpenAI Pricing (South Africa North)

### Model Costs

| Model | Input | Output | Notes |
|-------|-------|--------|-------|
| **GPT-4o** | $2.50/1M tokens | $10/1M tokens | Main AI model |
| **Whisper** | $0.006/minute | - | Speech-to-text |
| **TTS** | - | $15/1M chars | Text-to-speech |

### Cost Estimate (Per Student/Month)

Assuming 30 minutes of tutoring per month:

```
Transcription (Whisper):
- 30 minutes × $0.006 = $0.18

AI Processing (GPT-4o):
- Input: ~50K tokens × $2.50/1M = $0.125
- Output: ~30K tokens × $10/1M = $0.30
- Total: $0.425

Text-to-Speech (TTS):
- ~20K characters × $15/1M = $0.30

Total per student: ~$0.90/month
```

### For 500 Students
- **Monthly cost**: $450
- **Charge students**: K50/month ($3)
- **Monthly revenue**: K25,000 ($1,500)
- **Profit**: $1,050/month
- **Margin**: 70%

---

## Azure-Specific Features

### 1. Content Filtering

Azure OpenAI includes built-in content moderation:

```typescript
// Configure content filtering in Azure Portal
// Settings → Content filters → Create custom filter

// Categories:
// - Hate: Block/Filter/Allow
// - Sexual: Block/Filter/Allow
// - Violence: Block/Filter/Allow
// - Self-harm: Block/Filter/Allow
```

### 2. Private Endpoints

For enhanced security:

1. Go to Azure OpenAI resource
2. Click **Networking**
3. Select **Private endpoint**
4. Create private endpoint in your VNet

### 3. Managed Identity

Use Azure AD instead of API keys:

```typescript
import { DefaultAzureCredential } from '@azure/identity';

const credential = new DefaultAzureCredential();
const client = new AzureOpenAI({
  credential,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
});
```

### 4. Monitoring

Track usage in Azure Portal:

1. Go to Azure OpenAI resource
2. Click **Metrics**
3. View:
   - Total calls
   - Token usage
   - Latency
   - Error rates

---

## Regional Considerations for Zambia

### Recommended Region: **South Africa North**

**Pros:**
- Closest Azure region to Zambia
- ~50ms latency from Lusaka
- Full Azure OpenAI service availability
- Data residency in Africa

**Alternative: West Europe**
- ~150ms latency
- More model availability
- Fallback option

### Network Optimization

```typescript
// Add retry logic for network issues
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
});
```

---

## Troubleshooting

### Error: "Resource not found"

**Solution**: Check deployment names match exactly

```env
# Deployment names are case-sensitive
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o  # Must match Azure Portal
```

### Error: "Quota exceeded"

**Solution**: Increase TPM (Tokens Per Minute) in Azure Portal

1. Go to **Model deployments**
2. Click your deployment
3. Increase **Tokens per Minute Rate Limit**

### Error: "Invalid API key"

**Solution**: Regenerate key in Azure Portal

1. Go to **Keys and Endpoint**
2. Click **Regenerate Key 1**
3. Update `.env` file

### High Latency

**Solution**: Use South Africa North region or implement caching

```typescript
// Cache common responses
import Redis from 'ioredis';
const redis = new Redis();

const cacheKey = `response:${hash(question)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
```

---

## Migration from OpenAI to Azure OpenAI

If you already have OpenAI implementation:

### Changes Required:

1. **Import statement**:
   ```typescript
   // Before
   import OpenAI from 'openai';
   
   // After
   import { AzureOpenAI } from 'openai';
   ```

2. **Client initialization**:
   ```typescript
   // Before
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
   
   // After
   const openai = new AzureOpenAI({
     apiKey: process.env.AZURE_OPENAI_API_KEY,
     endpoint: process.env.AZURE_OPENAI_ENDPOINT,
     apiVersion: '2024-08-01-preview',
   });
   ```

3. **Model names**:
   ```typescript
   // Before
   model: 'gpt-4o'
   
   // After
   model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
   ```

4. **Environment variables**:
   ```env
   # Before
   OPENAI_API_KEY=sk-...
   
   # After
   AZURE_OPENAI_API_KEY=...
   AZURE_OPENAI_ENDPOINT=https://...
   AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
   ```

---

## Security Best Practices

1. **Use Key Vault**: Store API keys in Azure Key Vault
2. **Enable Private Endpoints**: Restrict public access
3. **Use Managed Identity**: Avoid hardcoded credentials
4. **Enable Logging**: Track all API calls
5. **Set Rate Limits**: Prevent abuse
6. **Content Filtering**: Enable for student safety

---

## Next Steps

1. ✅ Create Azure OpenAI resource
2. ✅ Deploy models (GPT-4o, Whisper, TTS)
3. ✅ Configure environment variables
4. ✅ Test connection
5. ✅ Deploy to production
6. 📊 Monitor usage and costs
7. 🎓 Train students and teachers

---

## Support

- **Azure OpenAI Docs**: https://learn.microsoft.com/azure/ai-services/openai/
- **Pricing Calculator**: https://azure.microsoft.com/pricing/calculator/
- **Support**: Open Azure support ticket

**Your Voice AI Tutor is now powered by Azure OpenAI!** 🚀
