import { AzureOpenAI } from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
});

async function testAzureOpenAI() {
  console.log('🧪 Testing Azure OpenAI Configuration\n');
  console.log('Configuration:');
  console.log(`  Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
  console.log(`  Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);
  console.log(`  API Version: ${process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview'}\n`);

  let allTestsPassed = true;

  // Test 1: Chat Completion (GPT-4o)
  try {
    console.log('1️⃣  Testing GPT-4o Chat Completion...');
    const chatResponse = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI tutor for students in Zambia.',
        },
        {
          role: 'user',
          content: 'Explain photosynthesis in one sentence.',
        },
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    const response = chatResponse.choices[0].message.content;
    console.log('   ✅ GPT-4o is working!');
    console.log(`   Response: "${response}"\n`);
  } catch (error: any) {
    console.error('   ❌ GPT-4o test failed:', error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    allTestsPassed = false;
  }

  // Test 2: Text-to-Speech
  try {
    console.log('2️⃣  Testing Text-to-Speech (TTS)...');
    const ttsResponse = await client.audio.speech.create({
      model: process.env.AZURE_OPENAI_TTS_DEPLOYMENT || 'tts',
      voice: 'nova',
      input: 'Hello! This is a test of Azure OpenAI text to speech.',
    });

    // Check if we got audio data
    const buffer = Buffer.from(await ttsResponse.arrayBuffer());
    if (buffer.length > 0) {
      console.log('   ✅ TTS is working!');
      console.log(`   Generated ${buffer.length} bytes of audio\n`);
    } else {
      throw new Error('No audio data received');
    }
  } catch (error: any) {
    console.error('   ❌ TTS test failed:', error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    allTestsPassed = false;
  }

  // Test 3: Whisper (Speech-to-Text) - Note: Requires audio file
  console.log('3️⃣  Testing Whisper (Speech-to-Text)...');
  console.log('   ⚠️  Skipped: Requires audio file for testing');
  console.log('   To test: Record audio and use the voice tutor interface\n');

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  if (allTestsPassed) {
    console.log('✅ All tests passed! Azure OpenAI is configured correctly.');
    console.log('\nNext steps:');
    console.log('1. Start your backend server: npm run dev');
    console.log('2. Open frontend: http://localhost:3000/student/voice-tutor');
    console.log('3. Test voice recording and AI responses');
  } else {
    console.log('❌ Some tests failed. Please check your configuration.');
    console.log('\nTroubleshooting:');
    console.log('1. Verify API key in .env file');
    console.log('2. Check deployment names match Azure Portal');
    console.log('3. Ensure models are deployed in Azure OpenAI Studio');
    console.log('4. Check quota limits in Azure Portal');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run tests
testAzureOpenAI().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
