import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Bot,
  Play, Square, SkipForward, Volume2, Send, ArrowLeft,
  Users, Brain, HelpCircle, Loader2, ChevronRight,
  Sparkles, GraduationCap, X, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { PageHeader } from '../../components/ui/DesignSystem';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  senderName: string;
  isAI: boolean;
  message: string;
  createdAt: string;
  audio?: string | null;
  audioContentType?: string | null;
  voiceOnly?: boolean;
}

interface ClassroomData {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  jitsiDomain: string;
  status: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  aiTutorEnabled: boolean;
  aiTutorName: string;
  aiTutorVoiceId: string | null;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  lessonRuntime?: LessonRuntime | null;
  chatMessages: ChatMessage[];
  participants: any[];
  tutorSessions: any[];
}

interface LessonRuntimeSegment {
  index: number;
  phase: string;
  title: string;
  durationMinutes: number;
  startMinute: number;
  endMinute: number;
  objectives: string[];
  talkingPoints: string[];
}

interface LessonRuntime {
  title: string;
  source: 'SYLLABUS' | 'TEXT' | 'FALLBACK';
  totalDurationMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  progress: number;
  isWrapUpWindow: boolean;
  currentSegment: LessonRuntimeSegment | null;
  nextSegment: LessonRuntimeSegment | null;
  currentSegmentElapsedMinutes: number;
  currentSegmentRemainingMinutes: number;
  currentSegmentProgress: number;
  tutorPhase?: string | null;
  tutorCurrentTopic?: string | null;
  segments: LessonRuntimeSegment[];
}

interface TutorState {
  active: boolean;
  sessionId: string | null;
  phase: string;
  currentTopic?: string | null;
  suggestedActions: string[];
  loading: boolean;
  mode: 'LEAD_TEACHER' | 'CO_TEACHER';
}

interface ClassroomUpdatedPayload {
  classroomId?: string;
  reason?: string;
  status?: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  lessonRuntime?: LessonRuntime | null;
  tutorState?: {
    active: boolean;
    sessionId: string | null;
    phase?: string | null;
    currentTopic?: string | null;
  } | null;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

interface ClassroomAIMessagePayload {
  classroomId?: string;
  id?: string;
  senderName?: string;
  isAI?: boolean;
  message?: string;
  createdAt?: string;
  emittedAt?: string;
  audio?: string | null;
  audioContentType?: string | null;
  phase?: string | null;
  currentTopic?: string | null;
  messageType?: string | null;
  voiceOnly?: boolean;
}

const SOCKET_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

function getSuggestedActionsForPhase(phase: string): string[] {
  switch (phase) {
    case 'GREETING':
      return ['Take Attendance', 'Skip to Teaching', 'Start Recap'];
    case 'ATTENDANCE':
      return ['Start Recap', 'Skip to Teaching'];
    case 'RECAP':
      return ['Start Teaching', 'Quick Quiz'];
    case 'TEACHING':
      return ['Ask Class a Question', 'Quick Quiz', 'Open Q&A', 'Activity Time'];
    case 'Q_AND_A':
      return ['Continue Teaching', 'Quick Quiz', 'Activity Time', 'Wrap Up'];
    case 'ACTIVITY':
      return ['Continue Teaching', 'Open Q&A', 'Wrap Up'];
    case 'WRAP_UP':
      return ['End Class', 'One More Question', 'Back to Teaching'];
    default:
      return ['Continue Teaching', 'Quick Quiz', 'Wrap Up'];
  }
}

function getParticipantRole(userRole?: string) {
  if (userRole === 'STUDENT') return 'STUDENT';
  if (userRole === 'TEACHER' || userRole === 'SUPER_ADMIN') return 'TEACHER';
  return 'OBSERVER';
}

export default function VirtualClassroom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [classroom, setClassroom] = useState<ClassroomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Jitsi state
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // AI Tutor state
  const [tutor, setTutor] = useState<TutorState>({
    active: false,
    sessionId: null,
    phase: 'GREETING',
    suggestedActions: [],
    loading: false,
    mode: 'CO_TEACHER',
  });

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Panel state
  const [activePanel, setActivePanel] = useState<'chat' | 'tutor' | 'participants' | null>('chat');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedAudioMessageIdsRef = useRef<Set<string>>(new Set());
  const [endingClass, setEndingClass] = useState(false);
  const classroomStatusRef = useRef('');
  classroomStatusRef.current = classroom?.status || '';

  const mergeChatMessages = useCallback((incoming: ChatMessage[], existing: ChatMessage[]) => {
    return incoming.map((message) => {
      const cachedMessage = existing.find((existingMessage) => existingMessage.id === message.id);
      if (!cachedMessage) {
        return message;
      }

      return {
        ...message,
        audio: message.audio ?? cachedMessage.audio ?? null,
        audioContentType: message.audioContentType ?? cachedMessage.audioContentType ?? null,
      };
    });
  }, []);

  const upsertChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((previousMessages) => {
      const existingIndex = previousMessages.findIndex((existingMessage) => existingMessage.id === message.id);
      if (existingIndex === -1) {
        return [...previousMessages, message];
      }

      const updatedMessages = [...previousMessages];
      updatedMessages[existingIndex] = {
        ...updatedMessages[existingIndex],
        ...message,
        audio: message.audio ?? updatedMessages[existingIndex].audio ?? null,
        audioContentType: message.audioContentType ?? updatedMessages[existingIndex].audioContentType ?? null,
        voiceOnly: message.voiceOnly ?? updatedMessages[existingIndex].voiceOnly ?? false,
      };
      return updatedMessages;
    });
  }, []);

  const playAudio = useCallback((base64Audio: string, contentType?: string) => {
    try {
      const byteCharacters = atob(base64Audio);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: contentType || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      setAudioPlaying(true);

      audio.onended = () => {
        setAudioPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setAudioPlaying(false);
        URL.revokeObjectURL(url);
      };

      audio.play().catch(console.error);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  const playMessageAudioOnce = useCallback((messageId: string, base64Audio: string, contentType?: string | null) => {
    const playedMessageIds = playedAudioMessageIdsRef.current;
    if (playedMessageIds.has(messageId)) {
      return;
    }

    playedMessageIds.add(messageId);
    if (playedMessageIds.size > 300) {
      const oldestMessageId = playedMessageIds.values().next().value;
      if (oldestMessageId) {
        playedMessageIds.delete(oldestMessageId);
      }
    }

    playAudio(base64Audio, contentType || undefined);
  }, [playAudio]);

  // ==========================================
  // LOAD CLASSROOM DATA
  // ==========================================
  const fetchClassroom = useCallback(async (options: { silent?: boolean } = {}) => {
    const { silent = false } = options;

    try {
      if (!silent) {
        setLoading(true);
      }

      const res = await api.get(`/virtual-classroom/${id}`);
      const data = res.data;
      setClassroom(data);
      setChatMessages((previousMessages) => mergeChatMessages(data.chatMessages || [], previousMessages));

      const activeSession = data.tutorSessions?.find((session: any) => session.status === 'ACTIVE');

      if (activeSession) {
        setTutor({
          active: true,
          sessionId: activeSession.id,
          phase: activeSession.lessonPhase || 'TEACHING',
          currentTopic: activeSession.currentTopic || data.lessonRuntime?.tutorCurrentTopic || null,
          suggestedActions: getSuggestedActionsForPhase(activeSession.lessonPhase || 'TEACHING'),
          loading: false,
        });
      } else {
        setTutor(prev => ({
          ...prev,
          active: false,
          sessionId: null,
          phase: 'GREETING',
          currentTopic: data.lessonRuntime?.tutorCurrentTopic || null,
          suggestedActions: [],
          loading: false,
        }));
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.response?.data?.error || err.message);
      } else {
        console.error('Silent classroom refresh error:', err);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [id, mergeChatMessages]);

  useEffect(() => {
    if (!id) return;
    fetchClassroom();
  }, [id, fetchClassroom]);

  useEffect(() => {
    if (!id) return;

    const intervalId = window.setInterval(() => {
      fetchClassroom({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [id, fetchClassroom]);

  useEffect(() => {
    if (!id) return;

    const socket = io(SOCKET_BASE, {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_classroom', id);
    });

    socket.on('classroom_updated', (payload: ClassroomUpdatedPayload) => {
      if (payload?.classroomId && payload.classroomId !== id) {
        return;
      }

      const hasRealtimePayload = Boolean(payload.lessonRuntime || payload.status || payload.tutorState);
      if (hasRealtimePayload) {
        setClassroom(prev => prev ? ({
          ...prev,
          status: payload.status || prev.status,
          actualStart: payload.actualStart ?? prev.actualStart,
          actualEnd: payload.actualEnd ?? prev.actualEnd,
          lessonRuntime: payload.lessonRuntime ?? prev.lessonRuntime,
        }) : prev);

        if (payload.tutorState) {
          const nextPhase = payload.tutorState.phase || payload.lessonRuntime?.tutorPhase || 'GREETING';
          setTutor(prev => ({
            ...prev,
            active: payload.tutorState?.active ?? prev.active,
            sessionId: payload.tutorState?.sessionId ?? prev.sessionId,
            phase: nextPhase,
            currentTopic: payload.tutorState?.currentTopic ?? payload.lessonRuntime?.tutorCurrentTopic ?? prev.currentTopic,
            suggestedActions: payload.tutorState?.active ? getSuggestedActionsForPhase(nextPhase) : [],
            loading: false,
          }));
        }
      }

      const shouldFetchDetails = !hasRealtimePayload || [
        'participant_joined',
        'participant_left',
        'ai_tutor_chat',
        'ai_tutor_quiz',
        'ai_tutor_speak',
      ].includes(payload.reason || '');

      if (shouldFetchDetails) {
        fetchClassroom({ silent: true });
      }
    });

    socket.on('classroom_ai_message', (payload: ClassroomAIMessagePayload) => {
      if (payload?.classroomId && payload.classroomId !== id) {
        return;
      }

      if (!payload?.message || !payload.senderName) {
        return;
      }

      const messageId = payload.id || `socket-ai-${Date.now()}`;

      upsertChatMessage({
        id: messageId,
        senderName: payload.senderName,
        isAI: payload.isAI ?? true,
        message: payload.message,
        createdAt: payload.createdAt || payload.emittedAt || new Date().toISOString(),
        audio: payload.audio ?? null,
        audioContentType: payload.audioContentType ?? null,
        voiceOnly: payload.voiceOnly ?? false,
      });

      if (payload.phase || payload.currentTopic !== undefined) {
        setTutor((previousTutor) => ({
          ...previousTutor,
          active: true,
          phase: payload.phase || previousTutor.phase || 'GREETING',
          currentTopic: payload.currentTopic ?? previousTutor.currentTopic,
          suggestedActions: getSuggestedActionsForPhase(payload.phase || previousTutor.phase || 'GREETING'),
          loading: false,
        }));
      }

      if (payload.audio) {
        playMessageAudioOnce(messageId, payload.audio, payload.audioContentType);
      }
    });

    return () => {
      socket.emit('leave_classroom', id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id, fetchClassroom, playMessageAudioOnce, upsertChatMessage]);

  // ==========================================
  // JITSI MEET INTEGRATION
  // ==========================================
  useEffect(() => {
    if (!classroom || loading || classroom.status !== 'LIVE') return;

    // Load Jitsi External API script
    const domain = classroom.jitsiDomain || 'meet.jit.si';
    const script = document.createElement('script');
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => setJitsiLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Jitsi API');
      setJitsiLoaded(true); // Continue without Jitsi
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [classroom, loading]);

  useEffect(() => {
    if (!jitsiLoaded || !classroom || classroom.status !== 'LIVE' || !jitsiContainerRef.current || jitsiApiRef.current) return;
    if (!window.JitsiMeetExternalAPI) return;

    const domain = classroom.jitsiDomain || 'meet.jit.si';

    try {
      const jitsiApi = new window.JitsiMeetExternalAPI(domain, {
        roomName: classroom.roomName,
        parentNode: jitsiContainerRef.current,
        width: '100%',
        height: '100%',
        configOverwrite: {
          startWithAudioMuted: true,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          toolbarButtons: [
            'microphone', 'camera', 'desktop', 'chat', 'raisehand',
            'participants-pane', 'tileview', 'fullscreen', 'hangup',
          ],
          disableThirdPartyRequests: true,
          enableClosePage: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#1a1a2e',
          TOOLBAR_ALWAYS_VISIBLE: true,
          DISABLE_PRESENCE_STATUS: true,
        },
        userInfo: {
          displayName: user?.fullName || 'Student',
          email: user?.email || '',
        },
      });

      // Event handlers
      jitsiApi.addEventListener('videoConferenceJoined', () => {
        api.post(`/virtual-classroom/${classroom.id}/participants`, {
          action: 'join',
          displayName: user?.fullName || 'Student',
          userId: user?.id,
          role: getParticipantRole(user?.role),
        }).catch(console.error);
      });

      jitsiApi.addEventListener('videoConferenceLeft', () => {
        api.post(`/virtual-classroom/${classroom.id}/participants`, {
          action: 'leave',
          displayName: user?.fullName || 'Student',
        }).catch(console.error);
      });

      jitsiApi.addEventListener('readyToClose', () => {
        if (classroomStatusRef.current !== 'ENDED') {
          navigate('/virtual-classroom');
        }
      });

      jitsiApiRef.current = jitsiApi;
    } catch (err) {
      console.error('Jitsi init error:', err);
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [jitsiLoaded, classroom]);

  // ==========================================
  // AI TUTOR CONTROLS
  // ==========================================
  // AI Tutor mode selection
  const [selectedMode, setSelectedMode] = useState<'LEAD_TEACHER' | 'CO_TEACHER'>('LEAD_TEACHER');

  const startAITutor = async () => {
    if (!classroom) return;
    setTutor(prev => ({ ...prev, loading: true }));

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/start`, {
        mode: selectedMode,
      });
      const data = res.data;
      const useRealtimeAI = Boolean(socketRef.current?.connected);

      setTutor({
        active: true,
        sessionId: data.sessionId,
        phase: data.greeting.phase,
        currentTopic: classroom.lessonRuntime?.tutorCurrentTopic || null,
        suggestedActions: data.greeting.suggestedActions || [],
        loading: false,
        mode: data.mode || selectedMode,
      });

      if (!useRealtimeAI) {
        const messageId = `greeting-${Date.now()}`;
        upsertChatMessage({
          id: messageId,
          senderName: classroom.aiTutorName,
          isAI: true,
          message: data.greeting.text,
          createdAt: new Date().toISOString(),
          audio: data.greeting.audio || null,
          audioContentType: data.greeting.audioContentType || null,
        });

        if (data.greeting.audio) {
          playMessageAudioOnce(messageId, data.greeting.audio, data.greeting.audioContentType);
        }
      }

    } catch (err: any) {
      console.error('Start AI Tutor error:', err);
      setTutor(prev => ({ ...prev, loading: false }));
      setError(err.response?.data?.error || err.message);
    }
  };

  const stopAITutor = async () => {
    if (!classroom || !tutor.sessionId) return;
    setTutor(prev => ({ ...prev, loading: true }));

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/stop`, {
        sessionId: tutor.sessionId,
      });
      const data = res.data;

      setTutor({
        active: false,
        sessionId: null,
        phase: 'GREETING',
        currentTopic: null,
        suggestedActions: [],
        loading: false,
        mode: 'CO_TEACHER',
      });

      // Show summary in chat
      if (data.summary) {
        setChatMessages(prev => [...prev, {
          id: Date.now().toString(),
          senderName: 'System',
          isAI: true,
          message: `📋 Class Summary:\n${data.summary}`,
          createdAt: new Date().toISOString(),
        }]);
      }
    } catch (err: any) {
      console.error('Stop AI Tutor error:', err);
      setTutor(prev => ({ ...prev, loading: false }));
    }
  };

  const endClassSession = async () => {
    if (!classroom) return;
    setEndingClass(true);

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/end`);
      const data = res.data;

      setTutor({
        active: false,
        sessionId: null,
        phase: 'WRAP_UP',
        currentTopic: null,
        suggestedActions: [],
        loading: false,
        mode: 'CO_TEACHER',
      });

      setActivePanel('chat');
      setClassroom(prev => prev ? {
        ...prev,
        status: data.status || 'ENDED',
        actualEnd: data.actualEnd || new Date().toISOString(),
      } : prev);

      await fetchClassroom({ silent: true });
    } catch (err: any) {
      console.error('End classroom error:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setEndingClass(false);
    }
  };

  // ==========================================
  // CHAT WITH AI TUTOR
  // ==========================================
  const sendMessage = async () => {
    if (!chatInput.trim() || !tutor.active || !tutor.sessionId || !classroom) return;

    const msg = chatInput.trim();
    setChatInput('');
    setChatSending(true);

    // Add user message immediately
    setChatMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      senderName: user?.fullName || 'Student',
      isAI: false,
      message: msg,
      createdAt: new Date().toISOString(),
    }]);

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/chat`, {
        sessionId: tutor.sessionId,
        studentName: user?.fullName || 'Student',
        message: msg,
      });
      const data = res.data;
      const useRealtimeAI = Boolean(socketRef.current?.connected);

      if (!useRealtimeAI) {
        const messageId = `ai-${Date.now()}`;
        upsertChatMessage({
          id: messageId,
          senderName: classroom.aiTutorName,
          isAI: true,
          message: data.text,
          createdAt: new Date().toISOString(),
          audio: data.audio || null,
          audioContentType: data.audioContentType || null,
        });

        if (data.audio) {
          playMessageAudioOnce(messageId, data.audio, data.audioContentType);
        }
      }

      // Update phase
      if (data.phase) {
        setTutor(prev => ({
          ...prev,
          phase: data.phase,
          currentTopic: classroom.lessonRuntime?.tutorCurrentTopic || prev.currentTopic,
          suggestedActions: data.suggestedActions || prev.suggestedActions,
        }));
      }

    } catch (err: any) {
      console.error('Chat error:', err);
    } finally {
      setChatSending(false);
    }
  };

  const advancePhase = async () => {
    if (!tutor.sessionId || !classroom) return;
    setTutor(prev => ({ ...prev, loading: true }));

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/advance-phase`, {
        sessionId: tutor.sessionId,
      });
      const data = res.data;
      const useRealtimeAI = Boolean(socketRef.current?.connected);

      if (!useRealtimeAI) {
        const messageId = `ai-${Date.now()}`;
        upsertChatMessage({
          id: messageId,
          senderName: classroom.aiTutorName,
          isAI: true,
          message: data.text,
          createdAt: new Date().toISOString(),
          audio: data.audio || null,
          audioContentType: data.audioContentType || null,
        });

        if (data.audio) {
          playMessageAudioOnce(messageId, data.audio, data.audioContentType);
        }
      }

      setTutor(prev => ({
        ...prev,
        phase: data.phase,
        currentTopic: classroom.lessonRuntime?.tutorCurrentTopic || prev.currentTopic,
        suggestedActions: data.suggestedActions || [],
        loading: false,
      }));
    } catch (err: any) {
      console.error('Advance phase error:', err);
      setTutor(prev => ({ ...prev, loading: false }));
    }
  };

  const launchQuiz = async () => {
    if (!tutor.sessionId || !classroom) return;

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/quiz`, {
        sessionId: tutor.sessionId,
      });
      const data = res.data;
      const useRealtimeAI = Boolean(socketRef.current?.connected);

      if (!useRealtimeAI) {
        const messageId = `ai-${Date.now()}`;
        upsertChatMessage({
          id: messageId,
          senderName: classroom.aiTutorName,
          isAI: true,
          message: data.text,
          createdAt: new Date().toISOString(),
          audio: data.audio || null,
          audioContentType: data.audioContentType || null,
        });

        if (data.audio) {
          playMessageAudioOnce(messageId, data.audio, data.audioContentType);
        }
      }
    } catch (err: any) {
      console.error('Quiz error:', err);
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="ds-page flex items-center justify-center min-h-[400px]" role="status" aria-label="Loading virtual classroom">
        <Loader2 className="w-8 h-8 text-[var(--action-color)] animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="ds-page">
        <PageHeader title="Virtual Classroom" />
        <div className="ds-card flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-300 mb-4" aria-hidden="true" />
        <p className="text-lg" role="alert">{error || 'Classroom not found'}</p>
        <button onClick={() => navigate('/virtual-classroom')} className="ds-button-primary mt-4">
          Back to Classrooms
        </button>
        </div>
      </div>
    );
  }

  const isTeacherOrAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER';
  const phaseLabel = tutor.phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const lessonRuntime = classroom.lessonRuntime;
  const currentSegment = lessonRuntime?.currentSegment || null;
  const nextSegment = lessonRuntime?.nextSegment || null;
  const currentSegmentPhaseLabel = currentSegment?.phase
    ? currentSegment.phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;

  return (
    <div className="ds-page">
    {/* Keep the live media workspace dark independently of the surrounding app theme. */}
    <div className="dark flex h-[calc(100vh-64px)] bg-gray-900 text-white overflow-hidden">
      {/* ==========================================
          MAIN CONTENT — Jitsi Video
          ========================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="p-4 bg-[var(--surface)] border-b border-[var(--border-color)]">
          <PageHeader title={classroom.title}
            breadcrumb={<button onClick={() => navigate('/virtual-classroom')} className="ds-button-ghost">
              <ArrowLeft size={20} aria-hidden="true" /> Classrooms
            </button>}
            description={<>
                {classroom.subjectName && `${classroom.subjectName} • `}
                {classroom.className && `${classroom.className} • `}
                <span className={`ds-badge ${classroom.status === 'LIVE' ? 'ds-badge-success' : 'ds-badge-neutral'}`}>
                  {classroom.status}
                </span>
            </>}
            actions={<>
            {/* AI Tutor indicator */}
            {tutor.active && (
              <div className="ds-badge ds-badge-info flex-wrap">
                <Brain size={14} aria-hidden="true" />
                <span>{classroom.aiTutorName}</span>
                <span>• {phaseLabel}</span>
                <span className="ds-badge ds-badge-neutral ml-1">
                  {tutor.mode === 'LEAD_TEACHER' ? 'Lead' : 'Co-teach'}
                </span>
              </div>
            )}

            {lessonRuntime && currentSegment && (
              <div className="ds-badge ds-badge-info hidden lg:flex">
                <span>{currentSegment.title}</span>
                <span aria-hidden="true">•</span>
                <span>{lessonRuntime.currentSegmentRemainingMinutes}m left</span>
              </div>
            )}

            {audioPlaying && (
              <div className="ds-badge ds-badge-success" role="status">
                <Volume2 size={14} className="animate-pulse" aria-hidden="true" />
                <span>Speaking...</span>
              </div>
            )}

            {isTeacherOrAdmin && classroom.status === 'LIVE' && (
              <button
                onClick={endClassSession}
                disabled={endingClass}
                className="ds-button-destructive"
                aria-busy={endingClass || undefined}
              >
                {endingClass ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                End Class
              </button>
            )}

            {/* Panel toggles */}
            <button
              onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
              className={activePanel === 'chat' ? 'ds-button-primary' : 'ds-button-secondary'}
              aria-label="AI tutor chat"
              aria-expanded={activePanel === 'chat'}
              aria-controls={activePanel === 'chat' ? 'classroom-side-panel' : undefined}
            >
              <MessageSquare size={18} />
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'tutor' ? null : 'tutor')}
              className={activePanel === 'tutor' ? 'ds-button-primary' : 'ds-button-secondary'}
              aria-label="AI tutor controls"
              aria-expanded={activePanel === 'tutor'}
              aria-controls={activePanel === 'tutor' ? 'classroom-side-panel' : undefined}
            >
              <Bot size={18} />
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'participants' ? null : 'participants')}
              className={activePanel === 'participants' ? 'ds-button-primary' : 'ds-button-secondary'}
              aria-label="Participants"
              aria-expanded={activePanel === 'participants'}
              aria-controls={activePanel === 'participants' ? 'classroom-side-panel' : undefined}
            >
              <Users size={18} />
            </button>
            </>}
          />
        </div>

        {/* Jitsi Video Area */}
        <div ref={jitsiContainerRef} className="flex-1 min-h-0 bg-black" role="region" aria-label="Live classroom video" />
      </div>

      {/* ==========================================
          SIDE PANEL
          ========================================== */}
      {activePanel && (
        <div id="classroom-side-panel" role="region" aria-labelledby="classroom-panel-title" className="w-80 lg:w-96 flex flex-col bg-[var(--surface)] border-l border-[var(--border-color)]">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h2 id="classroom-panel-title" className="font-semibold text-sm flex items-center gap-2">
              {activePanel === 'chat' && <><MessageSquare size={16} /> AI Tutor Chat</>}
              {activePanel === 'tutor' && <><Brain size={16} className="text-purple-400" /> AI Tutor Controls</>}
              {activePanel === 'participants' && <><Users size={16} className="text-green-400" /> Participants</>}
            </h2>
            <button onClick={() => setActivePanel(null)} className="ds-button-ghost" aria-label="Close classroom panel">
              <X size={16} />
            </button>
          </div>

          {/* ==========================================
              CHAT PANEL
              ========================================== */}
          {activePanel === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3" role="log" aria-label="AI tutor conversation" aria-live="polite" aria-relevant="additions" tabIndex={0}>
                {chatMessages.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <Bot size={40} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Start the AI Tutor to begin the class conversation</p>
                  </div>
                )}

                {chatMessages.map((msg) => {
                  // Voice-only messages show as a small indicator, not a full chat bubble
                  if (msg.voiceOnly && msg.isAI) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-900/20 rounded-full text-[11px] text-purple-400">
                          <Volume2 size={11} className="animate-pulse" />
                          <span>{msg.senderName} is speaking...</span>
                          {msg.audio && (
                            <button
                              onClick={() => playAudio(msg.audio!, msg.audioContentType || 'audio/mpeg')}
                              className="ds-button-secondary ml-1"
                              aria-label={`Replay voice message from ${msg.senderName}`}
                            >
                              Replay
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isAI ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        msg.isAI
                          ? 'bg-purple-900/40 border border-purple-800/50'
                          : 'bg-blue-600'
                      }`}>
                        <p className={`text-[10px] font-medium mb-0.5 ${
                          msg.isAI ? 'text-purple-300' : 'text-blue-200'
                        }`}>
                          {msg.isAI && <Bot size={10} className="inline mr-1" />}
                          {msg.senderName}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        {msg.audio && (
                          <button
                            onClick={() => playAudio(msg.audio!, msg.audioContentType || 'audio/mpeg')}
                            className="ds-button-secondary mt-1"
                            aria-label={`Play voice message from ${msg.senderName}`}
                          >
                            <Volume2 size={12} /> Play voice
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              {tutor.active && (
                <div className="p-3 border-t border-gray-700">
                  <div className="flex gap-2">
                    <input
                      aria-label="Message to the AI teacher"
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Ask the AI teacher..."
                      className="ds-input flex-1"
                      disabled={chatSending}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={chatSending || !chatInput.trim()}
                      className="ds-button-primary"
                      aria-label="Send message"
                      aria-busy={chatSending || undefined}
                    >
                      {chatSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Start tutor prompt */}
              {!tutor.active && isTeacherOrAdmin && (
                <div className="p-3 border-t border-gray-700">
                  <button
                    onClick={startAITutor}
                    disabled={tutor.loading}
                    className="ds-button-primary w-full"
                    aria-busy={tutor.loading || undefined}
                  >
                    {tutor.loading ? (
                      <><Loader2 size={16} className="animate-spin" /> Starting AI Tutor...</>
                    ) : (
                      <><Sparkles size={16} /> Start AI Tutor</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==========================================
              AI TUTOR CONTROLS PANEL
              ========================================== */}
          {activePanel === 'tutor' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Status */}
              <div className="ds-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <GraduationCap size={16} className={tutor.active ? 'text-purple-400' : 'text-gray-400'} />
                    {classroom.aiTutorName}
                  </h3>
                  <span className={`ds-badge ${
                    tutor.active ? 'ds-badge-success' : 'ds-badge-neutral'
                  }`}>
                    {tutor.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {tutor.active && (
                  <div className="text-xs text-gray-400">
                    Phase: <span className="text-purple-300 font-medium">{phaseLabel}</span>
                  </div>
                )}
              </div>

              {/* Start/Stop */}
              {isTeacherOrAdmin && (
                <div>
                  {!tutor.active ? (
                    <div className="space-y-3">
                      {/* Mode selector */}
                      <div>
                        <h4 className="text-xs text-gray-400 mb-2 uppercase">Teaching Mode</h4>
                        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Teaching mode">
                          <button
                            onClick={() => setSelectedMode('LEAD_TEACHER')}
                            className={`${selectedMode === 'LEAD_TEACHER' ? 'ds-button-primary' : 'ds-button-outline'} flex-col`}
                            aria-pressed={selectedMode === 'LEAD_TEACHER'}
                          >
                            <GraduationCap size={16} className="mx-auto mb-1" />
                            Lead Teacher
                            <span className="text-xs mt-1">AI runs the whole class</span>
                          </button>
                          <button
                            onClick={() => setSelectedMode('CO_TEACHER')}
                            className={`${selectedMode === 'CO_TEACHER' ? 'ds-button-primary' : 'ds-button-outline'} flex-col`}
                            aria-pressed={selectedMode === 'CO_TEACHER'}
                          >
                            <Users size={16} className="mx-auto mb-1" />
                            Co-Teacher
                            <span className="text-xs mt-1">AI assists you</span>
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={startAITutor}
                        disabled={tutor.loading}
                        className="ds-button-primary w-full"
                        aria-busy={tutor.loading || undefined}
                      >
                        {tutor.loading ? (
                          <><Loader2 size={18} className="animate-spin" /> Starting...</>
                        ) : (
                          <><Play size={18} /> Start as {selectedMode === 'LEAD_TEACHER' ? 'Lead Teacher' : 'Co-Teacher'}</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Mode badge */}
                      <div className="ds-badge ds-badge-info w-full justify-center">
                        {tutor.mode === 'LEAD_TEACHER' ? 'Leading class autonomously' : 'Co-teaching with you'}
                      </div>

                      {/* Only show manual controls in CO_TEACHER mode */}
                      {tutor.mode === 'CO_TEACHER' && (
                        <button
                          onClick={advancePhase}
                          disabled={tutor.loading}
                          className="ds-button-primary w-full"
                        >
                          <SkipForward size={16} /> Next Phase
                        </button>
                      )}

                      <button
                        onClick={launchQuiz}
                        className="ds-button-outline w-full"
                      >
                        <HelpCircle size={16} /> Quick Quiz
                      </button>

                      <button
                        onClick={stopAITutor}
                        disabled={tutor.loading}
                        className="ds-button-destructive w-full"
                      >
                        <Square size={16} /> End AI Tutor
                      </button>

                      <button
                        onClick={endClassSession}
                        disabled={endingClass}
                        className="ds-button-destructive w-full"
                        aria-busy={endingClass || undefined}
                      >
                        {endingClass ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
                        End Class
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Actions — only in CO_TEACHER mode */}
              {tutor.active && tutor.mode === 'CO_TEACHER' && tutor.suggestedActions.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-400 mb-2 uppercase">Suggested Actions</h4>
                  <div className="space-y-1">
                    {tutor.suggestedActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          if (action.includes('Quiz')) launchQuiz();
                          else if (action.includes('Next') || action.includes('Continue') || action.includes('Start') || action.includes('Skip') || action.includes('Open') || action.includes('Wrap') || action.includes('Back')) advancePhase();
                        }}
                        className="ds-button-secondary w-full justify-start text-left"
                      >
                        <ChevronRight size={14} className="text-purple-400" />
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {lessonRuntime && currentSegment && (
                <div className="ds-card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-xs text-blue-300 uppercase tracking-wide">Current Segment</h4>
                      <p className="text-sm font-medium text-white mt-1">{currentSegment.title}</p>
                      {currentSegmentPhaseLabel && (
                        <p className="text-xs text-blue-200/80 mt-1">{currentSegmentPhaseLabel}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-blue-200">{lessonRuntime.currentSegmentRemainingMinutes}m</p>
                      <p className="text-[11px] text-blue-300/70">remaining</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-blue-200/80 mb-1">
                      <span>Segment progress</span>
                      <span>{lessonRuntime.currentSegmentElapsedMinutes}/{currentSegment.durationMinutes} min</span>
                    </div>
                    <div className="h-2 rounded-full bg-blue-950/70 overflow-hidden">
                      <div
                        className="h-full bg-blue-400"
                        style={{ width: `${Math.round(lessonRuntime.currentSegmentProgress * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                      <span>Overall lesson</span>
                      <span>{lessonRuntime.elapsedMinutes}/{lessonRuntime.totalDurationMinutes} min</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                      <div
                        className={`h-full ${lessonRuntime.isWrapUpWindow ? 'bg-amber-400' : 'bg-purple-500'}`}
                        style={{ width: `${Math.round(lessonRuntime.progress * 100)}%` }}
                      />
                    </div>
                  </div>

                  {nextSegment && (
                    <div className="ds-surface-muted px-3 py-2">
                      <p className="text-[11px] text-gray-400 uppercase">Next Up</p>
                      <p className="text-sm text-gray-200 mt-1">{nextSegment.title}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Lesson Progress */}
              {tutor.active && (
                <div>
                  <h4 className="text-xs text-gray-400 mb-2 uppercase">Lesson Progress</h4>
                  <div className="space-y-1">
                    {['GREETING', 'ATTENDANCE', 'RECAP', 'TEACHING', 'Q_AND_A', 'ACTIVITY', 'WRAP_UP'].map((phase) => {
                      const phaseIndex = ['GREETING', 'ATTENDANCE', 'RECAP', 'TEACHING', 'Q_AND_A', 'ACTIVITY', 'WRAP_UP'].indexOf(phase);
                      const currentIndex = ['GREETING', 'ATTENDANCE', 'RECAP', 'TEACHING', 'Q_AND_A', 'ACTIVITY', 'WRAP_UP'].indexOf(tutor.phase);
                      const isCurrent = phase === tutor.phase;
                      const isCompleted = phaseIndex < currentIndex;

                      return (
                        <div
                          key={phase}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                            isCurrent
                              ? 'bg-purple-900/50 text-purple-200 font-medium'
                              : isCompleted
                                ? 'text-green-400'
                                : 'text-gray-500'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${
                            isCurrent ? 'bg-purple-400 animate-pulse' : isCompleted ? 'bg-green-400' : 'bg-gray-600'
                          }`} />
                          {phase.replace(/_/g, ' ')}
                          <span className="sr-only">{isCurrent ? ' — Current phase' : isCompleted ? ' — Completed' : ' — Upcoming'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="ds-surface-muted p-3 ds-helper">
                <p className="mb-1">The AI Tutor speaks aloud to the class. Voice responses are not shown as chat text.</p>
                <p className="mb-1">Students can type questions in chat — the tutor will reply with both text and voice.</p>
                <p>In <span className="text-purple-300">Lead</span> mode the tutor runs the full lesson. In <span className="text-blue-300">Co-teach</span> mode you control the pace.</p>
              </div>
            </div>
          )}

          {/* ==========================================
              PARTICIPANTS PANEL
              ========================================== */}
          {activePanel === 'participants' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {classroom.participants.filter(p => !p.leftAt).length === 0 ? (
                  <p className="text-center text-gray-500 py-8 text-sm">No participants yet</p>
                ) : (
                  classroom.participants.filter(p => !p.leftAt).map((p) => (
                    <div key={p.id} className="ds-surface-muted flex items-center gap-3 p-3">
                      <div className="ds-avatar" aria-hidden="true">
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.displayName}</p>
                        <p><span className="ds-badge ds-badge-neutral">{p.role}</span></p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  );
}
