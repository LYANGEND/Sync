import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, CheckCircle2, XCircle, ChevronRight,
  Calendar, BookOpen, GraduationCap,
  CreditCard, Bell, BarChart3, ArrowRight, Zap, Terminal,
  Copy, Trash2, ChevronDown, Plus, MessageSquare, MoreHorizontal,
  Pencil, Check, X, Search, PanelLeftClose, PanelLeft,
  Mic, MicOff, ImagePlus, Volume2, Phone, PhoneOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import masterAIService, { MasterAIAction, MasterAIConversation } from '../../services/masterAIService';
import ReactMarkdown from 'react-markdown';
import { useVoiceConversation } from '../../hooks/useVoiceConversation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  actions?: MasterAIAction[];
  suggestions?: string[];
  timestamp: Date;
  isLoading?: boolean;
}

const quickCommands = [
  {
    icon: Calendar,
    label: 'Add Zambian Holidays',
    command: 'Add all public holidays for Zambia for 2025 to the academic calendar',
    color: 'blue',
  },
  {
    icon: Calendar,
    label: 'Add Zimbabwe Holidays',
    command: 'Add all public holidays for Zimbabwe for 2025 to the academic calendar',
    color: 'emerald',
  },
  {
    icon: Calendar,
    label: 'Add SA Holidays',
    command: 'Add all public holidays for South Africa for 2025 to the academic calendar',
    color: 'amber',
  },
  {
    icon: BookOpen,
    label: 'Create Subjects',
    command: 'Create standard primary school subjects: Mathematics, English, Science, Social Studies, Physical Education, Art, Music, Computer Studies',
    color: 'purple',
  },
  {
    icon: GraduationCap,
    label: 'Setup Classes',
    command: 'Create classes for a primary school from Grade 1 to Grade 7 with capacity 40 each',
    color: 'pink',
  },
  {
    icon: CreditCard,
    label: 'Setup Fee Structure',
    command: 'Create fee templates: Tuition Fee (500 per term), Transport Fee (100 per month), Computer Lab Fee (50 per term), Uniform Fee (150 once off)',
    color: 'cyan',
  },
  {
    icon: BarChart3,
    label: 'School Statistics',
    command: 'Show me the current school statistics - how many students, teachers, classes, etc.',
    color: 'orange',
  },
  {
    icon: Bell,
    label: 'Create Announcement',
    command: 'Create a high priority announcement for all teachers and parents: "School will be closed next Friday for staff development day"',
    color: 'red',
  },
];

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const errorCountRef = useRef<number>(0);
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

  // Play response audio when new assistant message arrives (TTS)
  const playResponseAudio = async (text: string) => {
    try {
      setIsAISpeaking(true);
      const blob = await masterAIService.generateSpeech(text);
      const url = URL.createObjectURL(blob);
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      
      audio.onended = () => {
        setIsAISpeaking(false);
        // In voice mode, automatically start listening again after AI finishes speaking
        if (voiceMode && !isProcessing) {
          setTimeout(() => startListening(), 500);
        }
      };
      
      await audio.play();
    } catch (e) {
      console.error('Failed to play TTS', e);
      setIsAISpeaking(false);
    }
  };

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

      // Set up audio analysis for silence detection in voice mode
      if (voiceMode) {
        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        // Connect analyser between compressor and gain for accurate silence detection
        speechComp.disconnect(outputGain);
        speechComp.connect(analyser);
        analyser.connect(outputGain);

        // Monitor audio levels with speech-aware silence detection
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let speechDetected = false;
        let silenceStart: number | null = null;
        const recordStart = Date.now();
        // Post-noise-cancellation the background floor is near-zero,
        // so lower threshold catches real speech more reliably.
        const SILENCE_THRESHOLD = 8;        // ↓ from 10 — NC removes noise floor
        const SILENCE_AFTER_SPEECH = 1000;  // 1s — snappy turn-taking
        const MAX_WAIT_FOR_SPEECH = 4000;   // 4s — give user time to start talking
        const MAX_RECORDING = 30000;        // 30s hard cap

        // Safety net: hard max recording
        const maxRecordTimer = setTimeout(() => {
          console.log('[MasterAI] Max recording reached (30s), stopping');
          stopListening();
        }, MAX_RECORDING);

        const checkAudioLevel = () => {
          if (!analyserRef.current || !isListening) {
            clearTimeout(maxRecordTimer);
            return;
          }
          
          analyser.getByteFrequencyData(dataArray);
          // Use RMS for better energy measurement
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
          const rms = Math.sqrt(sum / bufferLength);
          const now = Date.now();

          if (rms > SILENCE_THRESHOLD) {
            // Sound detected
            speechDetected = true;
            silenceStart = null;
          } else {
            if (speechDetected) {
              // Silence after speech — wait SILENCE_AFTER_SPEECH before stopping
              if (silenceStart === null) {
                silenceStart = now;
              } else if (now - silenceStart > SILENCE_AFTER_SPEECH) {
                console.log('[MasterAI] Silence after speech detected, stopping');
                clearTimeout(maxRecordTimer);
                stopListening();
                return;
              }
            } else if (now - recordStart > MAX_WAIT_FOR_SPEECH) {
              // No speech detected for MAX_WAIT period
              console.log('[MasterAI] No speech detected, stopping');
              clearTimeout(maxRecordTimer);
              stopListening();
              return;
            }
          }

          requestAnimationFrame(checkAudioLevel);
        };

        checkAudioLevel();
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Clean up audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Only process if we have meaningful audio (> 0.5 seconds)
        if (audioBlob.size < 5000) {
          // Too short, probably just noise
          if (voiceMode && !isProcessing && errorCountRef.current < 3) {
            setTimeout(() => startListening(), 500);
          }
          return;
        }
        
        try {
          const transcribedText = await masterAIService.transcribeAudio(audioBlob);
          
          // Reset error count on success
          errorCountRef.current = 0;
          
          if (voiceMode) {
            // In voice mode, automatically send the command
            if (transcribedText.trim()) {
              await sendCommand(transcribedText);
            } else {
              // Empty transcription, restart listening
              if (errorCountRef.current < 3) {
                setTimeout(() => startListening(), 500);
              }
            }
          } else {
            // In normal mode, just populate the input field
            setInput(prev => (prev + ' ' + transcribedText).trim());
          }
        } catch (e) {
          console.error('Transcription error:', e);
          errorCountRef.current += 1;
          
          // After 3 consecutive errors, exit voice mode
          if (errorCountRef.current >= 3) {
            toast.error('Audio service unavailable. Exiting voice mode.');
            setVoiceMode(false);
            setIsListening(false);
            return;
          }
          
          toast.error('Failed to transcribe audio');
          
          if (voiceMode && !isProcessing) {
            // Restart listening with exponential backoff
            const backoffDelay = Math.min(1000 * Math.pow(2, errorCountRef.current - 1), 5000);
            setTimeout(() => startListening(), backoffDelay);
          }
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Microphone error:', err);
      toast.error('Microphone access denied or not available');
      setIsListening(false);
      if (voiceMode) {
        setVoiceMode(false); // Exit voice mode if mic fails
      }
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const toggleVoiceMode = async () => {
    if (voiceMode || voice.isActive) {
      // Exit voice mode
      voice.stopVoiceMode();
      stopListening();
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      setVoiceMode(false);
      setIsAISpeaking(false);
      errorCountRef.current = 0;
    } else {
      // Enter smooth voice mode
      setVoiceMode(true);
      errorCountRef.current = 0;

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

  // Close sidebar on mobile when clicking outside or after selecting conversation
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // Delete a conversation
  const handleDeleteConversation = async (convoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await masterAIService.deleteConversation(convoId);
      setConversations(prev => prev.filter(c => c.id !== convoId));
      if (activeConversationId === convoId) {
        startNewChat();
      }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Send command
  const sendCommand = async (command?: string) => {
    const text = command || input.trim();
    if (!text || isProcessing) return;

    const currentImage = imageBase64;
    
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
      content: 'Processing your command...',
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsProcessing(true);

    try {
      const result = await masterAIService.executeCommand(text, activeConversationId || undefined, currentImage || undefined);

      // If a new conversation was created, update state
      if (result.isNewConversation || !activeConversationId) {
        setActiveConversationId(result.conversationId);
        loadConversations(); // Refresh sidebar
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.message,
        actions: result.actions,
        suggestions: result.suggestions,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev.filter(m => !m.isLoading), assistantMsg]);
      playResponseAudio(result.message);

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

      const successCount = result.actions?.filter(a => a.success).length || 0;
      const failCount = result.actions?.filter(a => !a.success).length || 0;
      if (successCount > 0) toast.success(`${successCount} action(s) completed successfully`);
      if (failCount > 0) toast.error(`${failCount} action(s) failed`);
    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error.response?.data?.error || 'Failed to process command. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev.filter(m => !m.isLoading), errorMsg]);
      toast.error('Command failed');
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

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 dark:bg-slate-900 relative overflow-hidden">
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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
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
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none focus:border-purple-300 dark:focus:border-purple-600 transition-colors"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={24} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">No conversations yet</p>
              <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            groupedConversations.map(group => (
              <div key={group.label} className="mb-3">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.label}
                </p>
                {group.items.map(convo => (
                  <ConversationItem
                    key={convo.id}
                    conversation={convo}
                    isActive={convo.id === activeConversationId}
                    onClick={() => loadConversation(convo.id)}
                    onDelete={(e) => handleDeleteConversation(convo.id, e)}
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
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
                <span className="truncate">Master AI Ops</span>
                <span className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium flex-shrink-0">BETA</span>
              </h2>
              <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <span className="hidden sm:inline">Natural language control across all modules</span>
                <span className="sm:hidden">AI Operations</span>
              </p>
            </div>
            {activeConversationId && (
              <button
                onClick={startNewChat}
                className="p-2 rounded-lg text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex-shrink-0"
                title="New Chat"
              >
                <Plus size={16} className="md:w-[18px] md:h-[18px]" />
              </button>
            )}
            <button
              onClick={toggleVoiceMode}
              className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                voiceMode
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30 animate-pulse'
                  : 'text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'
              }`}
              title={voiceMode ? 'End Voice Call' : 'Start Voice Call'}
            >
              {voiceMode ? <PhoneOff size={16} className="md:w-[18px] md:h-[18px]" /> : <Phone size={16} className="md:w-[18px] md:h-[18px]" />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4 md:py-6 space-y-3 md:space-y-4">
          {loadingConversation ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen onCommand={sendCommand} />
          ) : (
            messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onSuggestionClick={sendCommand}
                onPlayAudio={playResponseAudio}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Commands Strip */}
        {messages.length > 0 && (
          <div className="px-3 md:px-4 pb-2 flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {quickCommands.slice(0, 4).map((cmd, i) => (
                <button
                  key={i}
                  onClick={() => sendCommand(cmd.command)}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full text-[11px] md:text-xs font-medium whitespace-nowrap bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <cmd.icon size={12} className="flex-shrink-0" />
                  <span className="hidden sm:inline">{cmd.label}</span>
                  <span className="sm:hidden">{cmd.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="px-3 md:px-4 pb-3 md:pb-4 flex-shrink-0">
          {/* Compact floating voice panel — keeps page visible */}
          {voiceMode && voice.isActive && (
            <div className="mb-3 relative rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-purple-500/10 overflow-hidden">
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
                <p className="text-[10px] text-white/20">
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
            <div className="mb-3 p-6 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800/30">
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={40} className="text-purple-600 animate-spin" />
                <span className="text-base font-medium text-gray-900 dark:text-white">Starting voice mode...</span>
              </div>
            </div>
          )}
          {!voiceMode && (
            <>
              {imageBase64 && (
                <div className="relative inline-block mb-2 md:mb-3">
                  <img src={imageBase64} alt="Upload preview" className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-purple-200 shadow-sm" />
                  <button 
                    onClick={() => setImageBase64(null)}
                    className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 p-1 bg-white rounded-full shadow border text-gray-500 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-1.5 md:gap-2 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-1.5 md:p-2 shadow-sm focus-within:border-purple-300 dark:focus-within:border-purple-600 focus-within:ring-1 focus-within:ring-purple-100 dark:focus-within:ring-purple-900/30 transition-all">
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleImageUpload} 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 md:p-2 mb-1 rounded-xl text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors flex-shrink-0"
                  title="Add Image"
                >
                  <ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <button 
                  onClick={toggleListening}
                  className={`p-1.5 md:p-2 mb-1 rounded-xl transition-colors flex-shrink-0 ${isListening ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
                  title={isListening ? "Stop listening" : "Start speaking"}
                >
                  {isListening ? <MicOff size={16} className="md:w-[18px] md:h-[18px]" /> : <Mic size={16} className="md:w-[18px] md:h-[18px]" />}
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? 'Listening...' : 'Tell me what to do...'}
                  className="flex-1 resize-none bg-transparent text-xs md:text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none px-1.5 md:px-2 py-2 md:py-2.5 max-h-32"
                  rows={1}
                  style={{ minHeight: '36px' }}
                  disabled={isProcessing}
                />
                <button
                  onClick={() => sendCommand()}
                  disabled={(!input.trim() && !imageBase64) || isProcessing}
                  className="p-2 md:p-2.5 mb-0.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {isProcessing ? <Loader2 size={16} className="md:w-[18px] md:h-[18px] animate-spin" /> : <Send size={16} className="md:w-[18px] md:h-[18px]" />}
                </button>
              </div>
              <p className="text-[9px] md:text-[10px] text-gray-400 text-center mt-1.5 md:mt-2 px-2">
                <span className="hidden sm:inline">Master AI can look at images, listen to your voice, and manage data across all modules. Actions are executed immediately.</span>
                <span className="sm:hidden">AI can process images, voice, and execute actions immediately.</span>
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
  onDelete: (e: React.MouseEvent) => void;
  onRename: (title: string) => void;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== conversation.title) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  return (
    <div
      onClick={isRenaming ? undefined : onClick}
      className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
      }`}
    >
      <MessageSquare size={14} className="flex-shrink-0 opacity-50" />

      {isRenaming ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            ref={renameRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setIsRenaming(false); setShowMenu(false); } }}
            className="flex-1 text-xs bg-white dark:bg-slate-600 border border-purple-300 dark:border-purple-600 rounded px-2 py-1 outline-none text-gray-900 dark:text-white min-w-0"
            onClick={e => e.stopPropagation()}
          />
          <button onClick={(e) => { e.stopPropagation(); handleRenameSubmit(); }} className="p-0.5 text-green-600 hover:text-green-700"><Check size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); setIsRenaming(false); setShowMenu(false); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      ) : (
        <>
          <span className="flex-1 text-xs truncate">{conversation.title}</span>
          <div className={`flex items-center gap-0.5 ${isActive || showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </>
      )}

      {/* Dropdown menu */}
      {showMenu && !isRenaming && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 min-w-[120px]">
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); setRenameValue(conversation.title); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-600"
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            onClick={(e) => { setShowMenu(false); onDelete(e); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
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
const WelcomeScreen = ({ onCommand }: { onCommand: (cmd: string) => void }) => (
  <div className="flex flex-col items-center justify-center min-h-full py-6 md:py-8 px-4 md:px-4">
    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-4 md:mb-6">
      <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-purple-600 dark:text-purple-400" />
    </div>
    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center px-2">
      What would you like me to do?
    </h3>
    <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm mb-6 md:mb-8 text-center max-w-md px-2">
      Tell me in plain English and I'll execute it across any module — calendar, students, classes, fees, and more.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 w-full max-w-2xl px-2">
      {quickCommands.map((cmd, i) => (
        <button
          key={i}
          onClick={() => onCommand(cmd.command)}
          className="flex items-center gap-2 md:gap-3 p-3 md:p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 transition-all text-left group"
        >
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
            <cmd.icon size={16} className="md:w-[18px] md:h-[18px]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">{cmd.label}</p>
            <p className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">{cmd.command}</p>
          </div>
          <ArrowRight size={12} className="md:w-[14px] md:h-[14px] text-gray-300 dark:text-gray-600 flex-shrink-0 group-hover:text-purple-500 transition-colors" />
        </button>
      ))}
    </div>

    <div className="mt-6 md:mt-8 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 rounded-xl p-4 md:p-5 border border-purple-100 dark:border-purple-800/30 max-w-lg w-full mx-2">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <Zap size={14} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
        <span>What can I do?</span>
      </h4>
      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Add public holidays by country to the academic calendar</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Create classes, subjects, and fee structures</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Search for students, teachers, and users</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Create announcements and send notifications</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Set up academic terms and assessment schedules</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>Record expenses and manage scholarships</span></li>
        <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5 flex-shrink-0">•</span><span>View school statistics and analytics</span></li>
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
  onPlayAudio,
}: {
  message: ChatMessage;
  onSuggestionClick: (cmd: string) => void;
  onPlayAudio: (text: string) => void;
}) => {
  const isUser = message.role === 'user';
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayClick = async () => {
    setIsPlaying(true);
    await onPlayAudio(message.content);
    // Ideally we track when audio finishes, but we can just use a timeout or assume done
    setTimeout(() => setIsPlaying(false), 2000); 
  };

  if (message.isLoading) {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 size={14} className="animate-spin text-purple-500" />
            Processing your command...
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-2 md:gap-3 justify-end">
        <div className="max-w-[90%] md:max-w-[85%] bg-purple-600 text-white rounded-2xl rounded-br-md px-3 md:px-4 py-2.5 md:py-3">
          {message.image && (
            <img src={message.image} alt="User upload" className="rounded-lg mb-2 max-w-full max-h-48 md:max-h-60 object-cover border border-purple-400" />
          )}
          {message.content && (
            <p className="text-xs md:text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
          <p className="text-[9px] md:text-[10px] text-purple-200 mt-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 md:gap-3">
      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-1">
        <Sparkles size={14} className="md:w-4 md:h-4 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-2 md:space-y-3">
        {/* Message Text */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-3 md:px-4 py-2.5 md:py-3 border border-gray-200 dark:border-slate-700 inline-block max-w-[90%] md:max-w-[85%]">
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs md:text-sm text-gray-900 dark:text-white leading-relaxed">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700 flex-wrap">
            <button
              onClick={handlePlayClick}
              disabled={isPlaying}
              className="flex items-center gap-1 text-[9px] md:text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
            >
              {isPlaying ? <Loader2 size={10} className="animate-spin" /> : <Volume2 size={10} />}
              {isPlaying ? 'Playing' : 'Play'}
            </button>
            <span className="text-[9px] md:text-[10px] text-gray-300 dark:text-gray-600">•</span>
            <button
              onClick={() => { navigator.clipboard.writeText(message.content); toast.success('Copied!'); }}
              className="flex items-center gap-1 text-[9px] md:text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <Copy size={10} /> Copy
            </button>
            <span className="text-[9px] md:text-[10px] text-gray-300 dark:text-gray-600">•</span>
            <span className="text-[9px] md:text-[10px] text-gray-400">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

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
                className="text-[10px] md:text-xs px-2.5 md:px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-600 transition-colors flex items-center gap-1"
              >
                <ChevronRight size={10} />
                <span className="truncate max-w-[200px]">{suggestion}</span>
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
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

/** Render a key-value stat row */
const StatRow = ({ label, value, icon }: { label: string; value: string | number; icon?: string }) => (
  <div className="flex items-center justify-between py-1.5 md:py-2 px-2 md:px-3 rounded-lg bg-white/60 dark:bg-slate-800/60">
    <span className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 md:gap-2 truncate">
      {icon && <span className="flex-shrink-0">{icon}</span>}
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
const statIcon = (key: string): string => {
  const map: Record<string, string> = {
    activeStudents: '👨‍🎓',
    activeTeachers: '👩‍🏫',
    totalClasses: '🏫',
    totalSubjects: '📚',
    totalTerms: '📅',
    totalCalendarEvents: '🗓️',
    totalRevenue: '💰',
    attendanceRate: '📊',
  };
  return map[key] || '📌';
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
          <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-[9px] md:text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">
            {f.label}
          </span>
        ))}
      </div>
      {/* Data rows */}
      {displayItems.map((item, idx) => (
        <div key={item.id || idx} className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 transition-colors min-w-max">
          {fields.map(f => (
            <span key={f.key} className="flex-1 min-w-[80px] md:min-w-[100px] text-[10px] md:text-xs text-gray-700 dark:text-gray-300 truncate">
              {formatValue(item, f.key)}
            </span>
          ))}
        </div>
      ))}
      {hasMore && (
        <p className="text-[9px] md:text-[10px] text-gray-400 dark:text-gray-500 text-center pt-1">
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
    const sections: { label: string; emoji: string; items: any[] }[] = [];
    if (data.created?.length) sections.push({ label: 'Newly Created', emoji: '✨', items: data.created });
    if (data.updated?.length) sections.push({ label: 'Updated', emoji: '🔄', items: data.updated });
    if (data.existing?.length) sections.push({ label: 'Already Existed', emoji: 'ℹ️', items: data.existing });

    return (
      <div className="space-y-2 md:space-y-3">
        {sections.map(sec => (
          <div key={sec.label}>
            <p className="text-[9px] md:text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <span>{sec.emoji}</span> {sec.label} ({sec.items.length})
            </p>
            <ItemListDisplay items={sec.items} toolName={toolName} />
          </div>
        ))}
        {data.errors?.length > 0 && (
          <div>
            <p className="text-[9px] md:text-[10px] font-semibold text-red-500 uppercase tracking-wider px-1.5 md:px-2 mb-1 flex items-center gap-1.5">
              <span>⚠️</span> Issues ({data.errors.length})
            </p>
            <div className="space-y-1">
              {data.errors.map((err: string, i: number) => (
                <p key={i} className="text-[10px] md:text-xs text-red-500 dark:text-red-400 px-2 md:px-3 py-1.5 rounded-lg bg-red-50/50 dark:bg-red-900/10">
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
        <p className="text-[10px] md:text-xs text-gray-700 dark:text-gray-300">
          🗑️ {data.deleted} item{data.deleted !== 1 ? 's' : ''} removed successfully
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
      <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </p>
    </div>
  );
};

// ==========================================
// ACTION RESULT CARD
// ==========================================
const ActionResult = ({ action }: { action: MasterAIAction }) => {
  const [expanded, setExpanded] = useState(false); // Collapsed by default — message is the hero

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        action.success
          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30'
          : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 md:px-3 py-2 md:py-2.5 cursor-pointer hover:bg-white/30 dark:hover:bg-slate-800/30 transition-colors gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
          {action.success ? (
            <CheckCircle2 size={14} className="md:w-4 md:h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          ) : (
            <XCircle size={14} className="md:w-4 md:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          )}
          <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-white truncate">{action.summary}</span>
        </div>
        {action.data && (
          <ChevronDown size={12} className="md:w-[14px] md:h-[14px] text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}" />
        )}
      </div>

      {/* Error */}
      {action.error && !action.success && (
        <p className="text-[10px] md:text-xs text-red-600 dark:text-red-400 px-2.5 md:px-3 pb-2 ml-5 md:ml-6">
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
