import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, Plus, MessageSquare, Trash2, Loader2, Sparkles, BookOpen, X, Volume2, VolumeX, Pause, Play, GraduationCap, ListTree, Mic, MicOff, Image, LayoutDashboard } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import VisualExplanation from '../../components/ai-teacher/VisualExplanation';
import RelatedContent from '../../components/ai-teacher/RelatedContent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  subject?: { id: string; name: string };
  topic?: { id: string; name: string };
  updatedAt: string;
  messages: Message[];
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface Topic {
  id: string;
  name: string;
  description?: string;
  subjectId: string;
}

interface UsageStats {
  messagesUsed: number;
  messagesLimit: number;
  messagesRemaining: number;
}

// Text-to-Speech Hook
const useSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true);
      
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean the text (remove markdown)
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // Select a good voice (prefer female teacher-like voice)
    const preferredVoice = voices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Google UK English Female') ||
      v.name.includes('Microsoft Zira') ||
      v.name.includes('Karen') ||
      (v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported, voices]);

  const pause = useCallback(() => {
    if (isSupported && isSpeaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSupported, isSpeaking]);

  const resume = useCallback(() => {
    if (isSupported && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSupported, isPaused]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [isSupported]);

  return { speak, pause, resume, stop, isSpeaking, isPaused, isSupported };
};

// Speech-to-Text Hook
const useSpeechRecognition = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';
      }
    }
  }, []);

  const startListening = useCallback((onResult: (text: string) => void) => {
    if (!isSupported || !recognitionRef.current) return;

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      setIsListening(false);
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
    setIsListening(true);
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  return { startListening, stopListening, isListening, isSupported };
};

const AITeacher = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [inputMessage, setInputMessage] = useState('');
  const [, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [teachingMode, setTeachingMode] = useState<'chat' | 'lesson'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Speech hooks
  const { speak, pause, resume, stop, isSpeaking, isPaused, isSupported: ttsSupported } = useSpeech();
  const { startListening, stopListening, isListening, isSupported: sttSupported } = useSpeechRecognition();

  useEffect(() => {
    fetchConversations();
    fetchSubjects();
    fetchUsage();
  }, []);

  // Fetch topics when subject changes
  useEffect(() => {
    if (selectedSubject) {
      fetchTopics(selectedSubject);
    } else {
      setTopics([]);
      setSelectedTopic('');
    }
  }, [selectedSubject]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-speak new AI messages
  useEffect(() => {
    if (autoSpeak && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        speak(lastMessage.content);
      }
    }
  }, [messages, autoSpeak, speak]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const response = await api.get('/ai-teacher/conversations');
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/ai-teacher/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    }
  };

  const fetchTopics = async (subjectId: string) => {
    try {
      const response = await api.get(`/ai-teacher/subjects/${subjectId}/topics`);
      setTopics(response.data);
    } catch (error) {
      console.error('Failed to fetch topics:', error);
      setTopics([]);
    }
  };

  const fetchUsage = async () => {
    try {
      const response = await api.get('/ai-teacher/usage');
      setUsage(response.data);
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      setLoading(true);
      stop(); // Stop any ongoing speech
      const response = await api.get(`/ai-teacher/conversations/${conversationId}`);
      setActiveConversation(response.data);
      setMessages(response.data.messages);
      setSelectedSubject(response.data.subject?.id || '');
      setSelectedTopic(response.data.topic?.id || '');
      setShowSidebar(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const startNewConversation = () => {
    stop(); // Stop any ongoing speech
    setActiveConversation(null);
    setMessages([]);
    setSelectedSubject('');
    setSelectedTopic('');
    setShowSidebar(false);
  };

  const startLesson = async () => {
    if (!selectedSubject) {
      toast.error('Please select a subject first');
      setShowSubjectPicker(true);
      return;
    }

    const subject = subjects.find(s => s.id === selectedSubject);
    const topic = topics.find(t => t.id === selectedTopic);
    
    const lessonPrompt = topic
      ? `Start a comprehensive lesson on "${topic.name}" in ${subject?.name}. Teach me step by step like a real classroom teacher. Begin with an introduction, explain the key concepts, give examples, and check my understanding with questions.`
      : `Start a lesson on the fundamentals of ${subject?.name}. Teach me like a real classroom teacher - introduce the subject, explain core concepts, give examples, and engage me with questions.`;

    setInputMessage(lessonPrompt);
    setTeachingMode('lesson');
    setAutoSpeak(true);
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || sending) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setSending(true);
    stop(); // Stop any ongoing speech

    try {
      const response = await api.post('/ai-teacher/chat', {
        conversationId: activeConversation?.id,
        message: userMessage.content,
        subjectId: selectedSubject || undefined,
        topicId: selectedTopic || undefined,
        teachingMode,
      });

      const aiMessage: Message = response.data.message;
      setMessages((prev) => [...prev.filter(m => m.id !== userMessage.id), { ...userMessage, id: `user-${Date.now()}` }, aiMessage]);

      // Update or set active conversation
      if (!activeConversation) {
        setActiveConversation({ 
          id: response.data.conversationId, 
          title: userMessage.content.slice(0, 50), 
          updatedAt: new Date().toISOString(), 
          messages: [] 
        });
        fetchConversations();
      }

      // Update usage
      fetchUsage();
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(error.response?.data?.error || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!window.confirm('Delete this conversation?')) return;

    try {
      await api.delete(`/ai-teacher/conversations/${conversationId}`);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
        setMessages([]);
        stop();
      }
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleVoiceInput = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((text) => {
        setInputMessage((prev) => prev + (prev ? ' ' : '') + text);
      });
    }
  };

  // Visual mode toggle for enhanced explanations
  const [visualMode, setVisualMode] = useState(true);

  const selectedSubjectName = subjects.find(s => s.id === selectedSubject)?.name;
  const selectedTopicName = topics.find(t => t.id === selectedTopic)?.name;

  return (
    <div className="flex h-[calc(100vh-64px)] md:h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Sidebar - Conversations */}
      <div
        className={`
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 absolute md:relative z-20 w-80 h-full
        bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-r border-gray-200/50 dark:border-slate-700/50
        transition-transform duration-300 flex flex-col shadow-xl md:shadow-none
      `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200/50 dark:border-slate-700/50 space-y-3">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Bot size={28} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">AI Teacher</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Your personal tutor</p>
            </div>
          </div>
          
          <button
            onClick={startNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-medium shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transform hover:scale-[1.02]"
          >
            <Plus size={20} />
            New Conversation
          </button>
          <button
            onClick={startLesson}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white rounded-xl hover:from-purple-700 hover:via-pink-700 hover:to-rose-700 transition-all font-medium shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transform hover:scale-[1.02]"
          >
            <GraduationCap size={20} />
            Start Live Lesson
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={32} className="text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">No conversations yet</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">Start a new chat to begin learning</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`
                    group relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all
                    ${activeConversation?.id === conv.id
                      ? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 shadow-md border border-blue-200/50 dark:border-blue-700/50'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-700/50 border border-transparent'
                    }
                  `}
                  onClick={() => loadConversation(conv.id)}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activeConversation?.id === conv.id
                      ? 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg'
                      : 'bg-gray-100 dark:bg-slate-700'
                  }`}>
                    <MessageSquare size={18} className={activeConversation?.id === conv.id ? 'text-white' : 'text-gray-500 dark:text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate mb-0.5">{conv.title || 'New conversation'}</p>
                    {(conv.subject || conv.topic) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                        <BookOpen size={12} />
                        {conv.subject?.name}{conv.topic ? ` › ${conv.topic.name}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audio Settings */}
        {ttsSupported && (
          <div className="p-4 border-t border-gray-200/50 dark:border-slate-700/50">
            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                autoSpeak 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30' 
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {autoSpeak ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {autoSpeak ? 'Voice Enabled' : 'Enable Voice'}
            </button>
          </div>
        )}

        {/* Usage Stats */}
        {usage && (
          <div className="p-4 border-t border-gray-200/50 dark:border-slate-700/50 bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-slate-800/50 dark:to-slate-700/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Daily messages</div>
              <div className="text-xs font-bold text-blue-600 dark:text-blue-400">
                {usage.messagesRemaining} / {usage.messagesLimit}
              </div>
            </div>
            <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-500 shadow-lg"
                style={{ width: `${(usage.messagesUsed / usage.messagesLimit) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Overlay for mobile */}
      {showSidebar && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-10"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm">
          <button
            onClick={() => setShowSidebar(true)}
            className="md:hidden p-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            <MessageSquare size={20} />
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
              teachingMode === 'lesson' 
                ? 'bg-gradient-to-br from-purple-500 via-pink-600 to-rose-600' 
                : 'bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600'
            }`}>
              {teachingMode === 'lesson' ? <GraduationCap size={26} className="text-white" /> : <Bot size={26} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                {teachingMode === 'lesson' ? (
                  <>
                    Live Lesson
                    <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-xs font-semibold rounded-full animate-pulse">LIVE</span>
                  </>
                ) : (
                  'AI Teacher'
                )}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {selectedTopicName 
                  ? `${selectedSubjectName} › ${selectedTopicName}` 
                  : selectedSubjectName || 'Ask me anything about your studies'}
              </p>
            </div>
          </div>

          {/* Subject & Topic Selection */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSubjectPicker(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 rounded-xl hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/50 dark:hover:to-indigo-900/50 text-sm font-medium transition-all border border-blue-200/50 dark:border-blue-700/50"
            >
              <BookOpen size={16} />
              <span className="hidden sm:inline">{selectedSubjectName || 'Subject'}</span>
            </button>
            
            {selectedSubject && topics.length > 0 && (
              <button
                onClick={() => setShowTopicPicker(true)}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 text-purple-700 dark:text-purple-300 rounded-xl hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/50 dark:hover:to-pink-900/50 text-sm font-medium transition-all border border-purple-200/50 dark:border-purple-700/50"
              >
                <ListTree size={16} />
                <span className="hidden sm:inline">{selectedTopicName || 'Topic'}</span>
              </button>
            )}

            {/* Audio Controls */}
            {ttsSupported && isSpeaking && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-700 rounded-xl p-1 shadow-lg border border-gray-200 dark:border-slate-600">
                <button
                  onClick={isPaused ? resume : pause}
                  className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  {isPaused ? <Play size={18} /> : <Pause size={18} />}
                </button>
                <button
                  onClick={stop}
                  className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                  <VolumeX size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Teacher Info Banner */}
          {user?.role === 'TEACHER' && messages.length === 0 && (
            <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <GraduationCap size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    Teacher Note: This is the AI Tutoring Tool
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                    This AI Teacher is designed for students to get help with their studies. As a teacher, your main workspace is the Dashboard.
                  </p>
                  <a 
                    href="/" 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <LayoutDashboard size={16} />
                    Go to Teacher Dashboard
                  </a>
                </div>
              </div>
            </div>
          )}
          
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-lg px-4">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
                  teachingMode === 'lesson' 
                    ? 'bg-gradient-to-br from-purple-500 to-pink-600' 
                    : 'bg-gradient-to-br from-blue-500 to-purple-600'
                }`}>
                  <Sparkles size={40} className="text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {user?.role === 'TEACHER' ? (
                    <>Hi {user?.fullName?.split(' ')[0]}! I'm your AI Teaching Assistant</>
                  ) : (
                    <>Hi {user?.fullName?.split(' ')[0]}! I'm your AI Teacher</>
                  )}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {user?.role === 'TEACHER' ? (
                    <>
                      This is an AI tutoring tool for your students. For your teacher dashboard with classes, homework, and grading,{' '}
                      <a href="/" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold underline">
                        click here to go to Dashboard
                      </a>.
                    </>
                  ) : (
                    <>Select a subject and topic, then ask questions or start a live lesson. I'll teach you step-by-step, just like in a real classroom!</>
                  )}
                </p>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  <button
                    onClick={() => {
                      setShowSubjectPicker(true);
                    }}
                    className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <BookOpen size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Choose Subject</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Focus on a specific area</p>
                    </div>
                  </button>
                  <button
                    onClick={startLesson}
                    className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-left hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/30 dark:hover:to-pink-900/30 transition-colors"
                  >
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <GraduationCap size={20} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Start Live Lesson</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Interactive teaching with audio</p>
                    </div>
                  </button>
                </div>

                {/* Sample Questions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    'Explain photosynthesis step by step',
                    'Help me solve quadratic equations',
                    'What caused World War 2?',
                    'How do I write a persuasive essay?',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setInputMessage(prompt)}
                      className="text-left p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Related Content - Video Lessons, Homework, Quizzes */}
                <div className="mt-6">
                  <RelatedContent 
                    subjectId={selectedSubject || undefined}
                    onAskAbout={(topic) => {
                      setInputMessage(topic);
                      // Auto-send after a short delay
                      setTimeout(() => {
                        const btn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
                        if (btn) btn.click();
                      }, 100);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
                >
                  <div
                    className={`
                      max-w-[85%] md:max-w-[75%] rounded-2xl
                      ${msg.role === 'user'
                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-md shadow-lg shadow-blue-500/30 p-4'
                        : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200/50 dark:border-slate-700/50 rounded-bl-md shadow-xl'
                      }
                    `}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Bot size={16} className="text-white" />
                          </div>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">AI Teacher</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setVisualMode(!visualMode)}
                            className={`p-1.5 rounded-lg transition-all ${visualMode ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 shadow-sm' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400'}`}
                            title={visualMode ? 'Visual mode on' : 'Enable visual mode'}
                          >
                            <Image size={14} />
                          </button>
                          {ttsSupported && (
                            <button
                              onClick={() => speak(msg.content)}
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                              title="Read aloud"
                            >
                              <Volume2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className={`text-sm leading-relaxed ${msg.role === 'assistant' ? 'p-4' : ''}`}>
                      {msg.role === 'assistant' 
                        ? (visualMode ? <VisualExplanation content={msg.content} /> : msg.content)
                        : msg.content
                      }
                    </div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-4 rounded-2xl rounded-bl-md shadow-sm">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm">Teaching...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-slate-700/50">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            {/* Voice Input */}
            {sttSupported && (
              <button
                onClick={handleVoiceInput}
                className={`p-3.5 rounded-xl transition-all shadow-lg ${
                  isListening 
                    ? 'bg-gradient-to-br from-red-500 to-red-600 text-white animate-pulse shadow-red-500/50' 
                    : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-600 text-gray-600 dark:text-gray-400 hover:from-gray-200 hover:to-gray-300 dark:hover:from-slate-600 dark:hover:to-slate-500'
                }`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={teachingMode === 'lesson' ? "Ask a question or say 'continue'..." : "Ask your question..."}
                rows={1}
                className="w-full px-5 py-3.5 bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none transition-all shadow-sm"
                style={{ minHeight: '52px', maxHeight: '120px' }}
              />
            </div>
            <button
              data-send-btn
              onClick={sendMessage}
              disabled={!inputMessage.trim() || sending}
              className="p-3.5 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transform hover:scale-105 disabled:transform-none"
            >
              {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
          <p className="text-xs text-center mt-3 text-gray-500 dark:text-gray-400">
            {autoSpeak ? (
              <span className="flex items-center justify-center gap-1.5">
                <Volume2 size={14} className="text-green-500" />
                Voice enabled - I will read my responses aloud
              </span>
            ) : (
              'AI can make mistakes. Always verify with your teacher.'
            )}
          </p>
        </div>
      </div>

      {/* Subject Picker Modal */}
      {showSubjectPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 dark:text-white">Select Subject</h3>
              <button
                onClick={() => setShowSubjectPicker(false)}
                className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                onClick={() => {
                  setSelectedSubject('');
                  setSelectedTopic('');
                  setShowSubjectPicker(false);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  !selectedSubject
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="font-medium">All Subjects</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">General questions</p>
              </button>
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => {
                    setSelectedSubject(subject.id);
                    setSelectedTopic('');
                    setShowSubjectPicker(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedSubject === subject.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="font-medium">{subject.name}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{subject.code}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Topic Picker Modal */}
      {showTopicPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Select Topic</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedSubjectName}</p>
              </div>
              <button
                onClick={() => setShowTopicPicker(false)}
                className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                onClick={() => {
                  setSelectedTopic('');
                  setShowTopicPicker(false);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  !selectedTopic
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <span className="font-medium">All Topics</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Any topic in {selectedSubjectName}</p>
              </button>
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => {
                    setSelectedTopic(topic.id);
                    setShowTopicPicker(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedTopic === topic.id
                      ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="font-medium">{topic.name}</span>
                  {topic.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{topic.description}</p>
                  )}
                </button>
              ))}
              {topics.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <ListTree size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No topics available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AITeacher;
