# Azure Communication Services for Virtual Classes

## Overview

**Azure Communication Services (ACS)** is Microsoft's platform for adding video calling, voice, chat, SMS, and email to applications. It's the perfect choice for virtual classrooms when you're already using Azure OpenAI.

## Why Azure Communication Services?

### Benefits
✅ **Unified Azure Ecosystem** - Same billing, same portal, same region
✅ **Data Residency** - Keep all data in South Africa North
✅ **Enterprise Security** - Azure AD integration, compliance
✅ **Cost Effective** - Competitive pricing, no free tier limits
✅ **Scalable** - Handles thousands of participants
✅ **Teams Interop** - Can join from Microsoft Teams
✅ **Recording** - Built-in call recording
✅ **PSTN** - Can add phone dial-in

### Comparison with Agora.io

| Feature | Azure ACS | Agora.io |
|---------|-----------|----------|
| **Pricing** | $0.004/min/participant | $0.99/1000 min |
| **Free Tier** | None | 10,000 min/month |
| **Data Residency** | South Africa | Global |
| **Integration** | Native Azure | Third-party |
| **Teams Interop** | Yes | No |
| **Setup Complexity** | Medium | Easy |

**Recommendation**: Use **Azure ACS** for enterprise deployment with Azure OpenAI integration.

---

## Architecture

```
Student/Teacher Browser
    ↓
Azure Communication Services SDK
    ↓
Azure Communication Services (South Africa North)
    ↓
Your Backend (Token Generation)
    ↓
Azure SQL Database (Session Data)
```

---

## Step 1: Create Azure Communication Services Resource

### 1.1 Azure Portal Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource**
3. Search for **Communication Services**
4. Click **Create**

### 1.2 Configure Resource

```
Resource Group: sync-school-resources (same as OpenAI)
Name: sync-communication-service
Data Location: Africa
Region: South Africa North
```

5. Click **Review + Create**
6. Wait for deployment (1-2 minutes)

### 1.3 Get Connection String

1. Go to your Communication Services resource
2. Click **Keys** (left sidebar)
3. Copy **Connection string** (starts with `endpoint=https://...`)

---

## Step 2: Install Azure SDKs

### Backend Dependencies

```bash
cd backend
npm install @azure/communication-common
npm install @azure/communication-identity
npm install @azure/communication-calling
npm install @azure/communication-chat
```

### Frontend Dependencies

```bash
cd frontend
npm install @azure/communication-common
npm install @azure/communication-calling
npm install @azure/communication-react
npm install @azure/communication-chat
```

---

## Step 3: Configure Environment

Add to `backend/.env`:

```env
# Azure Communication Services
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://sync-communication-service.communication.azure.com/;accesskey=your-key-here

# Optional: Enable recording
AZURE_COMMUNICATION_RECORDING_ENABLED=true
```

---

## Step 4: Backend Implementation

Create `backend/src/services/azureCommunicationService.ts`:

```typescript
import { CommunicationIdentityClient } from '@azure/communication-identity';
import { AzureCommunicationTokenCredential } from '@azure/communication-common';

const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING!;
const identityClient = new CommunicationIdentityClient(connectionString);

/**
 * Create a new user identity for Azure Communication Services
 */
export async function createACSUser() {
  const user = await identityClient.createUser();
  return user.communicationUserId;
}

/**
 * Generate access token for a user
 */
export async function generateACSToken(userId: string) {
  const tokenResponse = await identityClient.getToken(
    { communicationUserId: userId },
    ['voip', 'chat'] // Scopes: voip for calling, chat for messaging
  );

  return {
    token: tokenResponse.token,
    expiresOn: tokenResponse.expiresOn,
  };
}

/**
 * Create user and token in one call
 */
export async function createUserAndToken() {
  const identityTokenResponse = await identityClient.createUserAndToken(['voip', 'chat']);
  
  return {
    userId: identityTokenResponse.user.communicationUserId,
    token: identityTokenResponse.token,
    expiresOn: identityTokenResponse.expiresOn,
  };
}

/**
 * Revoke all tokens for a user (when they leave)
 */
export async function revokeACSTokens(userId: string) {
  await identityClient.revokeTokens({ communicationUserId: userId });
}

/**
 * Delete a user identity
 */
export async function deleteACSUser(userId: string) {
  await identityClient.deleteUser({ communicationUserId: userId });
}
```

---

## Step 5: Update Live Class Controller

Update `backend/src/controllers/liveClassController.ts`:

```typescript
import { createUserAndToken } from '../services/azureCommunicationService';

/**
 * Generate Azure Communication Services token for joining session
 */
export const getACSJoinToken = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.userId;

    // Verify session exists
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        class: {
          include: {
            students: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if user is authorized
    const isTeacher = session.teacherId === userId;
    const isStudent = session.class.students.some((s) => s.userId === userId);

    if (!isTeacher && !isStudent) {
      return res.status(403).json({ error: 'Not authorized to join this session' });
    }

    // Check if user already has ACS identity
    let participant = await prisma.classParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId,
        },
      },
    });

    let acsUserId: string;
    let acsToken: string;

    if (participant?.acsUserId) {
      // Generate new token for existing user
      const tokenData = await generateACSToken(participant.acsUserId);
      acsToken = tokenData.token;
      acsUserId = participant.acsUserId;
    } else {
      // Create new ACS user and token
      const userData = await createUserAndToken();
      acsUserId = userData.userId;
      acsToken = userData.token;

      // Save ACS user ID
      participant = await prisma.classParticipant.upsert({
        where: {
          sessionId_userId: {
            sessionId,
            userId,
          },
        },
        update: {
          acsUserId,
          joinedAt: new Date(),
        },
        create: {
          sessionId,
          userId,
          acsUserId,
          role: isTeacher ? 'teacher' : 'student',
          joinedAt: new Date(),
        },
      });
    }

    // Update session status to LIVE if teacher joins
    if (isTeacher && session.status === 'SCHEDULED') {
      await prisma.classSession.update({
        where: { id: sessionId },
        data: {
          status: 'LIVE',
          actualStart: new Date(),
        },
      });
    }

    // Generate group call ID (room ID)
    const groupId = session.meetingId || `room-${sessionId}`;

    res.json({
      token: acsToken,
      userId: acsUserId,
      groupId,
      sessionId,
      isTeacher,
      displayName: (req as any).user?.fullName || 'User',
    });
  } catch (error) {
    console.error('Get ACS token error:', error);
    res.status(500).json({ error: 'Failed to generate access token' });
  }
};
```

---

## Step 6: Frontend Implementation

Create `frontend/src/pages/student/AzureLiveClassroom.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import {
  CallClient,
  CallAgent,
  Call,
  DeviceManager,
  VideoStreamRenderer,
  LocalVideoStream,
} from '@azure/communication-calling';
import { AzureCommunicationTokenCredential } from '@azure/communication-common';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Users, MessageSquare } from 'lucide-react';
import api from '../../utils/api';

interface AzureLiveClassroomProps {
  sessionId: string;
}

const AzureLiveClassroom: React.FC<AzureLiveClassroomProps> = ({ sessionId }) => {
  const [callClient, setCallClient] = useState<CallClient | null>(null);
  const [callAgent, setCallAgent] = useState<CallAgent | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [deviceManager, setDeviceManager] = useState<DeviceManager | null>(null);

  const [localVideoStream, setLocalVideoStream] = useState<LocalVideoStream | null>(null);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = React.useRef<HTMLDivElement>(null);

  // Initialize call client
  useEffect(() => {
    const client = new CallClient();
    setCallClient(client);

    return () => {
      leaveCall();
    };
  }, []);

  // Join call
  const joinCall = async () => {
    if (!callClient) return;

    try {
      // Get ACS token from backend
      const response = await api.get(`/live-classes/sessions/${sessionId}/acs-token`);
      const { token, userId, groupId, displayName } = response.data;

      // Create token credential
      const tokenCredential = new AzureCommunicationTokenCredential(token);

      // Create call agent
      const agent = await callClient.createCallAgent(tokenCredential, {
        displayName,
      });
      setCallAgent(agent);

      // Get device manager
      const devManager = await callClient.getDeviceManager();
      setDeviceManager(devManager);

      // Request permissions
      await devManager.askDevicePermission({ video: true, audio: true });

      // Get cameras and microphones
      const cameras = await devManager.getCameras();
      const microphones = await devManager.getMicrophones();

      // Create local video stream
      if (cameras.length > 0) {
        const videoStream = new LocalVideoStream(cameras[0]);
        setLocalVideoStream(videoStream);

        // Render local video
        if (localVideoRef.current) {
          const renderer = new VideoStreamRenderer(videoStream);
          const view = await renderer.createView();
          localVideoRef.current.appendChild(view.target);
        }
      }

      // Join the group call
      const groupCall = agent.join(
        { groupId },
        {
          videoOptions: localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined,
          audioOptions: { muted: false },
        }
      );

      setCall(groupCall);
      setIsVideoOn(true);
      setIsAudioOn(true);
      setIsJoined(true);

      // Set up event listeners
      groupCall.on('stateChanged', () => {
        console.log('Call state:', groupCall.state);
      });

      groupCall.on('remoteParticipantsUpdated', (e) => {
        e.added.forEach((participant) => {
          console.log('Participant joined:', participant.displayName);
          subscribeToParticipant(participant);
        });

        e.removed.forEach((participant) => {
          console.log('Participant left:', participant.displayName);
        });
      });

    } catch (err: any) {
      console.error('Failed to join call:', err);
      setError(err.message || 'Failed to join class');
    }
  };

  // Subscribe to remote participant
  const subscribeToParticipant = (participant: any) => {
    participant.on('videoStreamsUpdated', (e: any) => {
      e.added.forEach(async (stream: any) => {
        const renderer = new VideoStreamRenderer(stream);
        const view = await renderer.createView();
        // Append to DOM (implement grid layout)
        console.log('Remote video stream added');
      });
    });
  };

  // Toggle video
  const toggleVideo = async () => {
    if (!call || !localVideoStream) return;

    try {
      if (isVideoOn) {
        await call.stopVideo(localVideoStream);
      } else {
        await call.startVideo(localVideoStream);
      }
      setIsVideoOn(!isVideoOn);
    } catch (err) {
      console.error('Toggle video error:', err);
    }
  };

  // Toggle audio
  const toggleAudio = async () => {
    if (!call) return;

    try {
      if (isAudioOn) {
        await call.mute();
      } else {
        await call.unmute();
      }
      setIsAudioOn(!isAudioOn);
    } catch (err) {
      console.error('Toggle audio error:', err);
    }
  };

  // Leave call
  const leaveCall = async () => {
    if (call) {
      await call.hangUp();
    }
    if (callAgent) {
      await callAgent.dispose();
    }
    setIsJoined(false);
  };

  // Fetch session info
  useEffect(() => {
    const fetchSessionInfo = async () => {
      try {
        const response = await api.get(`/live-classes/sessions/${sessionId}`);
        setSessionInfo(response.data);
      } catch (err) {
        console.error('Failed to fetch session info:', err);
      }
    };

    fetchSessionInfo();
  }, [sessionId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Failed to Join Class</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold text-white mb-4">
            {sessionInfo?.title || 'Live Class'}
          </h2>
          <p className="text-gray-400 mb-2">
            {sessionInfo?.subject?.name} • {sessionInfo?.teacher?.fullName}
          </p>

          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div ref={localVideoRef} className="w-full h-64 bg-gray-700 rounded-lg mb-4" />
            <p className="text-gray-400 text-sm">Preview your camera</p>
          </div>

          <button
            onClick={joinCall}
            className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg"
          >
            Join Class
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{sessionInfo?.title}</h1>
          <p className="text-sm text-gray-400">
            {sessionInfo?.subject?.name} • {sessionInfo?.teacher?.fullName}
          </p>
        </div>
        <span className="px-3 py-1 bg-red-600 text-white text-sm rounded-full flex items-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Local Video */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
            <div ref={localVideoRef} className="w-full h-full" />
            <div className="absolute bottom-2 left-2 px-3 py-1 bg-black bg-opacity-50 text-white text-sm rounded">
              You
            </div>
            {!isVideoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                <VideoOff size={48} className="text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleAudio}
          className={`p-4 rounded-full ${
            isAudioOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isAudioOn ? <Mic size={24} className="text-white" /> : <MicOff size={24} className="text-white" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full ${
            isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {isVideoOn ? <Video size={24} className="text-white" /> : <VideoOff size={24} className="text-white" />}
        </button>

        <button
          onClick={leaveCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700"
        >
          <PhoneOff size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default AzureLiveClassroom;
```

---

## Step 7: Update Database Schema

Add to `ClassParticipant` model in `prisma/schema.prisma`:

```prisma
model ClassParticipant {
  // ... existing fields
  
  acsUserId   String?  // Azure Communication Services user ID
  
  // ... rest of fields
}
```

Run migration:

```bash
npx prisma migrate dev --name add_acs_user_id
```

---

## Pricing Comparison

### Azure Communication Services

**Group Video Calling**:
- $0.004/minute/participant
- No free tier
- Pay only for what you use

**Example: 500 students, 2 hours/week**:
```
Minutes per month: 500 × 2 × 60 × 4 = 240,000
Cost: 240,000 × $0.004 = $960/month
```

**Recording**:
- $0.002/minute
- Additional $240/month for recording

**Total**: ~$1,200/month

### Agora.io (for comparison)

**Video Calling**:
- $0.99/1000 minutes
- 10,000 free minutes/month

**Example: Same usage**:
```
Cost: (240,000 - 10,000) / 1000 × $0.99 = $227.70/month
```

### Recommendation

- **Small scale (< 100 students)**: Use **Agora.io** (free tier covers usage)
- **Medium scale (100-500 students)**: Use **Agora.io** ($200-300/month)
- **Enterprise (> 500 students)**: Use **Azure ACS** (better integration, compliance)
- **Already on Azure**: Use **Azure ACS** (unified billing, same region)

---

## Advanced Features

### 1. Microsoft Teams Interoperability

Students can join from Teams:

```typescript
// Enable Teams interop when creating call
const call = agent.join(
  { 
    meetingLink: 'https://teams.microsoft.com/l/meetup-join/...' 
  },
  options
);
```

### 2. Call Recording

```typescript
import { CallRecording } from '@azure/communication-calling';

// Start recording
const recording = await call.startRecording();

// Stop recording
await recording.stop();

// Get recording URL
const recordingUrl = recording.recordingUrl;
```

### 3. Screen Sharing

```typescript
// Start screen sharing
const screenStream = await call.startScreenSharing();

// Stop screen sharing
await call.stopScreenSharing();
```

### 4. PSTN Dial-in

Add phone number dial-in:

```typescript
// Get phone number from Azure
const phoneNumber = '+27-xxx-xxx-xxxx';

// Students can dial in
// Requires PSTN add-on
```

---

## Monitoring & Analytics

### Azure Monitor Integration

```typescript
import { ApplicationInsights } from '@azure/monitor-opentelemetry';

// Track call quality
const insights = new ApplicationInsights({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
});

insights.trackEvent({
  name: 'CallQuality',
  properties: {
    sessionId,
    duration,
    participants,
    quality: 'good',
  },
});
```

### Call Quality Metrics

```typescript
// Get call statistics
call.on('callStatsReported', (stats) => {
  console.log('Audio stats:', stats.audio);
  console.log('Video stats:', stats.video);
  console.log('Network stats:', stats.network);
});
```

---

## Security Best Practices

### 1. Token Expiration

```typescript
// Tokens expire after 24 hours by default
// Refresh before expiry
const tokenResponse = await identityClient.getToken(
  { communicationUserId: userId },
  ['voip', 'chat']
);

// Check expiry
if (tokenResponse.expiresOn < new Date(Date.now() + 3600000)) {
  // Refresh token
}
```

### 2. User Validation

```typescript
// Always validate user before generating token
const isAuthorized = await validateUserAccess(userId, sessionId);
if (!isAuthorized) {
  throw new Error('Unauthorized');
}
```

### 3. Rate Limiting

```typescript
// Limit token generation requests
import rateLimit from 'express-rate-limit';

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
});

router.get('/acs-token', tokenLimiter, getACSJoinToken);
```

---

## Troubleshooting

### Issue: "Failed to get device permissions"

**Solution**: Ensure HTTPS and check browser permissions

```typescript
// Check permissions
const permissions = await navigator.permissions.query({ name: 'camera' });
console.log('Camera permission:', permissions.state);
```

### Issue: "Token expired"

**Solution**: Implement token refresh

```typescript
// Refresh token before expiry
setInterval(async () => {
  const newToken = await api.get('/acs-token-refresh');
  // Update credential
}, 3600000); // Every hour
```

### Issue: "Poor call quality"

**Solution**: Adjust video quality

```typescript
const videoOptions = {
  localVideoStreams: [localVideoStream],
  videoConstraints: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
  },
};
```

---

## Next Steps

1. ✅ Create Azure Communication Services resource
2. ✅ Install SDKs
3. ✅ Implement token generation
4. ✅ Build frontend UI
5. 📊 Add call analytics
6. 🎥 Enable recording
7. 📱 Test on mobile
8. 🚀 Deploy to production

---

## Resources

- **Azure ACS Docs**: https://docs.microsoft.com/azure/communication-services/
- **Pricing Calculator**: https://azure.microsoft.com/pricing/calculator/
- **Samples**: https://github.com/Azure-Samples/communication-services-web-calling-tutorial
- **Support**: Azure Support Portal

---

**Your virtual classroom is now powered by Azure!** 🎓☁️
