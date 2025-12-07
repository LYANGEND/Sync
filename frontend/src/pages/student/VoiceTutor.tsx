import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader, Send, BookOpen } from 'lucide-react';
import api from '../../utils/api';

interface Message {
  id: string;
  role: 'student' | 'tutor';
  transcription: string;
  response?: string;
  audioUrl?: string;
  createdAt: Date;
}

interface VoiceTutorProps {
  topicId?: string;
  subjectId?: string;
}

const VoiceTutor: React.FC<VoiceTutorProps> = ({ topicId, subjectId }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [language, setLanguage] = useState('en');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Start session on mount
  useEffect(() => {
    startSession();
    return () => {
      if (sessionId) {
        endSession();
      }
    };
  }, []);

  const startSession = async () => {
    try {
      const response = await api.post('/voice-tutor/sessions/start', {
        topicId,
        subjectId,
        language,
      });

      setSessionId(response.data.sessionId);

      // Add welcome message
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'tutor',
        transcription: '',
        response: response.data.welcomeMessage,
        audioUrl: response.data.welcomeAudioUrl,
        createdAt: new Date(),
      };

      setMessages([welcomeMsg]);

      // Auto-play welcome message
      if (autoPlay && response.data.welcomeAudioUrl) {
        playAudio(response.data.welcomeAudioUrl);
      }
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Failed to start voice tutor session');
    }
  };

  const endSession = async () => {
    if (!sessionId) return;

    try {
      await api.post(`/voice-tutor/sessions/${sessionId}/end`);
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioMessage(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Microphone access denied. Please enable microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioMessage = async (audioBlob: Blob) => {
    if (!sessionId) return;

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('sessionId', sessionId);
      formData.append('language', language);

      const response = await api.post('/voice-tutor/sessions/message', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const newMessage: Message = {
        id: response.data.messageId,
        role: 'student',
        transcription: response.data.transcription,
        response: response.data.response,
        audioUrl: response.data.audioUrl,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, newMessage]);

      // Auto-play tutor response
      if (autoPlay && response.data.audioUrl) {
        playAudio(response.data.audioUrl);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to process your message. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => setIsSpeaking(false);
    audio.onerror = () => {
      setIsSpeaking(false);
      console.error('Failed to play audio');
    };

    audio.play().catch(err => {
      console.error('Audio playback error:', err);
      setIsSpeaking(false);
    });
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }
  };

  const explainCurrentLesson = async () => {
    if (!topicId) {
      alert('No topic selected');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await api.post('/voice-tutor/explain-lesson', {
        topicId,
        language,
      });

      const lessonMsg: Message = {
        id: `lesson-${Date.now()}`,
        role: 'tutor',
        transcription: '',
        response: response.data.explanation,
        audioUrl: response.data.audioUrl,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, lessonMsg]);

      if (autoPlay && response.data.audioUrl) {
        playAudio(response.data.audioUrl);
      }
    } catch (error) {
      console.error('Failed to explain lesson:', error);
      alert('Failed to explain lesson');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">AI Voice Tutor</h1>
          <p className="text-sm text-gray-600">Speak naturally, I'm here to help!</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="en">English</option>
            <option value="bem">Bemba</option>
            <option value="ny">Nyanja</option>
            <option value="toi">Tonga</option>
          </select>

          {/* Auto-play Toggle */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`p-2 rounded-lg ${autoPlay ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}
            title={autoPlay ? 'Auto-play ON' : 'Auto-play OFF'}
          >
            {autoPlay ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {/* Explain Lesson Button */}
          {topicId && (
            <button
              onClick={explainCurrentLesson}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <BookOpen size={20} />
              Explain Lesson
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            {/* Student message */}
            {msg.transcription && (
              <div className="flex justify-end">
                <div className="bg-blue-600 text-white rounded-lg px-4 py-3 max-w-md">
                  <p className="text-sm font-medium mb-1">You said:</p>
                  <p>{msg.transcription}</p>
                </div>
              </div>
            )}

            {/* Tutor response */}
            {msg.response && (
              <div className="flex justify-start">
                <div className="bg-white border rounded-lg px-4 py-3 max-w-2xl shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      AI
                    </div>
                    <p className="text-sm font-medium text-gray-700">Tutor</p>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{msg.response}</p>
                  
                  {/* Play audio button */}
                  {msg.audioUrl && (
                    <button
                      onClick={() => playAudio(msg.audioUrl!)}
                      className="mt-2 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700"
                    >
                      <Volume2 size={16} />
                      Play audio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-center">
            <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-2">
              <Loader className="animate-spin" size={20} />
              <span className="text-gray-600">Processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Recording Controls */}
      <div className="bg-white border-t p-6">
        <div className="max-w-md mx-auto">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={isProcessing || isSpeaking}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white rounded-full py-4 px-6 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Mic size={24} />
              <span className="font-medium">Hold to Speak</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-full flex items-center justify-center gap-3 bg-red-600 text-white rounded-full py-4 px-6 hover:bg-red-700 animate-pulse"
            >
              <MicOff size={24} />
              <span className="font-medium">Recording... Tap to Stop</span>
            </button>
          )}

          {isSpeaking && (
            <button
              onClick={stopAudio}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-gray-200 text-gray-700 rounded-lg py-2 px-4 hover:bg-gray-300"
            >
              <VolumeX size={20} />
              <span>Stop Audio</span>
            </button>
          )}

          <p className="text-center text-sm text-gray-500 mt-4">
            {isRecording
              ? 'Listening... Speak clearly'
              : isProcessing
              ? 'Processing your question...'
              : isSpeaking
              ? 'Tutor is speaking...'
              : 'Tap the button and ask your question'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default VoiceTutor;
