# Azure OpenAI Quick Start for Voice AI Tutor

## 🚀 Get Started in 20 Minutes

This guide gets your Voice AI Tutor running with Azure OpenAI.

---

## Step 1: Azure Portal (10 minutes)

### 1.1 Create Azure OpenAI Resource

1. Go to [portal.azure.com](https://portal.azure.com)
2. Search "Azure OpenAI" → Click **Create**
3. Fill in:
   - **Resource Group**: `sync-school` (create new)
   - **Region**: **South Africa North** (closest to Zambia)
   - **Name**: `sync-openai-zambia`
   - **Pricing**: Standard S0
4. Click **Review + Create** → **Create**
5. Wait 2-3 minutes for deployment

### 1.2 Deploy Models

After resource is created:

1. Click **Go to resource**
2. Click **Model deployments** → **Manage Deployments**
3. This opens Azure OpenAI Studio

**Deploy GPT-4o:**
- Click **Create new deployment**
- Model: `gpt-4o`
- Deployment name: `gpt-4o`
- Click **Create**

**Deploy Whisper:**
- Click **Create new deployment**
- Model: `whisper`
- Deployment name: `whisper`
- Click **Create**

**Deploy TTS:**
- Click **Create new deployment**
- Model: `tts-1`
- Deployment name: `tts`
- Click **Create**

### 1.3 Get Credentials

1. Go back to Azure Portal
2. Your Azure OpenAI resource → **Keys and Endpoint**
3. Copy:
   - **KEY 1** (your API key)
   - **Endpoint** (e.g., `https://sync-openai-zambia.openai.azure.com/`)

---

## Step 2: Backend Setup (5 minutes)

```bash
cd backend

# Copy environment template
cp .env.azure.example .env

# Edit .env file with your Azure credentials
nano .env  # or use your preferred editor
```

Update these values in `.env`:

```env
AZURE_OPENAI_API_KEY=paste-your-key-here
AZURE_OPENAI_ENDPOINT=https://sync-openai-zambia.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper
AZURE_OPENAI_TTS_DEPLOYMENT=tts
```

---

## Step 3: Install & Test (5 minutes)

```bash
# Run setup script
chmod +x scripts/setup-voice-tutor.sh
./scripts/setup-voice-tutor.sh

# Test Azure OpenAI connection
npx ts-node scripts/test-azure-openai.ts
```

Expected output:
```
🧪 Testing Azure OpenAI Configuration

1️⃣  Testing GPT-4o Chat Completion...
   ✅ GPT-4o is working!
   Response: "Photosynthesis is the process..."

2️⃣  Testing Text-to-Speech (TTS)...
   ✅ TTS is working!
   Generated 45678 bytes of audio

✅ All tests passed! Azure OpenAI is configured correctly.
```

---

## Step 4: Register Routes

### Backend: `backend/src/app.ts`

Add this line after other route imports:

```typescript
import voiceTutorRoutes from './routes/voiceTutorRoutes';

// ... other routes ...

app.use('/api/v1/voice-tutor', voiceTutorRoutes);
```

### Frontend: `frontend/src/App.tsx`

Add this route:

```typescript
import VoiceTutor from './pages/student/VoiceTutor';

// In your routes:
<Route path="/student/voice-tutor" element={<VoiceTutor />} />
```

---

## Step 5: Start & Test

```bash
# Start backend
cd backend
npm run dev

# In another terminal, start frontend
cd frontend
npm run dev
```

Open browser: `http://localhost:3000/student/voice-tutor`

**Test it:**
1. Click microphone button
2. Say: "Can you explain photosynthesis?"
3. AI should respond with voice!

---

## Troubleshooting

### ❌ "Resource not found"
**Fix**: Check deployment names match exactly in `.env` and Azure Portal

### ❌ "Invalid API key"
**Fix**: Copy KEY 1 from Azure Portal → Keys and Endpoint

### ❌ "Quota exceeded"
**Fix**: In Azure Portal → Model deployments → Increase TPM limit

### ❌ Test script fails
**Fix**: 
```bash
# Check environment variables are loaded
cd backend
cat .env | grep AZURE

# Ensure openai package is latest
npm install openai@latest
```

---

## Cost Monitoring

Track costs in Azure Portal:

1. Go to **Cost Management + Billing**
2. Click **Cost analysis**
3. Filter by resource: `sync-openai-zambia`

**Set up budget alert:**
1. Click **Budgets** → **Add**
2. Set monthly budget (e.g., $500)
3. Add email alert at 80% threshold

---

## Next Steps

✅ Azure OpenAI configured
✅ Voice tutor working
✅ Tests passing

**Now:**
1. Add floating button to student pages
2. Test with real students
3. Monitor usage and costs
4. Gather feedback
5. Scale to more students!

---

## Full Documentation

- **Complete Azure Guide**: `docs/AZURE_OPENAI_SETUP.md`
- **Implementation Details**: `docs/VOICE_AI_TUTOR_IMPLEMENTATION.md`
- **Integration Checklist**: `docs/INTEGRATION_CHECKLIST.md`

---

## Support

**Issues?** Check:
1. Azure Portal → Resource health
2. Backend console logs
3. Browser console (F12)
4. `docs/AZURE_OPENAI_SETUP.md` troubleshooting section

**Questions?** Open GitHub issue or contact team.

---

**🎉 Congratulations! Your Voice AI Tutor is live with Azure OpenAI!**
