import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  MessageSquare,
  Hand,
  Settings,
} from 'lucide-react';
import api from '../../utils/api';

interface LiveClassroomProps {
  sessionId: string;
}

interface Participant {
  uid: number;
  name: string;
  isTeacher: boolean;
  videoTrack?: ICameraVideoTrack;
  audioTrack?: IMicrophoneAudioTrack;
}

const LiveClassroom: React.FC<LiveClassroomProps> = ({ sessionId }) => {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  
  const [participants, setParticipants] = useState<Map<number, Participant>>(new Map());
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLDivElement>(null);

  // Initialize Agora client
  useEffect(() => {
    const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    setClient(agoraClient);

    return () => {
      leaveChannel();
    };
  }, []);

  // Join channel
  const joinChannel = async () => {
    if (!client) return;

    try {
      // Get join token from backend
      const response = await api.get(`/live-classes/sessions/${sessionId}/join-token`);
      const { token, appId, channelName, uid, isTeacher } = response.data;

      // Join the channel
      await client.join(appId, channelName, token, uid);

      // Create local tracks
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      
      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      // Play local video
      if (localVideoRef.current) {
        videoTrack.play(localVideoRef.current);
      }

      // Publish tracks
      await client.publish([audioTrack, videoTrack]);

      setIsVideoOn(true);
      setIsAudioOn(true);
      setIsJoined(true);

      // Set up event listeners
      client.on('user-published', handleUserPublished);
      client.on('user-unpublished', handleUserUnpublished);
      client.on('user-left', handleUserLeft);

    } catch (err: any) {
      console.error('Failed to join channel:', err);
      setError(err.message || 'Failed to join class');
    }
  };

  // Handle remote user published
  const handleUserPublished = async (user: any, mediaType: 'audio' | 'video') => {
    await client?.subscribe(user, mediaType);

    if (mediaType === 'video') {
      setParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(user.uid) || {
          uid: user.uid,
          name: `User ${user.uid}`,
          isTeacher: false,
        };
        participant.videoTrack = user.videoTrack;
        updated.set(user.uid, participant);
        return updated;
      });
    }

    if (mediaType === 'audio') {
      user.audioTrack?.play();
      setParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(user.uid) || {
          uid: user.uid,
          name: `User ${user.uid}`,
          isTeacher: false,
        };
        participant.audioTrack = user.audioTrack;
        updated.set(user.uid, participant);
        return updated;
      });
    }
  };

  // Handle remote user unpublished
  const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
    if (mediaType === 'video') {
      setParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(user.uid);
        if (participant) {
          participant.videoTrack = undefined;
          updated.set(user.uid, participant);
        }
        return updated;
      });
    }
  };

  // Handle user left
  const handleUserLeft = (user: any) => {
    setParticipants((prev) => {
      const updated = new Map(prev);
      updated.delete(user.uid);
      return updated;
    });
  };

  // Toggle video
  const toggleVideo = async () => {
    if (localVideoTrack) {
      await localVideoTrack.setEnabled(!isVideoOn);
      setIsVideoOn(!isVideoOn);
    }
  };

  // Toggle audio
  const toggleAudio = async () => {
    if (localAudioTrack) {
      await localAudioTrack.setEnabled(!isAudioOn);
      setIsAudioOn(!isAudioOn);
    }
  };

  // Raise hand
  const toggleRaiseHand = () => {
    setIsHandRaised(!isHandRaised);
    // TODO: Send signal to teacher via RTM or backend
  };

  // Leave channel
  const leaveChannel = async () => {
    if (localVideoTrack) {
      localVideoTrack.stop();
      localVideoTrack.close();
    }
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
    }
    if (client) {
      await client.leave();
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
          <p className="text-gray-500 mb-8">
            {new Date(sessionInfo?.scheduledStart).toLocaleString()}
          </p>

          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div ref={localVideoRef} className="w-full h-64 bg-gray-700 rounded-lg mb-4" />
            <p className="text-gray-400 text-sm">Preview your camera</p>
          </div>

          <button
            onClick={joinChannel}
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
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-red-600 text-white text-sm rounded-full flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
          >
            <Users size={20} />
            {participants.size + 1}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Local Video */}
            <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
              <div ref={localVideoRef} className="w-full h-full" />
              <div className="absolute bottom-2 left-2 px-3 py-1 bg-black bg-opacity-50 text-white text-sm rounded">
                You {isHandRaised && '✋'}
              </div>
              {!isVideoOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                  <VideoOff size={48} className="text-gray-400" />
                </div>
              )}
            </div>

            {/* Remote Videos */}
            {Array.from(participants.values()).map((participant) => (
              <div
                key={participant.uid}
                className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
              >
                <div
                  id={`remote-video-${participant.uid}`}
                  className="w-full h-full"
                  ref={(el) => {
                    if (el && participant.videoTrack) {
                      participant.videoTrack.play(el);
                    }
                  }}
                />
                <div className="absolute bottom-2 left-2 px-3 py-1 bg-black bg-opacity-50 text-white text-sm rounded">
                  {participant.name}
                  {participant.isTeacher && ' (Teacher)'}
                </div>
                {!participant.videoTrack && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                    <VideoOff size={48} className="text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="font-semibold text-white">Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Chat messages */}
              <p className="text-gray-500 text-center">No messages yet</p>
            </div>
            <div className="p-4 border-t border-gray-700">
              <input
                type="text"
                placeholder="Type a message..."
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 px-6 py-4 flex items-center justify-center gap-4">
        <button
          onClick={toggleAudio}
          className={`p-4 rounded-full ${
            isAudioOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          }`}
          title={isAudioOn ? 'Mute' : 'Unmute'}
        >
          {isAudioOn ? <Mic size={24} className="text-white" /> : <MicOff size={24} className="text-white" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full ${
            isVideoOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'
          }`}
          title={isVideoOn ? 'Stop Video' : 'Start Video'}
        >
          {isVideoOn ? <Video size={24} className="text-white" /> : <VideoOff size={24} className="text-white" />}
        </button>

        <button
          onClick={toggleRaiseHand}
          className={`p-4 rounded-full ${
            isHandRaised ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title="Raise Hand"
        >
          <Hand size={24} className="text-white" />
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className="p-4 rounded-full bg-gray-700 hover:bg-gray-600"
          title="Chat"
        >
          <MessageSquare size={24} className="text-white" />
        </button>

        <button
          onClick={leaveChannel}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700"
          title="Leave Class"
        >
          <PhoneOff size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
};

export default LiveClassroom;
