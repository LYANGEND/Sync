# Voice AI Tutor - Quick Start Guide

## What is it?

A voice-interactive AI tutor that students can talk to naturally. Students speak their questions, the AI tutor responds with helpful explanations, and reads the answers aloud.

## Features

- 🎤 **Voice Input**: Students speak naturally
- 🔊 **Voice Output**: AI responds with natural speech
- 💬 **Conversational**: Maintains context across conversation
- 📚 **Lesson Explanations**: Can explain entire topics
- 🌍 **Multi-language**: English, Bemba, Nyanja, Tonga
- 📱 **Mobile-friendly**: Works on phones and tablets

## 5-Minute Setup

### Step 1: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create account or sign in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### Step 2: Configure Backend

```bash
cd backend

# Add API key to .env
echo "OPENAI_API_KEY=sk-your-key-here" >> .env

# Run setup script
chmod +x scripts/setup-voice-tutor.sh
./scripts/setup-voice-tutor.sh
```

### Step 3: Register Routes

Edit `backend/src/app.ts` and add:

```typescript
import voiceTutorRoutes from './routes/voiceTutorRoutes';

// After other routes
app.use('/api/v1/voice-tutor', voiceTutorRoutes);
```

### Step 4: Update Frontend Routes

Edit `frontend/src/App.tsx` and add:

```typescript
import VoiceTutor from './pages/student/VoiceTutor';

// In your routes
<Route path="/student/voice-tutor" element={<VoiceTutor />} />
```

### Step 5: Add Access Button

Add to any student page (e.g., topic view):

```typescript
import VoiceTutorButton from '../components/VoiceTutorButton';

// In your component
<VoiceTutorButton 
  variant="floating" 
  topicId={topic.id} 
/>
```

### Step 6: Test It!

1. Restart backend: `npm run dev`
2. Open frontend: `http://localhost:3000`
3. Navigate to `/student/voice-tutor`
4. Click microphone button and speak!

## How Students Use It

### Basic Conversation

1. **Click microphone button**
2. **Speak question**: "Can you explain photosynthesis?"
3. **AI responds**: Explains concept with voice
4. **Ask follow-up**: "Can you give an example?"
5. **Continue conversation**

### Request Lesson Explanation

1. **Select a topic** (e.g., from syllabus)
2. **Click "Explain Lesson" button**
3. **AI provides full lesson** with voice narration
4. **Ask questions** about the lesson

### Example Conversations

**Math Help:**
```
Student: "I don't understand fractions"
AI: "Let me help! Imagine you have a loaf of bread for K15. 
     If you share it equally with 2 friends, each person gets 
     1/3 of the bread. That's a fraction! What would each 
     person pay?"
Student: "K5?"
AI: "Exactly! You've got it. Now let's try another example..."
```

**Science Question:**
```
Student: "What is photosynthesis?"
AI: "Great question! Photosynthesis is how plants make their 
     own food. Think of it like cooking. Plants use sunlight 
     as their stove, water and air as ingredients, and they 
     make sugar as food. Can you think of what plants need 
     to do this?"
```

## Cost Estimates

Based on OpenAI pricing (as of 2024):

### Per Student Per Month
- **Speech-to-Text**: $0.006/minute × 30 minutes = $0.18
- **AI Processing**: ~$0.30 (GPT-4o-mini)
- **Text-to-Speech**: $0.015/1K chars × 20K = $0.30
- **Total**: ~$0.80/student/month

### For 100 Students
- **Monthly**: $80
- **Annual**: $960

### Revenue Model
- Charge students K50/month ($3)
- Revenue: K5,000/month ($300)
- Profit: $220/month
- **Margin**: 73%

## Troubleshooting

### "Microphone not working"
- **Check browser permissions**: Allow microphone access
- **Use HTTPS**: Voice features require secure connection
- **Try different browser**: Chrome/Edge work best

### "No audio playback"
- **Check volume**: Ensure device volume is up
- **Disable autoplay block**: Allow audio in browser settings
- **Click play button**: If autoplay fails, manual play button appears

### "API errors"
- **Check API key**: Ensure OPENAI_API_KEY is set correctly
- **Check balance**: Verify OpenAI account has credits
- **Check logs**: Look at backend console for errors

### "Slow responses"
- **Network speed**: Voice requires good internet
- **Use cheaper model**: Switch to gpt-4o-mini in code
- **Reduce audio quality**: Lower TTS quality setting

## Advanced Configuration

### Change Voice

Edit `voiceTutorController.ts`:

```typescript
const mp3 = await openai.audio.speech.create({
  model: 'tts-1',
  voice: 'nova', // Options: alloy, echo, fable, onyx, nova, shimmer
  input: text,
});
```

### Adjust Speaking Speed

```typescript
const mp3 = await openai.audio.speech.create({
  model: 'tts-1',
  voice: 'nova',
  input: text,
  speed: 0.9, // 0.25 to 4.0 (1.0 is normal)
});
```

### Add Custom Teaching Style

Edit system prompt in `buildSystemPrompt()`:

```typescript
const systemPrompt = `You are a friendly AI tutor...

TEACHING STYLE:
- Use storytelling to explain concepts
- Always relate to Zambian daily life
- Be patient and encouraging
- Use humor when appropriate
- Check understanding frequently
`;
```

### Enable Offline Mode

Cache responses for common questions:

```typescript
// In voiceTutorController.ts
const cacheKey = `response:${questionHash}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

// Generate response...
await redis.set(cacheKey, JSON.stringify(response), 'EX', 86400);
```

## Best Practices

### For Students
1. **Speak clearly** in a quiet environment
2. **Ask specific questions** rather than vague ones
3. **Follow up** if you don't understand
4. **Use it regularly** to build learning habit

### For Teachers
1. **Monitor usage** to identify struggling students
2. **Review session history** to understand common questions
3. **Create topic-specific prompts** for better responses
4. **Encourage students** to use it for homework help

### For Administrators
1. **Track costs** monthly to stay within budget
2. **Gather feedback** from students and teachers
3. **Analyze metrics** (sessions, questions, satisfaction)
4. **Scale gradually** starting with pilot classes

## Next Steps

1. **Test with pilot group**: 10-20 students
2. **Gather feedback**: Survey after 2 weeks
3. **Iterate**: Improve based on feedback
4. **Scale**: Roll out to more classes
5. **Monitor**: Track usage and costs

## Support

- **Full Documentation**: `docs/VOICE_AI_TUTOR_IMPLEMENTATION.md`
- **API Reference**: Check controller comments
- **Issues**: Open GitHub issue
- **Questions**: Contact development team

---

**Ready to transform learning with AI? Start the setup now!** 🚀
