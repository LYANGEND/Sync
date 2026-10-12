import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, Menu, SquarePen, Phone, PhoneOff, CalendarDays,
} from 'lucide-react';
import toast from 'react-hot-toast';
import masterAIService, { MasterAIAction, MasterAIConversation, MasterAIResponse } from '../../services/masterAIService';
import { useVoiceConversation } from '../../hooks/useVoiceConversation';
import { useActiveTerm } from '../../hooks/useActiveTerm';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import api from '../../utils/api';
import type { ChatMessage, PendingState } from '../../components/ai/masterAITypes';
import { adminPersona, adminQuickCommands, bursarPersona, bursarQuickCommands, teacherPersona, teacherQuickCommands, TeacherClass } from '../../components/ai/masterAIPersonas';
import { ConversationSidebar } from '../../components/ai/ConversationSidebar';
import { WelcomeScreen } from '../../components/ai/WelcomeScreen';
import { MessageBubble } from '../../components/ai/MessageBubble';
import { VoicePanel } from '../../components/ai/VoicePanel';
import { Composer } from '../../components/ai/Composer';

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

// ==========================================
// MAIN COMPONENT
// ==========================================
const MasterAI = () => {
  const { settings: themeSettings } = useTheme();
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const isBursar = user?.role === 'BURSAR';
  const persona = isTeacher ? teacherPersona : isBursar ? bursarPersona : adminPersona;
  const { activeTerm } = useActiveTerm();
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [focusClassId, setFocusClassId] = useState('');
  const focusClass = teacherClasses.find(c => c.id === focusClassId);
  const quickCommands = isTeacher ? teacherQuickCommands(focusClass) : isBursar ? bursarQuickCommands : adminQuickCommands;

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
  const [isProcessing, setIsProcessing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { confirm } = useAppDialog();
  const [conversations, setConversations] = useState<MasterAIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
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

  // Load a specific conversation's messages
  const loadConversation = async (convoId: string) => {
    setHistoryOpen(false);
    if (convoId === activeConversationId) return;
    setLoadingConversation(true);
    try {
      const { messages: dbMessages } = await masterAIService.getConversation(convoId);
      // Saved replies keep their cards in metadata; a held plan cannot be confirmed after reload
      const chatMsgs: ChatMessage[] = dbMessages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.metadata?.text ?? m.content,
        actions: m.metadata?.actions,
        suggestions: m.metadata?.suggestions,
        pending: m.metadata?.pendingItems ? { items: m.metadata.pendingItems } : undefined,
        pendingState: m.metadata?.pendingItems ? 'closed' : undefined,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(chatMsgs);
      setActiveConversationId(convoId);
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

  const handleRenameConversation = async (convo: MasterAIConversation, newTitle: string) => {
    try {
      await masterAIService.updateConversation(convo.id, newTitle);
      setConversations(prev =>
        prev.map(c => c.id === convo.id ? { ...c, title: newTitle } : c)
      );
    } catch {
      toast.error('Failed to rename');
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
    if (!msg.pending?.token || msg.pendingState !== 'open' || isProcessing) return;
    const token = msg.pending.token;
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

  const schoolName = themeSettings.schoolName || 'Your School';

  return (
    <div
      className="flex h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] bg-white dark:bg-slate-900 relative overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color) 10%, transparent), transparent 30%), radial-gradient(circle at bottom left, color-mix(in srgb, var(--accent-color) 12%, transparent), transparent 28%)',
      }}
    >
      <ConversationSidebar
        mobileOpen={historyOpen}
        onMobileClose={() => setHistoryOpen(false)}
        conversations={conversations}
        activeId={activeConversationId}
        onNewChat={startNewChat}
        onSelect={loadConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* ============ MAIN CHAT AREA ============ */}
      <div className="flex-1 flex flex-col min-w-0 w-full relative">
        {/* Header */}
        <div className="border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5">
            <button
              onClick={() => setHistoryOpen(true)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-surface-hover transition-colors flex-shrink-0"
              aria-label="Open chat history"
            >
              <Menu size={18} />
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
            {activeConversationId && (
              <button
                onClick={startNewChat}
                className="md:hidden p-2 rounded-lg text-primary hover:bg-surface-hover transition-colors flex-shrink-0"
                title="New chat"
                aria-label="New chat"
              >
                <SquarePen size={16} />
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
        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6">
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
            <div className="mx-auto w-full max-w-3xl space-y-3 md:space-y-4">
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSuggestionClick={sendCommand}
                  onTogglePlay={() => togglePlayback(msg)}
                  isSpeaking={speakingId === msg.id}
                  onResolvePending={accept => resolvePending(msg, accept)}
                  busy={isProcessing}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="mx-auto w-full max-w-3xl px-3 md:px-6 pb-3 md:pb-4 flex-shrink-0">
          {voiceMode ? (
            <VoicePanel voice={voice} onEnd={toggleVoiceMode} />
          ) : (
            <Composer
              inputRef={inputRef}
              value={input}
              onChange={setInput}
              onSend={() => sendCommand()}
              onStop={() => abortRef.current?.abort()}
              image={imageBase64}
              onImageChange={setImageBase64}
              isListening={isListening}
              onToggleListening={toggleListening}
              isProcessing={isProcessing}
              footer={persona.footer(schoolName)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MasterAI;
