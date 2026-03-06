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

interface ChatMessage {
  id: string;
  senderName: string;
  isAI: boolean;
  message: string;
  createdAt: string;
  audio?: string;
}

interface ClassroomData {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  jitsiDomain: string;
  status: string;
  aiTutorEnabled: boolean;
  aiTutorName: string;
  aiTutorVoiceId: string | null;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  chatMessages: ChatMessage[];
  participants: any[];
  tutorSessions: any[];
}

interface TutorState {
  active: boolean;
  sessionId: string | null;
  phase: string;
  suggestedActions: string[];
  loading: boolean;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
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

  // AI Tutor state
  const [tutor, setTutor] = useState<TutorState>({
    active: false,
    sessionId: null,
    phase: 'GREETING',
    suggestedActions: [],
    loading: false,
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

  // ==========================================
  // LOAD CLASSROOM DATA
  // ==========================================
  useEffect(() => {
    if (!id) return;
    fetchClassroom();
  }, [id]);

  const fetchClassroom = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/virtual-classroom/${id}`);
      const data = res.data;
      setClassroom(data);
      setChatMessages(data.chatMessages || []);

      // Check for active tutor session
      if (data.tutorSessions?.[0]?.status === 'ACTIVE') {
        setTutor({
          active: true,
          sessionId: data.tutorSessions[0].id,
          phase: data.tutorSessions[0].lessonPhase || 'TEACHING',
          suggestedActions: [],
          loading: false,
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // JITSI MEET INTEGRATION
  // ==========================================
  useEffect(() => {
    if (!classroom || loading) return;

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
    if (!jitsiLoaded || !classroom || !jitsiContainerRef.current || jitsiApiRef.current) return;
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
        }).catch(console.error);
      });

      jitsiApi.addEventListener('videoConferenceLeft', () => {
        api.post(`/virtual-classroom/${classroom.id}/participants`, {
          action: 'leave',
          displayName: user?.fullName || 'Student',
        }).catch(console.error);
      });

      jitsiApi.addEventListener('readyToClose', () => {
        navigate('/virtual-classroom');
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
  const startAITutor = async () => {
    if (!classroom) return;
    setTutor(prev => ({ ...prev, loading: true }));

    try {
      const res = await api.post(`/virtual-classroom/${classroom.id}/ai-tutor/start`);
      const data = res.data;

      setTutor({
        active: true,
        sessionId: data.sessionId,
        phase: data.greeting.phase,
        suggestedActions: data.greeting.suggestedActions || [],
        loading: false,
      });

      // Add greeting to chat
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        senderName: classroom.aiTutorName,
        isAI: true,
        message: data.greeting.text,
        createdAt: new Date().toISOString(),
      }]);

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
        suggestedActions: [],
        loading: false,
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

      // Add AI response
      setChatMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: data.text,
        createdAt: new Date().toISOString(),
        audio: data.audio,
      }]);

      // Update phase
      if (data.phase) {
        setTutor(prev => ({
          ...prev,
          phase: data.phase,
          suggestedActions: data.suggestedActions || prev.suggestedActions,
        }));
      }

      // Auto-play audio
      if (data.audio) {
        playAudio(data.audio, data.audioContentType);
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

      setChatMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: data.text,
        createdAt: new Date().toISOString(),
        audio: data.audio,
      }]);

      setTutor(prev => ({
        ...prev,
        phase: data.phase,
        suggestedActions: data.suggestedActions || [],
        loading: false,
      }));

      if (data.audio) {
        playAudio(data.audio, data.audioContentType);
      }
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

      setChatMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        senderName: classroom.aiTutorName,
        isAI: true,
        message: data.text,
        createdAt: new Date().toISOString(),
        audio: data.audio,
      }]);

      if (data.audio) {
        playAudio(data.audio, data.audioContentType);
      }
    } catch (err: any) {
      console.error('Quiz error:', err);
    }
  };

  // ==========================================
  // AUDIO PLAYBACK
  // ==========================================
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

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-lg">{error || 'Classroom not found'}</p>
        <button onClick={() => navigate('/virtual-classroom')} className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700">
          Back to Classrooms
        </button>
      </div>
    );
  }

  const isTeacherOrAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER';
  const phaseLabel = tutor.phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-900 text-white overflow-hidden">
      {/* ==========================================
          MAIN CONTENT — Jitsi Video
          ========================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/virtual-classroom')} className="p-1 hover:bg-gray-700 rounded">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-semibold text-sm">{classroom.title}</h1>
              <p className="text-xs text-gray-400">
                {classroom.subjectName && `${classroom.subjectName} • `}
                {classroom.className && `${classroom.className} • `}
                <span className={`${classroom.status === 'LIVE' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {classroom.status}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Tutor indicator */}
            {tutor.active && (
              <div className="flex items-center gap-1 px-2 py-1 bg-purple-900/50 rounded-full text-xs">
                <Brain size={14} className="text-purple-400" />
                <span className="text-purple-300">{classroom.aiTutorName}</span>
                <span className="text-purple-500">• {phaseLabel}</span>
              </div>
            )}

            {audioPlaying && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-900/50 rounded-full text-xs">
                <Volume2 size={14} className="text-green-400 animate-pulse" />
                <span className="text-green-300">Speaking...</span>
              </div>
            )}

            {/* Panel toggles */}
            <button
              onClick={() => setActivePanel(activePanel === 'chat' ? null : 'chat')}
              className={`p-2 rounded-lg transition ${activePanel === 'chat' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            >
              <MessageSquare size={18} />
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'tutor' ? null : 'tutor')}
              className={`p-2 rounded-lg transition ${activePanel === 'tutor' ? 'bg-purple-600' : 'hover:bg-gray-700'}`}
            >
              <Bot size={18} />
            </button>
            <button
              onClick={() => setActivePanel(activePanel === 'participants' ? null : 'participants')}
              className={`p-2 rounded-lg transition ${activePanel === 'participants' ? 'bg-green-600' : 'hover:bg-gray-700'}`}
            >
              <Users size={18} />
            </button>
          </div>
        </div>

        {/* Jitsi Video Area */}
        <div ref={jitsiContainerRef} className="flex-1 bg-black" />
      </div>

      {/* ==========================================
          SIDE PANEL
          ========================================== */}
      {activePanel && (
        <div className="w-80 lg:w-96 flex flex-col bg-gray-800 border-l border-gray-700">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              {activePanel === 'chat' && <><MessageSquare size={16} /> AI Tutor Chat</>}
              {activePanel === 'tutor' && <><Brain size={16} className="text-purple-400" /> AI Tutor Controls</>}
              {activePanel === 'participants' && <><Users size={16} className="text-green-400" /> Participants</>}
            </h2>
            <button onClick={() => setActivePanel(null)} className="p-1 hover:bg-gray-700 rounded">
              <X size={16} />
            </button>
          </div>

          {/* ==========================================
              CHAT PANEL
              ========================================== */}
          {activePanel === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <Bot size={40} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Start the AI Tutor to begin the class conversation</p>
                  </div>
                )}

                {chatMessages.map((msg) => (
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
                          onClick={() => playAudio(msg.audio!, 'audio/mpeg')}
                          className="mt-1 text-xs text-purple-300 hover:text-purple-200 flex items-center gap-1"
                        >
                          <Volume2 size={12} /> Play voice
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              {tutor.active && (
                <div className="p-3 border-t border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Ask the AI teacher..."
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                      disabled={chatSending}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={chatSending || !chatInput.trim()}
                      className="p-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
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
              <div className={`p-3 rounded-xl border ${
                tutor.active
                  ? 'bg-purple-900/30 border-purple-700'
                  : 'bg-gray-700/50 border-gray-600'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <GraduationCap size={16} className={tutor.active ? 'text-purple-400' : 'text-gray-400'} />
                    {classroom.aiTutorName}
                  </h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    tutor.active ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-300'
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
                    <button
                      onClick={startAITutor}
                      disabled={tutor.loading}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium"
                    >
                      {tutor.loading ? (
                        <><Loader2 size={18} className="animate-spin" /> Starting...</>
                      ) : (
                        <><Play size={18} /> Start AI Tutor</>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={advancePhase}
                        disabled={tutor.loading}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                      >
                        <SkipForward size={16} /> Next Phase
                      </button>

                      <button
                        onClick={launchQuiz}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-amber-600 rounded-lg hover:bg-amber-700 text-sm"
                      >
                        <HelpCircle size={16} /> Quick Quiz
                      </button>

                      <button
                        onClick={stopAITutor}
                        disabled={tutor.loading}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                      >
                        <Square size={16} /> End AI Tutor
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Actions */}
              {tutor.active && tutor.suggestedActions.length > 0 && (
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
                        className="w-full text-left flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 text-sm transition"
                      >
                        <ChevronRight size={14} className="text-purple-400" />
                        {action}
                      </button>
                    ))}
                  </div>
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-gray-700/30 rounded-xl p-3 text-xs text-gray-400">
                <p className="mb-1">💡 The AI Tutor uses ElevenLabs for natural voice and your configured LLM for intelligent responses.</p>
                <p>Students can ask questions via the chat panel, and the AI will respond with both text and voice.</p>
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
                    <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-700/50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold">
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.displayName}</p>
                        <p className="text-xs text-gray-400">{p.role}</p>
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
  );
}
