import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, CheckCircle2, XCircle, ChevronRight,
  Calendar, BookOpen, GraduationCap,
  CreditCard, Bell, BarChart3, ArrowRight, Zap,
  Copy, Trash2, ChevronDown, Plus, MessageSquare, MoreHorizontal,
  Pencil, Check, X, Search, PanelLeftClose, PanelLeft,
  Mic, MicOff, ImagePlus, Volume2, Phone, PhoneOff, Square,
  Users, Building2, Wallet, CalendarDays, RefreshCw, Info, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import masterAIService, { MasterAIAction, MasterAIConversation, MasterAIResponse, PendingConfirmation } from '../../services/masterAIService';
import ReactMarkdown from 'react-markdown';
import { useVoiceConversation } from '../../hooks/useVoiceConversation';
import { useActiveTerm } from '../../hooks/useActiveTerm';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import api from '../../utils/api';

type PendingState = 'open' | 'running' | 'done' | 'cancelled' | 'failed';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  actions?: MasterAIAction[];
  suggestions?: string[];
  timestamp: Date;
  isLoading?: boolean;
  errorDetail?: string;
  pending?: PendingConfirmation;
  pendingState?: PendingState;
}

const PENDING_STATE_TEXT: Record<Exclude<PendingState, 'open'>, string> = {
  running: 'Running...',
  done: 'Confirmed.',
  cancelled: 'Cancelled. Nothing was changed.',
  failed: 'Not completed. See the message below.',
};

const IMAGE_ONLY_PROMPT = 'Please look at this image and tell me what you see.';

/** Turn a failed request into a message a school user can act on. */
function describeError(error: any): { message: string; detail?: string } {
  const status = error?.response?.status;
  const detail = error?.response?.data?.error || error?.message;
  if (!error?.response) return { message: 'I could not reach the server. Check your connection and try again.', detail };
  if ((status === 400 || status === 410) && error.response.data?.error) return { message: error.response.data.error };
  if (status === 401 || status === 403) return { message: 'You do not have permission to do that.', detail };
  if (status === 429) return { message: 'Too many requests right now. Please wait a moment and try again.', detail };
  return { message: 'Something went wrong while processing your request. Please try again.', detail };
}

const toAssistantMessage = (result: MasterAIResponse): ChatMessage => ({
  id: `assistant-${Date.now()}`,
  role: 'assistant',
  content: result.message,
  actions: result.actions,
  suggestions: result.suggestions,
  pending: result.pendingConfirmation,
  pendingState: result.pendingConfirmation ? 'open' : undefined,
  timestamp: new Date(),
});

const toErrorMessage = ({ message, detail }: { message: string; detail?: string }): ChatMessage => ({
  id: `error-${Date.now()}`,
  role: 'assistant',
  content: message,
  errorDetail: detail,
  timestamp: new Date(),
});

const toastActionCounts = (actions?: MasterAIAction[]) => {
  const successCount = actions?.filter(a => a.success).length || 0;
  const failCount = actions?.filter(a => !a.success).length || 0;
  if (successCount > 0) toast.success(`${successCount} action(s) completed successfully`);
  if (failCount > 0) toast.error(`${failCount} action(s) failed`);
};

const year = new Date().getFullYear();

// Starters are placed in the input for review; [bracketed] parts are selected so they can be typed over.
const adminQuickCommands = [
  { icon: Calendar, label: 'Add Zambian Holidays', command: `Add all public holidays for Zambia for ${year} to the academic calendar` },
  { icon: Calendar, label: 'Add Zimbabwe Holidays', command: `Add all public holidays for Zimbabwe for ${year} to the academic calendar` },
  { icon: Calendar, label: 'Add SA Holidays', command: `Add all public holidays for South Africa for ${year} to the academic calendar` },
  { icon: BookOpen, label: 'Create Subjects', command: 'Create standard primary school subjects: Mathematics, English, Science, Social Studies, Physical Education, Art, Music, Computer Studies' },
  { icon: GraduationCap, label: 'Setup Classes', command: 'Create classes for a primary school from Grade 1 to Grade 7 with capacity [40] each' },
  { icon: CreditCard, label: 'Setup Fee Structure', command: 'Create fee templates: Tuition Fee ([amount] per term), Transport Fee ([amount] per month)' },
  { icon: BarChart3, label: 'School Statistics', command: 'Show me the current school statistics - how many students, teachers, classes, etc.' },
  { icon: Bell, label: 'Create Announcement', command: 'Create a high priority announcement for all teachers and parents: "[message]"' },
];

type QuickCommand = { icon: typeof Calendar; label: string; command: string };

/** A class from GET /classes; for teachers, subjects are limited to the ones they teach there. */
interface TeacherClass {
  id: string;
  name: string;
  subjects: { name: string }[];
}

// One subject is named directly; several become a [placeholder] listing the options.
const subjectSlot = (cls: TeacherClass) =>
  cls.subjects.length === 1 ? cls.subjects[0].name : `[${cls.subjects.map(s => s.name).join(' / ') || 'subject'}]`;

const teacherQuickCommands = (cls?: TeacherClass): QuickCommand[] => {
  const where = cls ? cls.name : 'my class';
  const subject = cls ? `${subjectSlot(cls)} in ` : '';
  return [
    { icon: BookOpen, label: 'Lesson Plans', command: `Generate lesson plans for ${subject}${where} for the next topics not covered yet` },
    { icon: BarChart3, label: 'Class Insights', command: `How is ${where} doing? Who needs extra support?` },
    { icon: CheckCircle2, label: 'Create a Quiz', command: `Create a 10-question quiz with an answer key for ${subject}${where} on the current topic` },
    { icon: Pencil, label: 'Homework', command: `Generate homework for ${subject}${where} on the current topic` },
    { icon: MessageSquare, label: 'Report Remarks', command: `Help me write report card remarks for [learner name] in ${where}` },
    { icon: Sparkles, label: 'Teaching Ideas', command: `Give me practical, low-resource activities to teach [topic] to ${where}` },
    { icon: Calendar, label: 'Upcoming Events', command: 'What events are on the school calendar this month?' },
    { icon: GraduationCap, label: 'My Lesson Plans', command: 'List my recent lesson plans' },
  ];
};

interface Persona {
  title: string;
  subtitle: (school: string) => string;
  badge: (school: string) => string;
  heading: (school: string) => string;
  intro: string;
  capabilitiesTitle: (school: string) => string;
  capabilities: string[];
  footer: (school: string) => string;
}

const adminPersona: Persona = {
  title: 'Master AI',
  subtitle: school => `Natural language control for ${school}`,
  badge: school => `${school} AI Command Center`,
  heading: school => `What would you like me to do for ${school}?`,
  intro: 'Tell me in plain English and I\u2019ll execute it across calendar, students, classes, fees, communication, and more.',
  capabilitiesTitle: school => `What can I help ${school} with?`,
  capabilities: [
    'Add public holidays by country to the academic calendar',
    'Create classes, subjects, and fee structures',
    'Search for students, teachers, and users',
    'Create announcements and send notifications',
    'Set up academic terms and assessment schedules',
    'Record expenses and manage scholarships',
    'View school statistics and analytics',
  ],
  footer: school => `Master AI can look at images, listen to your voice, and manage operations across ${school}. Deleting data and sending messages always ask for your confirmation first.`,
};

const teacherPersona: Persona = {
  title: 'Master AI',
  subtitle: () => 'Your teaching assistant',
  badge: school => `${school} Teaching Assistant`,
  heading: () => 'How can I help with your teaching today?',
  intro: 'Ask in plain English. I know your classes and subjects for this term.',
  capabilitiesTitle: () => 'What I can do for you',
  capabilities: [
    'Generate and save lesson plans, assessments and homework for your classes',
    'Show attendance, subject averages and learners who need support',
    'Draft report card remarks for a learner',
    'Explain concepts, plan lessons, and write questions with answer keys',
    'Analyse a photo of learners\u2019 work or a textbook page',
    'Check the school calendar and syllabus topics',
  ],
  footer: () => 'Master AI can look at images and listen to your voice. Lesson plans, assessments and homework it generates are saved to your classes.',
};

// ==========================================
// HELPER: Group conversations by date
// ==========================================
function groupConversationsByDate(conversations: MasterAIConversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7 = new Date(today.getTime() - 7 * 86400000);
  const last30 = new Date(today.getTime() - 30 * 86400000);

  const groups: { label: string; items: MasterAIConversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Previous 30 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= last7) groups[2].items.push(c);
    else if (d >= last30) groups[3].items.push(c);
    else groups[4].items.push(c);
  }

  return groups.filter(g => g.items.length > 0);
}

// ==========================================
// MAIN COMPONENT
// ==========================================
const MasterAI = () => {
  const { settings: themeSettings } = useTheme();
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const persona = isTeacher ? teacherPersona : adminPersona;
  const { activeTerm } = useActiveTerm();
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [focusClassId, setFocusClassId] = useState('');
  const focusClass = teacherClasses.find(c => c.id === focusClassId);
  const quickCommands = isTeacher ? teacherQuickCommands(focusClass) : adminQuickCommands;

  useEffect(() => {
    if (!isTeacher || !activeTerm) return;
    let cancelled = false;
    api.get<TeacherClass[]>('/classes', { params: { academicTermId: activeTerm.id } })
      .then(res => {
        if (cancelled) return;
        setTeacherClasses(res.data);
        setFocusClassId(res.data[0]?.id ?? '');
      })
      .catch(() => { /* starters fall back to generic wording */ });
    return () => { cancelled = true; };
  }, [isTeacher, activeTerm]);

  // What the assistant is working with, shown in the header
  const contextLabel = !activeTerm
    ? 'No active term'
    : isTeacher
      ? `${activeTerm.name} · ${teacherClasses.length} class${teacherClasses.length === 1 ? '' : 'es'}`
      : activeTerm.name;
  const contextTitle = isTeacher && teacherClasses.length
    ? `Master AI knows your classes this term: ${teacherClasses.map(c => c.subjects.length ? `${c.name} (${c.subjects.map(s => s.name).join(', ')})` : c.name).join('; ')}`
    : `Current term: ${activeTerm?.name ?? 'none'}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { confirm } = useAppDialog();
  const [conversations, setConversations] = useState<MasterAIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Smooth voice conversation hook (ElevenLabs-style) ----
  const voice = useVoiceConversation({
    conversationId: activeConversationId,
    onResponse: (resp) => {
      // Update conversation ID if new
      if (resp.isNewConversation || !activeConversationId) {
        setActiveConversationId(resp.conversationId);
        loadConversations();
      }
      // Add AI message to chat
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: resp.message,
        actions: resp.actions,
        suggestions: resp.suggestions,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev.filter(m => !m.isLoading), assistantMsg]);
      loadConversations();
      const successCount = resp.actions?.filter(a => a.success).length || 0;
      const failCount = resp.actions?.filter(a => !a.success).length || 0;
      if (successCount > 0) toast.success(`${successCount} action(s) completed`);
      if (failCount > 0) toast.error(`${failCount} action(s) failed`);
    },
    onTranscript: (text) => {
      // Add user message to chat when voice transcript is ready
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      const loadingMsg: ChatMessage = {
        id: `loading-${Date.now()}`,
        role: 'assistant',
        content: 'Thinking...',
        timestamp: new Date(),
        isLoading: true,
      };
      setMessages(prev => [...prev, userMsg, loadingMsg]);
    },
    onConversationEnd: () => {
      setVoiceMode(false);
      toast.success('Voice conversation ended');
    },
    onConversationIdChange: (id) => {
      setActiveConversationId(id);
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Grow the input with its content (capped by max-h-32)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  // Release mic, audio and pending request when leaving the page
  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());
    currentAudioRef.current?.pause();
    abortRef.current?.abort();
  }, []);

  const stopAudio = () => {
    playTokenRef.current += 1;
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    setSpeakingId(null);
  };

  // Read a reply aloud on request; pressing again stops it
  const togglePlayback = async (msg: ChatMessage) => {
    if (speakingId === msg.id) { stopAudio(); return; }
    stopAudio();
    const token = playTokenRef.current;
    setSpeakingId(msg.id);
    const blob = await masterAIService.generateSpeech(msg.content);
    if (token !== playTokenRef.current) return;
    if (!blob) {
      setSpeakingId(null);
      toast.error('Read aloud is not available right now');
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    const finish = () => {
      URL.revokeObjectURL(url);
      if (currentAudioRef.current === audio) {
        currentAudioRef.current = null;
        setSpeakingId(null);
      }
    };
    audio.onended = finish;
    audio.onerror = finish;
    try { await audio.play(); } catch { finish(); }
  };

  const releaseMic = () => {
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  // Dictation: records speech and appends the transcript to the input
  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // ---- Noise-cancellation audio processing chain ----
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      // High-pass: cut rumble below 85 Hz
      // ── Audio processing chain ──────────────────────────────────
      // Bandpass (85–8kHz) → gentle compressor → gain → recorder
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 85;
      highPass.Q.value = 0.7;

      // Low-pass: cut hiss above 8 kHz
      const lowPass = audioContext.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 8000;
      lowPass.Q.value = 0.7;

      // Gentle speech compressor — preserves silence-vs-speech dynamics
      const speechComp = audioContext.createDynamicsCompressor();
      speechComp.threshold.value = -20;
      speechComp.knee.value = 12;
      speechComp.ratio.value = 3;
      speechComp.attack.value = 0.005;
      speechComp.release.value = 0.15;

      // Output gain — slight boost for Whisper clarity
      const outputGain = audioContext.createGain();
      outputGain.gain.value = 1.1;

      // Chain: source → highPass → lowPass → speechComp → outputGain
      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(speechComp);
      speechComp.connect(outputGain);

      // Create processed stream for MediaRecorder
      const destNode = audioContext.createMediaStreamDestination();
      outputGain.connect(destNode);
      const processedStream = destNode.stream;

      const mediaRecorder = new MediaRecorder(processedStream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
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
        releaseMic();
        // Ignore very short clips (likely noise)
        if (audioBlob.size < 5000) return;
        try {
          const transcribedText = await masterAIService.transcribeAudio(audioBlob);
          setInput(prev => (prev + ' ' + transcribedText).trim());
        } catch {
          toast.error('Could not transcribe audio. Please try again.');
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch {
      toast.error('Microphone access denied or not available');
      releaseMic();
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop(); // onstop releases the mic
    } else {
      releaseMic();
    }
    setIsListening(false);
  };

  const toggleVoiceMode = async () => {
    stopAudio();
    if (voiceMode || voice.isActive) {
      voice.stopVoiceMode();
      setVoiceMode(false);
    } else {
      if (isListening) stopListening();
      setVoiceMode(true);

      // Add greeting message to chat
      const greetingMsg: ChatMessage = {
        id: `greeting-${Date.now()}`,
        role: 'assistant',
        content: "Hi there! I'm listening. How can I help you today?",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, greetingMsg]);

      // Start the voice conversation engine (greeting + auto-listen)
      await voice.startVoiceMode();
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setImageBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Load conversations on mount
  const loadConversations = useCallback(async () => {
    try {
      const data = await masterAIService.getConversations();
      setConversations(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Open the sidebar on desktop and close it on mobile only when crossing the breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Load a specific conversation's messages
  const loadConversation = async (convoId: string) => {
    if (convoId === activeConversationId) return;
    setLoadingConversation(true);
    try {
      const { messages: dbMessages } = await masterAIService.getConversation(convoId);
      const chatMsgs: ChatMessage[] = dbMessages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(chatMsgs);
      setActiveConversationId(convoId);
      
      // Close sidebar on mobile after selecting conversation
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    } catch {
      toast.error('Failed to load conversation');
    } finally {
      setLoadingConversation(false);
    }
  };

  // Start a new chat
  const startNewChat = () => {
    setMessages([]);
    setActiveConversationId(null);
    setInput('');
    inputRef.current?.focus();
  };

  // Put a starter in the input for review; select the first [placeholder] so it can be typed over
  const prefillCommand = (command: string) => {
    setInput(command);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const start = command.indexOf('[');
      const end = command.indexOf(']', start);
      if (start >= 0 && end > start) el.setSelectionRange(start, end + 1);
      else el.setSelectionRange(command.length, command.length);
    });
  };

  // Delete a conversation
  const handleDeleteConversation = async (convo: MasterAIConversation) => {
    const accepted = await confirm({
      title: 'Delete conversation?',
      message: `"${convo.title}" will be permanently deleted.`,
      confirmText: 'Delete',
    });
    if (!accepted) return;
    try {
      await masterAIService.deleteConversation(convo.id);
      setConversations(prev => prev.filter(c => c.id !== convo.id));
      if (activeConversationId === convo.id) {
        startNewChat();
      }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Send command
  const sendCommand = async (command?: string) => {
    const currentImage = imageBase64;
    const text = command || input.trim() || (currentImage ? IMAGE_ONLY_PROMPT : '');
    if (!text || isProcessing) return;

    // Clear early so user feels responsive
    setInput('');
    setImageBase64(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      image: currentImage || undefined,
      timestamp: new Date(),
    };

    const loadingMsg: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: 'Working on it...',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await masterAIService.executeCommand(text, activeConversationId || undefined, currentImage || undefined, controller.signal);

      // If a new conversation was created, update state
      if (result.isNewConversation || !activeConversationId) {
        setActiveConversationId(result.conversationId);
        loadConversations(); // Refresh sidebar
      }

      setMessages(prev => [...prev.filter(m => !m.isLoading), toAssistantMessage(result)]);

      // Update the conversation's updatedAt in the sidebar
      setConversations(prev => {
        const existing = prev.find(c => c.id === result.conversationId);
        if (existing) {
          return [
            { ...existing, updatedAt: new Date().toISOString() },
            ...prev.filter(c => c.id !== result.conversationId),
          ];
        }
        return prev;
      });
      loadConversations();
      toastActionCounts(result.actions);
    } catch (error: any) {
      const cancelled = error?.code === 'ERR_CANCELED';
      const errorMsg = toErrorMessage(cancelled
        ? { message: 'Stopped. Anything already started on the server may still finish.' }
        : describeError(error));
      setMessages(prev => [...prev.filter(m => !m.isLoading), errorMsg]);
      if (!cancelled) toast.error('Request failed');
    } finally {
      abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const setPendingState = (id: string, pendingState: PendingState) =>
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, pendingState } : m)));

  // Run or drop a plan the server is holding for confirmation
  const resolvePending = async (msg: ChatMessage, accept: boolean) => {
    if (!msg.pending || msg.pendingState !== 'open' || isProcessing) return;
    const { token } = msg.pending;
    if (!accept) {
      setPendingState(msg.id, 'cancelled');
      masterAIService.cancelAction(token).catch(() => { /* the plan expires on its own */ });
      return;
    }
    setPendingState(msg.id, 'running');
    setIsProcessing(true);
    try {
      const result = await masterAIService.confirmAction(token);
      setPendingState(msg.id, 'done');
      setMessages(prev => [...prev, toAssistantMessage(result)]);
      toastActionCounts(result.actions);
      loadConversations();
    } catch (error) {
      setPendingState(msg.id, 'failed');
      setMessages(prev => [...prev, toErrorMessage(describeError(error))]);
      toast.error('Request failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand();
    }
  };

  // Filter conversations by search
  const filteredConversations = searchQuery
    ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  const groupedConversations = groupConversationsByDate(filteredConversations);
  const schoolName = themeSettings.schoolName || 'Your School';

  return (
    <div
      className="flex h-[calc(100dvh-4rem)] bg-gray-50 dark:bg-slate-900 relative overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color) 10%, transparent), transparent 30%), radial-gradient(circle at bottom left, color-mix(in srgb, var(--accent-color) 12%, transparent), transparent 28%)',
      }}
    >
      {/* ============ SIDEBAR ============ */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${
          sidebarOpen ? 'w-72' : 'w-0 md:w-0'
        } transition-all duration-300 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col fixed md:relative inset-y-0 left-0 z-30 md:z-auto shadow-xl md:shadow-none h-full`}
      >
        {/* Sidebar Header */}
        <div className="p-3 flex-shrink-0">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-surface-hover transition-colors text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm"
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none transition-colors"
              style={{ boxShadow: 'none' }}
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            groupedConversations.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.label}
                </p>
                {group.items.map(convo => (
                  <ConversationItem
                    key={convo.id}
                    conversation={convo}
                    isActive={convo.id === activeConversationId}
                    onClick={() => loadConversation(convo.id)}
                    onDelete={() => handleDeleteConversation(convo)}
                    onRename={async (newTitle) => {
                      try {
                        await masterAIService.updateConversation(convo.id, newTitle);
                        setConversations(prev =>
                          prev.map(c => c.id === convo.id ? { ...c, title: newTitle } : c)
                        );
                      } catch {
                        toast.error('Failed to rename');
                      }
                    }}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ============ MAIN CHAT AREA ============ */}
      <div className="flex-1 flex flex-col min-w-0 w-full relative">
        {/* Header */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-surface-hover transition-colors flex-shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              aria-label={sidebarOpen ? 'Close conversation list' : 'Open conversation list'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
            {themeSettings.logoUrl ? (
              <img
                src={themeSettings.logoUrl}
                alt={schoolName}
                className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-contain bg-white dark:bg-slate-800 p-1 border border-gray-200 dark:border-slate-700 flex-shrink-0"
              />
            ) : (
              <div
                className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm"
                style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))' }}
              >
                <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{persona.title}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{persona.subtitle(schoolName)}</p>
            </div>
            <span
              title={contextTitle}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 bg-white/80 dark:bg-slate-800 flex-shrink-0 max-w-[40%]"
            >
              <CalendarDays size={12} className="text-primary flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{contextLabel}</span>
            </span>
            {activeConversationId && !sidebarOpen && (
              <button
                onClick={startNewChat}
                className="p-2 rounded-lg text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                title="New Chat"
                aria-label="New chat"
              >
                <Plus size={16} className="md:w-[18px] md:h-[18px]" />
              </button>
            )}
            <button
              onClick={toggleVoiceMode}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                voiceMode
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-primary hover:bg-surface-hover'
              }`}
              title={voiceMode ? 'End Voice Call' : 'Start Voice Call'}
              aria-label={voiceMode ? 'End voice call' : 'Start voice call'}
              aria-pressed={voiceMode}
            >
              {voiceMode ? <PhoneOff size={16} className="md:w-[18px] md:h-[18px]" /> : <Phone size={16} className="md:w-[18px] md:h-[18px]" />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 md:py-6 space-y-3 md:space-y-4">
          {loadingConversation ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen
              onCommand={prefillCommand}
              schoolName={schoolName}
              logoUrl={themeSettings.logoUrl}
              persona={persona}
              quickCommands={quickCommands}
              classPicker={isTeacher && teacherClasses.length > 0
                ? { classes: teacherClasses, value: focusClassId, onChange: setFocusClassId }
                : undefined}
            />
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSuggestionClick={sendCommand}
                onTogglePlay={() => togglePlayback(msg)}
                isSpeaking={speakingId === msg.id}
                onResolvePending={accept => resolvePending(msg, accept)}
                busy={isProcessing}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-3 md:px-4 pb-3 md:pb-4 flex-shrink-0">
          {/* Compact floating voice panel — keeps page visible */}
          {voiceMode && voice.isActive && (
            <div className="mb-3 relative rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 overflow-hidden">
              {/* Ambient glow inside card */}
              <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-20 transition-all duration-700"
                  style={{
                    width: `${160 + voice.audioLevel * 120}px`,
                    height: `${160 + voice.audioLevel * 120}px`,
                    background: voice.voiceState === 'listening'
                      ? 'radial-gradient(circle, rgba(239,68,68,0.6), transparent)'
                      : voice.voiceState === 'speaking'
                      ? 'radial-gradient(circle, rgba(147,51,234,0.6), transparent)'
                      : voice.voiceState === 'processing'
                      ? 'radial-gradient(circle, rgba(59,130,246,0.5), transparent)'
                      : 'radial-gradient(circle, rgba(100,116,139,0.3), transparent)',
                  }}
                />
              </div>

              {/* Header row */}
              <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    voice.voiceState === 'listening' ? 'bg-red-400' :
                    voice.voiceState === 'speaking' ? 'bg-purple-400' :
                    voice.voiceState === 'processing' ? 'bg-blue-400' :
                    voice.voiceState === 'ending' ? 'bg-emerald-400' : 'bg-slate-400'
                  }`} />
                  <span className="text-white/60 text-xs font-medium">Voice Conversation</span>
                </div>
              </div>

              {/* Main body — orb + state */}
              <div className="relative z-10 flex items-center gap-4 px-4 py-3">
                {/* Mini orb — tappable to interrupt when speaking */}
                <button
                  onClick={() => { if (voice.voiceState === 'speaking') voice.interruptAI(); }}
                  className="relative flex-shrink-0"
                  title={voice.voiceState === 'speaking' ? 'Tap to interrupt' : undefined}
                >
                  {/* Pulse ring */}
                  {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
                    <div
                      className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                        voice.voiceState === 'listening' ? 'bg-red-400' : 'bg-purple-400'
                      }`}
                      style={{ animationDuration: '2s' }}
                    />
                  )}
                  <div
                    className={`rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
                      voice.voiceState === 'listening'
                        ? 'bg-gradient-to-br from-red-500 to-red-600'
                        : voice.voiceState === 'speaking'
                        ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                        : voice.voiceState === 'processing'
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                        : voice.voiceState === 'ending'
                        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                        : 'bg-gradient-to-br from-slate-600 to-slate-700'
                    }`}
                    style={{ width: `${48 + voice.audioLevel * 12}px`, height: `${48 + voice.audioLevel * 12}px` }}
                  >
                    {voice.voiceState === 'listening' && <Mic size={22} className="text-white drop-shadow" />}
                    {voice.voiceState === 'speaking' && <Volume2 size={22} className="text-white drop-shadow animate-pulse" />}
                    {voice.voiceState === 'processing' && <Loader2 size={22} className="text-white drop-shadow animate-spin" />}
                    {voice.voiceState === 'ending' && <Check size={22} className="text-white drop-shadow" />}
                    {voice.voiceState === 'idle' && <Mic size={22} className="text-white/60 drop-shadow" />}
                  </div>
                </button>

                {/* State text + transcript */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    voice.voiceState === 'listening' ? 'text-red-400' :
                    voice.voiceState === 'speaking' ? 'text-purple-400' :
                    voice.voiceState === 'processing' ? 'text-blue-400' :
                    voice.voiceState === 'ending' ? 'text-emerald-400' : 'text-slate-400'
                  }`}>
                    {voice.voiceState === 'listening' && 'Listening...'}
                    {voice.voiceState === 'speaking' && 'Speaking...'}
                    {voice.voiceState === 'processing' && 'Thinking...'}
                    {voice.voiceState === 'ending' && 'Goodbye!'}
                    {voice.voiceState === 'idle' && 'Ready'}
                  </p>
                  {voice.currentTranscript ? (
                    <p className="text-xs text-white/50 mt-0.5 truncate italic">
                      "{voice.currentTranscript}"
                    </p>
                  ) : (
                    <p className="text-xs text-white/30 mt-0.5">
                      {voice.voiceState === 'listening' && 'Speak naturally — I\'ll know when you\'re done'}
                      {voice.voiceState === 'speaking' && 'Tap orb to interrupt'}
                      {voice.voiceState === 'processing' && 'Processing your request...'}
                      {voice.voiceState === 'ending' && 'See you!'}
                      {voice.voiceState === 'idle' && 'Starting...'}
                    </p>
                  )}
                </div>
              </div>

              {/* Audio level bar */}
              {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
                <div className="relative z-10 px-4 pb-2">
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-150 ${
                        voice.voiceState === 'listening' ? 'bg-red-400' : 'bg-purple-400'
                      }`}
                      style={{ width: `${Math.min(100, voice.audioLevel * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Footer — end button */}
              <div className="relative z-10 px-4 pb-3 pt-1 flex items-center justify-between">
                <p className="text-xs text-white/40">
                  Say "goodbye" to end
                </p>
                <button
                  onClick={toggleVoiceMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full text-xs font-medium shadow-lg shadow-red-500/20 transition-all hover:scale-105 active:scale-95"
                >
                  <PhoneOff size={12} />
                  End
                </button>
              </div>
            </div>
          )}

          {/* Inline voice mode panel (when hook is not yet started but voiceMode toggled) */}
          {voiceMode && !voice.isActive && (
            <div className="mb-3 p-6 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={40} className="text-primary animate-spin" />
                <span className="text-base font-medium text-gray-900 dark:text-white">Starting voice mode...</span>
              </div>
            </div>
          )}
          {!voiceMode && (
            <>
              {imageBase64 && (
                <div className="relative inline-block mb-2 md:mb-3">
                  <img src={imageBase64} alt="Upload preview" className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm" />
                  <button 
                    onClick={() => setImageBase64(null)}
                    className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 p-1 bg-white rounded-full shadow border text-gray-500 hover:text-red-500"
                    aria-label="Remove image"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div
                className="flex items-end gap-1.5 md:gap-2 bg-white/95 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-1.5 md:p-2 shadow-sm transition-all"
                style={{
                  borderColor: 'color-mix(in srgb, var(--primary-color) 10%, rgb(229 231 235))',
                  boxShadow: '0 8px 30px rgba(15, 23, 42, 0.06)',
                }}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleImageUpload} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 md:p-2 mb-1 rounded-xl text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                  title="Add Image"
                  aria-label="Add image"
                >
                  <ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <button 
                  onClick={toggleListening}
                  className={`p-1.5 md:p-2 mb-1 rounded-xl transition-colors flex-shrink-0 ${isListening ? 'text-red-500 bg-red-50 hover:bg-red-100 dark:bg-red-900/20' : 'text-primary hover:bg-surface-hover'}`}
                  title={isListening ? "Stop listening" : "Start speaking"}
                  aria-label={isListening ? 'Stop dictation' : 'Dictate message'}
                  aria-pressed={isListening}
                >
                  {isListening ? <MicOff size={16} className="md:w-[18px] md:h-[18px]" /> : <Mic size={16} className="md:w-[18px] md:h-[18px]" />}
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? 'Listening...' : 'Tell me what to do...'}
                  aria-label="Message Master AI"
                  className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none px-1.5 md:px-2 py-2 md:py-2.5 max-h-32 overflow-y-auto"
                  rows={1}
                  style={{ minHeight: '36px' }}
                  disabled={isProcessing}
                />
                {isProcessing ? (
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="p-2 md:p-2.5 mb-0.5 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-surface-hover transition-colors flex-shrink-0"
                    title="Stop"
                    aria-label="Stop waiting for reply"
                  >
                    <Square size={16} className="md:w-[18px] md:h-[18px]" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendCommand()}
                    disabled={!input.trim() && !imageBase64}
                    className="p-2 md:p-2.5 mb-0.5 text-white rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    title="Send"
                    aria-label="Send message"
                  >
                    <Send size={16} className="md:w-[18px] md:h-[18px]" />
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 text-center mt-1.5 md:mt-2 px-2">
                <span className="hidden sm:inline">{persona.footer(schoolName)}</span>
                <span className="sm:hidden">Review your request before sending.</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// CONVERSATION SIDEBAR ITEM
// ==========================================
const ConversationItem = ({
  conversation,
  isActive,
  onClick,
  onDelete,
  onRename,
}: {
  conversation: MasterAIConversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const renameRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  // Close the menu on outside click or Escape
  useEffect(() => {
    if (!showMenu) return;
    const onPointer = (e: MouseEvent) => {
      if (!itemRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMenu(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showMenu]);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== conversation.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  return (
    <div
      ref={itemRef}
      onClick={isRenaming ? undefined : onClick}
      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'text-primary font-medium'
          : 'text-gray-700 dark:text-gray-300 hover:bg-surface-hover'
      }`}
      style={isActive ? { backgroundColor: 'color-mix(in srgb, var(--primary-color) 10%, transparent)' } : undefined}
    >
      <MessageSquare size={14} className="flex-shrink-0 opacity-50" />

      {isRenaming ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            ref={renameRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setIsRenaming(false); setShowMenu(false); } }}
            className="flex-1 text-xs bg-white dark:bg-slate-600 border border-gray-300 dark:border-slate-500 focus:border-primary rounded px-2 py-1 outline-none text-gray-900 dark:text-white min-w-0"
            aria-label="Conversation name"
            onClick={e => e.stopPropagation()}
          />
          <button onClick={(e) => { e.stopPropagation(); handleRenameSubmit(); }} className="p-0.5 text-green-600 hover:text-green-700" aria-label="Save name"><Check size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); setIsRenaming(false); setShowMenu(false); }} className="p-0.5 text-gray-400 hover:text-gray-600" aria-label="Cancel rename"><X size={14} /></button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{conversation.title}</span>
          <div className={`flex items-center gap-0.5 ${isActive || showMenu ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'} transition-opacity`}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 rounded hover:bg-surface-hover transition-colors"
              aria-label={`Options for ${conversation.title}`}
              aria-haspopup="menu"
              aria-expanded={showMenu}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </>
      )}

      {/* Dropdown menu */}
      {showMenu && !isRenaming && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 min-w-[120px]">
          <button
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(conversation.title); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-surface-hover"
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-surface-hover-danger"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// WELCOME SCREEN
// ==========================================
const WelcomeScreen = ({ onCommand, schoolName, logoUrl, persona, quickCommands, classPicker }: {
  onCommand: (cmd: string) => void;
  schoolName: string;
  logoUrl?: string;
  persona: Persona;
  quickCommands: QuickCommand[];
  classPicker?: { classes: TeacherClass[]; value: string; onChange: (id: string) => void };
}) => (
  <div className="flex flex-col items-center justify-center min-h-full py-6 md:py-8 px-4 md:px-4">
    {logoUrl ? (
      <img
        src={logoUrl}
        alt={schoolName}
        className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-contain bg-white dark:bg-slate-800 p-2 shadow-sm border border-gray-200 dark:border-slate-700 mb-4 md:mb-6"
      />
    ) : (
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center mb-4 md:mb-6 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--accent-color))' }}>
        <Sparkles className="w-8 h-8 md:w-10 md:h-10" />
      </div>
    )}
    <div className="mb-3 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
      {persona.badge(schoolName)}
    </div>
    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center px-2">
      {persona.heading(schoolName)}
    </h3>
    <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm mb-2 text-center max-w-md px-2">
      {persona.intro}
    </p>
    <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 md:mb-6 text-center px-2">
      Pick a starter to edit it before sending.
    </p>

    {classPicker && (
      <label className="mb-4 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        Starters for
        <select
          value={classPicker.value}
          onChange={e => classPicker.onChange(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
        >
          {classPicker.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="">Any class</option>
        </select>
      </label>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 w-full max-w-2xl px-2">
      {quickCommands.map((cmd, i) => (
        <button
          key={i}
          onClick={() => onCommand(cmd.command)}
          className="flex items-center gap-2 md:gap-3 p-3 md:p-4 bg-white/95 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 transition-all text-left group shadow-sm hover:-translate-y-0.5"
          style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 10%, rgb(229 231 235))' }}
        >
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)', color: 'var(--primary-color)' }}>
            <cmd.icon size={16} className="md:w-[18px] md:h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">{cmd.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{cmd.command}</p>
          </div>
          <ArrowRight size={12} className="md:w-[14px] md:h-[14px] text-gray-300 dark:text-gray-600 flex-shrink-0 transition-colors" style={{ color: 'var(--primary-color)' }} />
        </button>
      ))}
    </div>

    <div className="mt-6 md:mt-8 rounded-xl p-4 md:p-5 border max-w-lg w-full mx-2 shadow-sm bg-white/85 dark:bg-slate-800/80" style={{ borderColor: 'color-mix(in srgb, var(--primary-color) 12%, rgb(226 232 240))' }}>
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Zap size={14} className="flex-shrink-0" style={{ color: 'var(--primary-color)' }} />
        <span>{persona.capabilitiesTitle(schoolName)}</span>
      </h4>
      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
        {persona.capabilities.map(item => (
          <li key={item} className="flex items-start gap-2"><span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--primary-color)' }}>•</span><span>{item}</span></li>
        ))}
      </ul>
    </div>
  </div>
);

// ==========================================
// MESSAGE BUBBLE
// ==========================================
const MessageBubble = ({
  message,
  onSuggestionClick,
  onTogglePlay,
  isSpeaking,
  onResolvePending,
  busy,
}: {
  message: ChatMessage;
  onSuggestionClick: (cmd: string) => void;
  onTogglePlay: () => void;
  isSpeaking: boolean;
  onResolvePending: (accept: boolean) => void;
  busy: boolean;
}) => {
  const isUser = message.role === 'user';
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.isLoading) {
    return (
      <div className="flex gap-3" role="status">
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)' }}>
          <Sparkles size={16} className="text-primary" />
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={14} className="animate-spin text-primary" />
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-2 md:gap-3 justify-end">
        <div className="max-w-[90%] md:max-w-[85%] text-white bg-primary rounded-2xl rounded-br-md px-3 md:px-4 py-2.5 md:py-3 shadow-sm">
          {message.image && (
            <img src={message.image} alt="User upload" className="rounded-lg mb-2 max-w-full max-h-48 md:max-h-60 object-cover border border-white/30" />
          )}
          {message.content && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
          <p className="text-xs text-white/70 mt-1">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 md:gap-3">
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1" style={{ backgroundColor: 'color-mix(in srgb, var(--primary-color) 12%, transparent)' }}>
        <Sparkles size={14} className="md:w-4 md:h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-2 md:space-y-3">
        {/* Message Text */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-3 md:px-4 py-2.5 md:py-3 border border-gray-200 dark:border-slate-700 inline-block max-w-[90%] md:max-w-[85%]">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-gray-900 dark:text-white leading-relaxed">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          {message.errorDetail && (
            <details className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <summary className="cursor-pointer select-none">Details</summary>
              <p className="mt-1 break-words">{message.errorDetail}</p>
            </details>
          )}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex-wrap text-xs text-gray-400">
            <button
              onClick={onTogglePlay}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
              aria-pressed={isSpeaking}
            >
              {isSpeaking ? <Square size={12} /> : <Volume2 size={12} />}
              {isSpeaking ? 'Stop' : 'Read aloud'}
            </button>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">•</span>
            <button
              onClick={() => { navigator.clipboard.writeText(message.content); toast.success('Copied'); }}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              aria-label="Copy reply"
            >
              <Copy size={12} /> Copy
            </button>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">•</span>
            <span>{time}</span>
          </div>
        </div>

        {/* Confirmation */}
        {message.pending && (
          <div className="max-w-[90%] md:max-w-[85%] rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} aria-hidden="true" /> Needs your confirmation
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800 dark:text-gray-200">
              {message.pending.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            {message.pendingState === 'open' ? (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => onResolvePending(true)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => onResolvePending(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-slate-600 hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : message.pendingState && (
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5" role="status">
                {message.pendingState === 'running' && <Loader2 size={12} className="animate-spin text-primary" />}
                {PENDING_STATE_TEXT[message.pendingState]}
              </p>
            )}
          </div>
        )}

        {/* Action Results */}
        {message.actions && message.actions.length > 0 && (
          <div className="space-y-2 max-w-[90%] md:max-w-[85%]">
            {message.actions.map((action, i) => (
              <ActionResult key={i} action={action} />
            ))}
          </div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {message.suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(suggestion)}
                title={suggestion}
                className="text-xs px-2.5 md:px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:text-primary hover:border-primary transition-colors flex items-center gap-1"
              >
                <ChevronRight size={12} className="flex-shrink-0" />
                <span className="truncate max-w-[240px] md:max-w-[320px]">{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// SMART DATA FORMATTER — Human-readable rendering
// ==========================================

/** Format a date string nicely */
const formatDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
};

/** Format currency */
const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-ZM', { style: 'currency', currency: 'ZMW', minimumFractionDigits: 0 }).format(n);

/** Render a key-value stat row */
const StatRow = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 md:py-2 px-2 md:px-3 rounded-lg bg-white/60 dark:bg-slate-800/60">
    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 md:gap-2 truncate">
      {icon && <span className="flex-shrink-0 text-primary">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
    <span className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0 ml-2">{value}</span>
  </div>
);

/** Human-friendly label from camelCase / snake_case keys */
const humanizeKey = (key: string): string => {
  const map: Record<string, string> = {
    activeStudents: 'Active Students',
    activeTeachers: 'Active Teachers',
    totalClasses: 'Total Classes',
    totalSubjects: 'Total Subjects',
    totalTerms: 'Academic Terms',
    totalCalendarEvents: 'Calendar Events',
    totalRevenue: 'Total Revenue',
    attendanceRate: 'Attendance Rate',
    firstName: 'First Name',
    lastName: 'Last Name',
    admissionNumber: 'Admission No.',
    dateOfBirth: 'Date of Birth',
    enrollmentDate: 'Enrollment Date',
    feeAmount: 'Fee Amount',
    startDate: 'Start Date',
    endDate: 'End Date',
    eventType: 'Type',
    createdAt: 'Created',
    updatedAt: 'Updated',
    expenseNumber: 'Expense No.',
    isActive: 'Active',
    gradeLevel: 'Grade Level',
  };
  if (map[key]) return map[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
};

/** Stat icon by key */
const STAT_ICONS: Record<string, typeof Calendar> = {
  activeStudents: GraduationCap,
  activeTeachers: Users,
  totalClasses: Building2,
  totalSubjects: BookOpen,
  totalTerms: Calendar,
  totalCalendarEvents: CalendarDays,
  totalRevenue: Wallet,
  attendanceRate: BarChart3,
};

const statIcon = (key: string): React.ReactNode => {
  const Icon = STAT_ICONS[key];
  return Icon ? <Icon size={14} aria-hidden="true" /> : null;
};

/** Render statistics object as a nice grid */
const StatsDisplay = ({ data }: { data: Record<string, any> }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
    {Object.entries(data)
      .filter(([k]) => !['id', 'schoolId', 'createdAt', 'updatedAt'].includes(k))
      .map(([key, value]) => (
        <StatRow key={key} label={humanizeKey(key)} value={value} icon={statIcon(key)} />
      ))}
  </div>
);

/** Render an array of items as a clean list */
const ItemListDisplay = ({ items, toolName }: { items: any[]; toolName: string }) => {
  // Determine which fields to show based on tool type
  const getDisplayFields = (): { key: string; label: string }[] => {
    if (toolName.includes('calendar') || toolName.includes('event')) {
      return [
        { key: 'title', label: 'Event' },
        { key: 'startDate', label: 'Date' },
        { key: 'eventType', label: 'Type' },
      ];
    }
    if (toolName.includes('student')) {
      return [
        { key: 'firstName', label: 'Name' },
        { key: 'admissionNumber', label: 'Admission No.' },
        { key: 'status', label: 'Status' },
      ];
    }
    if (toolName.includes('class')) {
      return [
        { key: 'name', label: 'Class Name' },
        { key: 'gradeLevel', label: 'Grade' },
        { key: 'capacity', label: 'Capacity' },
      ];
    }
    if (toolName.includes('subject')) {
      return [
        { key: 'name', label: 'Subject' },
        { key: 'code', label: 'Code' },
      ];
    }
    if (toolName.includes('fee')) {
      return [
        { key: 'name', label: 'Fee Name' },
        { key: 'amount', label: 'Amount' },
        { key: 'frequency', label: 'Frequency' },
      ];
    }
    if (toolName.includes('scholarship')) {
      return [
        { key: 'name', label: 'Scholarship' },
        { key: 'percentage', label: 'Discount' },
      ];
    }
    if (toolName.includes('expense')) {
      return [
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount' },
        { key: 'category', label: 'Category' },
      ];
    }
    if (toolName.includes('term')) {
      return [
        { key: 'name', label: 'Term' },
        { key: 'startDate', label: 'Start' },
        { key: 'endDate', label: 'End' },
      ];
    }
    if (toolName.includes('announcement')) {
      return [
        { key: 'title', label: 'Title' },
        { key: 'priority', label: 'Priority' },
      ];
    }
    if (toolName.includes('user')) {
      return [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
      ];
    }
    if (toolName.includes('timetable') || toolName.includes('period')) {
      return [
        { key: 'dayOfWeek', label: 'Day' },
        { key: 'startTime', label: 'Start' },
        { key: 'endTime', label: 'End' },
      ];
    }
    // Generic fallback
    return Object.keys(items[0] || {})
      .filter(k => !['id', 'schoolId', 'createdAt', 'updatedAt', 'userId', 'classId', 'subjectId', 'teacherId', 'termId'].includes(k))
      .slice(0, 3)
      .map(k => ({ key: k, label: humanizeKey(k) }));
  };

  const fields = getDisplayFields();
  const displayItems = items.slice(0, 20); // Cap at 20 for readability
  const hasMore = items.length > 20;

  const formatValue = (item: any, key: string): string => {
    const val = item[key];
    if (val === null || val === undefined) return '—';
    if (key === 'firstName') return `${item.firstName || ''} ${item.lastName || ''}`.trim();
    if (key === 'amount' || key === 'feeAmount') return formatCurrency(Number(val));
    if (key === 'percentage') return `${val}%`;
    if (key === 'startDate' || key === 'endDate' || key === 'date') return formatDate(String(val));
    if (key === 'eventType' || key === 'status' || key === 'category' || key === 'frequency' || key === 'priority' || key === 'role') {
      return String(val).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  return (
    <div className="space-y-1 overflow-x-auto">
      {/* Header row */}
      <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 min-w-max">
        {fields.map(f => (
          <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">
            {f.label}
          </span>
        ))}
      </div>
      {/* Data rows */}
      {displayItems.map((item, idx) => (
        <div key={item.id || idx} className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 transition-colors min-w-max">
          {fields.map(f => (
            <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-xs text-gray-700 dark:text-gray-300 truncate">
              {formatValue(item, f.key)}
            </span>
          ))}
        </div>
      ))}
      {hasMore && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
          ... and {items.length - 20} more items
        </p>
      )}
    </div>
  );
};

/** Smart data renderer — picks the best visualization for the data type */
const SmartDataDisplay = ({ data, toolName }: { data: any; toolName: string }) => {
  if (!data) return null;

  // Stats tool — plain object with numeric values
  if (toolName === 'get_school_statistics' || (typeof data === 'object' && !Array.isArray(data) && !data.created && !data.deleted && !data.summary)) {
    return <StatsDisplay data={data} />;
  }

  // Resilient format: { created: [], updated?: [], existing?: [], errors: [], summary: string }
  if (data.created || data.updated || data.existing) {
    const sections: { label: string; Icon: typeof Calendar; items: any[] }[] = [];
    if (data.created?.length) sections.push({ label: 'Newly Created', Icon: Sparkles, items: data.created });
    if (data.updated?.length) sections.push({ label: 'Updated', Icon: RefreshCw, items: data.updated });
    if (data.existing?.length) sections.push({ label: 'Already Existed', Icon: Info, items: data.existing });

    return (
      <div className="space-y-2 md:space-y-3">
        {sections.map(sec => (
          <div key={sec.label}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <sec.Icon size={12} aria-hidden="true" /> {sec.label} ({sec.items.length})
            </p>
            <ItemListDisplay items={sec.items} toolName={toolName} />
          </div>
        ))}
        {data.errors?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-500 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <AlertTriangle size={12} aria-hidden="true" /> Issues ({data.errors.length})
            </p>
            <div className="space-y-1">
              {data.errors.map((err: string, i: number) => (
                <p key={i} className="text-xs text-red-500 dark:text-red-400 px-2 md:px-3 py-1.5 rounded-lg bg-red-50/50 dark:bg-red-900/10">
                  {err}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Array of items (list tools)
  if (Array.isArray(data) && data.length > 0) {
    return <ItemListDisplay items={data} toolName={toolName} />;
  }

  // Delete result
  if (typeof data?.deleted === 'number') {
    return (
      <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
        <p className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <Trash2 size={12} aria-hidden="true" /> {data.deleted} item{data.deleted !== 1 ? 's' : ''} removed
        </p>
      </div>
    );
  }

  // Fallback — simple key-value for plain objects
  if (typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data).filter(([k]) => !['id', 'schoolId'].includes(k));
    if (entries.length > 0 && entries.length <= 12) {
      return <StatsDisplay data={data} />;
    }
  }

  // Last resort — formatted text (not raw JSON)
  return (
    <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
      <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </p>
    </div>
  );
};

// ==========================================
// ACTION RESULT CARD
// ==========================================

// Where to see the result of each tool in the app
const ACTION_LINK_GROUPS: [to: string, label: string, tools: string[]][] = [
  ['/academics?tab=calendar', 'Calendar', ['add_calendar_events', 'list_calendar_events', 'delete_calendar_events']],
  ['/students', 'Students', ['create_students', 'search_students']],
  ['/classes', 'Classes', ['create_classes', 'list_classes', 'assign_subjects_to_classes', 'cleanup_class_subjects']],
  ['/subjects', 'Subjects', ['create_subjects', 'list_subjects', 'list_topics', 'generate_syllabus', 'populate_all_syllabi', 'cleanup_invalid_syllabi', 'create_topics', 'delete_topics']],
  ['/academics?tab=lesson-plans&view=plans', 'Lesson plans', ['generate_lesson_plans', 'list_lesson_plans', 'get_lesson_plan_content']],
  ['/academics?tab=lesson-plans', 'Syllabus coverage', ['check_syllabus_progress']],
  ['/academics?tab=assessments', 'Assessments', ['generate_assessments', 'create_assessments']],
  ['/academics?tab=homework', 'Homework', ['generate_homework']],
  ['/academics/gradebook', 'Gradebook', ['get_class_insights']],
  ['/academics?tab=reports', 'Report cards', ['generate_report_remarks']],
  ['/academics?tab=terms', 'Terms', ['create_academic_terms']],
  ['/academics?tab=timetable', 'Timetable', ['create_timetable_periods']],
  ['/finance', 'Finance', ['create_fee_templates', 'list_fee_templates', 'create_scholarships', 'create_expenses', 'search_payments', 'get_payment_analytics', 'get_student_payment_history', 'get_student_fee_balances', 'get_invoice_summary']],
  ['/users', 'Users', ['list_users']],
  ['/communication', 'Communication', ['create_announcements', 'send_notifications', 'send_sms']],
];
const ACTION_LINKS = new Map(ACTION_LINK_GROUPS.flatMap(([to, label, tools]) => tools.map(tool => [tool, { to, label }] as const)));

const ActionResult = ({ action }: { action: MasterAIAction }) => {
  const [expanded, setExpanded] = useState(false); // Collapsed by default — message is the hero
  const hasData = !!action.data;
  const link = action.success ? ACTION_LINKS.get(action.tool) : undefined;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        action.success
          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30'
          : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center">
        <button
          type="button"
          disabled={!hasData}
          aria-expanded={hasData ? expanded : undefined}
          className="flex-1 min-w-0 text-left flex items-center justify-between px-2.5 md:px-3 py-2 md:py-2.5 enabled:cursor-pointer enabled:hover:bg-white/30 dark:enabled:hover:bg-slate-800/30 transition-colors gap-2"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
            {action.success ? (
              <CheckCircle2 size={14} className="md:w-4 md:h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            ) : (
              <XCircle size={14} className="md:w-4 md:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{action.summary}</span>
          </div>
          {hasData && (
            <ChevronDown size={14} className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        {link && (
          <Link
            to={link.to}
            className="flex-shrink-0 inline-flex items-center gap-0.5 px-2.5 md:px-3 py-2 text-xs font-medium text-primary hover:underline"
            aria-label={`Open ${link.label}`}
          >
            {link.label} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Error */}
      {action.error && !action.success && (
        <p className="text-xs text-red-600 dark:text-red-400 px-2.5 md:px-3 pb-2 ml-5 md:ml-6">
          {action.error}
        </p>
      )}

      {/* Smart Data Display */}
      {expanded && action.data && (
        <div className="px-2.5 md:px-3 pb-2.5 md:pb-3">
          <SmartDataDisplay data={action.data} toolName={action.tool} />
        </div>
      )}
    </div>
  );
};

export default MasterAI;
