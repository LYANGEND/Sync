import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GraduationCap, Send, Plus, Trash2, MessageSquare, Sparkles, BookOpen,
  FileText, Star, ChevronLeft, Loader2, AlertCircle, Command, Package,
  Users, BarChart3, Download, Eye, X, Save, ArrowRight, BookMarked
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import aiAssistantService, { Conversation, Message, FavoritePrompt, Artifact, SystemSubject, SubjectTopic } from '../../services/aiAssistantService';
import toast from 'react-hot-toast';
import { useAppDialog } from '../../components/ui/AppDialogProvider';

interface TeachingClass {
  id: string;
  name: string;
  gradeLevel: number;
  studentCount: number;
  isClassTeacher: boolean;
  subjects: string[];
}

interface StudentInsight {
  id: string;
  name: string;
  averageScore: number | null;
  attendanceRate: number | null;
  riskLevel: 'high' | 'medium' | 'low';
}

const SLASH_COMMANDS = [
  { command: '/lesson', description: 'Generate a lesson plan', icon: BookOpen },
  { command: '/quiz', description: 'Create quiz questions', icon: FileText },
  { command: '/rubric', description: 'Create an assessment rubric', icon: Star },
  { command: '/email', description: 'Draft a parent email', icon: MessageSquare },
  { command: '/tips', description: 'Get teaching tips', icon: Sparkles },
  { command: '/differentiate', description: 'Differentiate for learners', icon: Command },
  { command: '/gap', description: 'Detect curriculum gaps for a class', icon: AlertCircle },
  { command: '/career', description: 'Career & subject path advice for a student', icon: GraduationCap },
];

const AIAssistant = () => {
    const { confirm, prompt } = useAppDialog();
  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showCommands, setShowCommands] = useState(false);
  const [favorites, setFavorites] = useState<FavoritePrompt[]>([]);

  // Teaching context state
  const [teachingClasses, setTeachingClasses] = useState<TeachingClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  // All system subjects (for the subject picker and AI curriculum awareness)
  const [allSubjects, setAllSubjects] = useState<SystemSubject[]>([]);
  const [subjectsByGrade, setSubjectsByGrade] = useState<Record<number, SystemSubject[]>>({});
  const [selectedSubjectTopics, setSelectedSubjectTopics] = useState<SubjectTopic[]>([]);

  // Panel state
  const [activePanel, setActivePanel] = useState<'chat' | 'artifacts' | 'insights'>('chat');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [studentInsights, setStudentInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadInitialData = async () => {
    try {
      const [statusData, convsData, favsData, ctxData, subjectsData] = await Promise.all([
        aiAssistantService.getStatus(),
        aiAssistantService.getConversations(),
        aiAssistantService.getFavorites().catch(() => []),
        aiAssistantService.getTeachingContext().catch(() => ({ classes: [], subjects: [] })),
        aiAssistantService.getAllSubjects().catch(() => ({ subjects: [], byGrade: {} })),
      ]);
      setAiAvailable(statusData.available);
      setConversations(convsData);
      setFavorites(favsData as FavoritePrompt[]);
      setTeachingClasses(ctxData.classes || []);
      setAllSubjects(subjectsData.subjects || []);
      setSubjectsByGrade(subjectsData.byGrade || {});
    } catch (error) {
      console.error('Error loading AI assistant:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createConversation = async () => {
    try {
      const data = await aiAssistantService.createConversation('New Conversation');
      setConversations(prev => [data, ...prev]);
      selectConversation(data.id);
    } catch {
      toast.error('Failed to create conversation');
    }
  };

  const selectConversation = useCallback(async (id: string) => {
    setActiveConversation(id);
    setShowSidebar(false);
    setActivePanel('chat');
    try {
      const data = await aiAssistantService.getConversation(id);
      setMessages(data.messages || []);
    } catch {
      toast.error('Failed to load conversation');
    }
  }, []);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({
      title: 'Delete conversation?',
      message: 'Delete this conversation?',
      confirmText: 'Delete conversation',
    }))) return;
    try {
      await aiAssistantService.deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversation === id) {
        setActiveConversation(null);
        setMessages([]);
      }
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    // Build context from selected class/subject
    const selectedClass = teachingClasses.find(c => c.id === selectedClassId);
    const selectedSubject = allSubjects.find(s => s.id === selectedSubjectId);
    const context: any = {};
    if (selectedClassId) {
      context.classId = selectedClassId;
      context.className = selectedClass?.name;
      context.gradeLevel = selectedClass?.gradeLevel;
    }
    if (selectedSubjectId && selectedSubject) {
      context.subjectId = selectedSubjectId;
      context.subject = selectedSubject.name;
      context.subjectCode = selectedSubject.code;
    }

    // Create conversation if needed
    let convId = activeConversation;
    if (!convId) {
      try {
        const data = await aiAssistantService.createConversation(userMessage.slice(0, 50));
        convId = data.id;
        setActiveConversation(convId);
        setConversations(prev => [data, ...prev]);
      } catch {
        toast.error('Failed to create conversation');
        setSending(false);
        return;
      }
    }

    // Add user message to UI immediately
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // Check for slash commands
      const isCommand = userMessage.startsWith('/');
      let res;

      if (isCommand) {
        const parts = userMessage.split(' ');
        const command = parts[0];
        const topic = parts.slice(1).join(' ');
        res = await aiAssistantService.executeCommand(convId!, command, topic);
      } else {
        res = await aiAssistantService.sendMessage(convId!, userMessage);
      }

      const assistantMsg: Message = {
        id: res.message?.id || `ai-${Date.now()}`,
        role: 'assistant',
        content: res.message?.content || (res as any).reply || 'No response',
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: unknown) {
      const errMsg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to get response';
      toast.error(errMsg);
      // Remove the temp user message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setInput(userMessage);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setShowCommands(e.target.value === '/');
  };

  const insertCommand = (command: string) => {
    setInput(command + ' ');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const useFavorite = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // Derived state
  const selectedClass = teachingClasses.find(c => c.id === selectedClassId);
  // Subjects for the picker: filter by selected class grade if a class is chosen
  const subjectsForPicker: SystemSubject[] = selectedClass
    ? (subjectsByGrade[selectedClass.gradeLevel] || [])
    : allSubjects;
  const selectedSubject = allSubjects.find(s => s.id === selectedSubjectId);


  // Artifact methods
  const loadArtifacts = async () => {
    setLoadingArtifacts(true);
    try {
      const data = await aiAssistantService.getArtifacts();
      setArtifacts(data as Artifact[]);
    } catch { toast.error('Failed to load artifacts'); }
    finally { setLoadingArtifacts(false); }
  };

  const saveAsArtifact = async (content: string) => {
    const title = await prompt({
      title: 'Save artifact',
      message: 'Give this artifact a name.',
      defaultValue: 'AI Generated Content',
      placeholder: 'Artifact name',
      confirmText: 'Save artifact',
    });
    if (!title?.trim()) return;
    try {
      const data = await aiAssistantService.saveArtifact({
        conversationId: activeConversation || undefined, type: 'OTHER', title, content,
      });
      setArtifacts(prev => [data as Artifact, ...prev]);
      toast.success('Saved to artifacts!');
    } catch { toast.error('Failed to save artifact'); }
  };

  const deleteArtifactItem = async (id: string) => {
    if (!(await confirm({
      title: 'Delete artifact?',
      message: 'Delete this artifact?',
      confirmText: 'Delete artifact',
    }))) return;
    try {
      await aiAssistantService.deleteArtifact(id);
      setArtifacts(prev => prev.filter(a => a.id !== id));
      toast.success('Artifact deleted');
    } catch { toast.error('Failed to delete'); }
  };

  // Student insights
  const loadStudentInsights = async () => {
    if (!selectedClassId) { toast.error('Select a class first'); return; }
    setLoadingInsights(true);
    try {
      const data = await aiAssistantService.getStudentInsights({
        classId: selectedClassId,
        subjectId: selectedSubjectId || undefined,
      });
      setStudentInsights(data);
    } catch { toast.error('Failed to load insights'); }
    finally { setLoadingInsights(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-gray-50 dark:bg-slate-900">
      {/* Sidebar - Conversations */}
      <div className={`
        ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        fixed md:relative z-30 w-80 h-full bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700
        transition-transform flex flex-col
      `}>
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={createConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            New Conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors group ${
                activeConversation === conv.id
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{conv.title}</p>
                <p className="text-xs text-gray-400">
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <GraduationCap className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new conversation above</p>
            </div>
          )}
        </div>

        {/* Favorite Prompts */}
        {favorites.length > 0 && (
          <div className="border-t border-gray-200 dark:border-slate-700 p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Quick Prompts</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {favorites.map(fav => (
                <button
                  key={fav.id}
                  onClick={() => useFavorite(fav.prompt)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 truncate flex items-center gap-1.5"
                >
                  <Star className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                  {fav.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header with context picker */}
        <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <GraduationCap className="w-6 h-6 text-purple-600" />
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 dark:text-white">AI Teaching Assistant</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {aiAvailable ? (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Online
                    {selectedClass && <span className="ml-2 text-purple-600 dark:text-purple-400">• {selectedClass.name}</span>}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-yellow-600">
                    <AlertCircle className="w-3 h-3" /> AI not configured — contact admin
                  </span>
                )}
              </p>
            </div>
            {/* Panel tabs */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
              <button onClick={() => setActivePanel('chat')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activePanel === 'chat' ? 'bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >Chat</button>
              <button onClick={() => { setActivePanel('artifacts'); loadArtifacts(); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activePanel === 'artifacts' ? 'bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >Artifacts</button>
              <button onClick={() => { setActivePanel('insights'); if (selectedClassId) loadStudentInsights(); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${activePanel === 'insights' ? 'bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >Insights</button>
            </div>
          </div>

          {/* Class / Subject Context Picker */}
          {(teachingClasses.length > 0 || allSubjects.length > 0) && (
            <div className="flex flex-col gap-2 px-4 pb-3">
              <div className="flex items-center gap-3">
                {teachingClasses.length > 0 && (
                  <select value={selectedClassId}
                    onChange={(e) => { setSelectedClassId(e.target.value); setSelectedSubjectId(''); setSelectedSubjectTopics([]); }}
                    className="text-xs bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                  >
                    <option value="">All Classes</option>
                    {teachingClasses.map(c => (
                      <option key={c.id} value={c.id}>{c.name} (Grade {c.gradeLevel}) — {c.studentCount} students{c.isClassTeacher ? ' ★' : ''}</option>
                    ))}
                  </select>
                )}
                <select value={selectedSubjectId}
                  onChange={(e) => {
                    setSelectedSubjectId(e.target.value);
                    const subj = allSubjects.find(s => s.id === e.target.value);
                    setSelectedSubjectTopics(subj?.topics || []);
                  }}
                  className="text-xs bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="">All Subjects</option>
                  {selectedClass ? (
                    // Show subjects for selected class grade
                    subjectsForPicker.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))
                  ) : (
                    // Show all subjects grouped by grade
                    Object.entries(subjectsByGrade)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([grade, subjects]) => (
                        <optgroup key={grade} label={Number(grade) > 0 ? `Grade ${grade}` : 'General'}>
                          {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                          ))}
                        </optgroup>
                      ))
                  )}
                </select>
                {(selectedClassId || selectedSubjectId) && (
                  <button onClick={() => { setSelectedClassId(''); setSelectedSubjectId(''); setSelectedSubjectTopics([]); }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Topics pills for selected subject */}
              {selectedSubjectTopics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <BookMarked className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                  {selectedSubjectTopics
                    .filter(t => !selectedClass || t.gradeLevel === selectedClass.gradeLevel || t.gradeLevel === 0)
                    .slice(0, 7)
                    .map(topic => (
                      <span key={topic.id}
                        className="text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                        {topic.title}
                      </span>
                    ))}
                  {selectedSubjectTopics.filter(t => !selectedClass || t.gradeLevel === selectedClass.gradeLevel || t.gradeLevel === 0).length > 7 && (
                    <span className="text-[10px] text-gray-400">
                      +{selectedSubjectTopics.filter(t => !selectedClass || t.gradeLevel === selectedClass.gradeLevel || t.gradeLevel === 0).length - 7} more
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== Chat Panel ===== */}
        {activePanel === 'chat' && (<>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                How can I help you teach today?
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mb-2">
                I can create lesson plans, quizzes, rubrics, email drafts, and more.
              </p>
              {selectedClass && (
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-6">
                  📚 Context: <strong>{selectedClass.name}</strong>{selectedSubject ? ` · ${selectedSubject.name}` : ''} — I know your class data!
                </p>
              )}
              {!selectedClass && selectedSubject && (
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-6">
                  📖 Subject: <strong>{selectedSubject.name}</strong>{selectedSubjectTopics.length > 0 ? ` · ${selectedSubjectTopics.length} curriculum topics loaded` : ''}
                </p>
              )}
              {!selectedClass && !selectedSubject && (teachingClasses.length > 0 || allSubjects.length > 0) && (
                <p className="text-xs text-gray-400 mb-6">
                  💡 Select a class or subject above for curriculum-aware responses
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {SLASH_COMMANDS.slice(0, 4).map(cmd => (
                  <button
                    key={cmd.command}
                    onClick={() => insertCommand(cmd.command)}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 transition-colors text-left"
                  >
                    <cmd.icon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{cmd.command}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{cmd.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <GraduationCap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-br-md'
                    : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 rounded-bl-md'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({children}) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                          h2: ({children}) => <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>,
                          h3: ({children}) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
                          p: ({children}) => <p className="mb-2 text-sm leading-relaxed">{children}</p>,
                          ul: ({children}) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-sm">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-sm">{children}</ol>,
                          strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                          table: ({children}) => <div className="overflow-x-auto my-2"><table className="min-w-full border border-gray-200 dark:border-slate-600 rounded text-xs">{children}</table></div>,
                          thead: ({children}) => <thead className="bg-gray-50 dark:bg-slate-700">{children}</thead>,
                          th: ({children}) => <th className="px-3 py-1.5 text-left font-semibold border-b border-gray-200 dark:border-slate-600">{children}</th>,
                          td: ({children}) => <td className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-700">{children}</td>,
                          blockquote: ({children}) => <blockquote className="border-l-4 border-purple-400 pl-3 my-2 italic text-gray-500">{children}</blockquote>,
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700">
                      <button onClick={() => saveAsArtifact(msg.content)}
                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-purple-600 transition-colors" title="Save">
                        <Save className="w-3 h-3" /> Save
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied!'); }}
                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-purple-600 transition-colors" title="Copy">
                        <Download className="w-3 h-3" /> Copy
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                )}
                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Slash Commands Dropdown */}
        {showCommands && (
          <div className="mx-4 mb-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-lg overflow-hidden">
            {SLASH_COMMANDS.map(cmd => (
              <button
                key={cmd.command}
                onClick={() => insertCommand(cmd.command)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <cmd.icon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{cmd.command}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{cmd.description}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Input Area */}
        <div className="px-4 pb-4">
          <div className="flex items-end gap-2 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-2 shadow-sm">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={aiAvailable
                ? selectedSubject
                  ? `Ask about ${selectedSubject.name}${selectedClass ? ` in ${selectedClass.name}` : ''} or type / for commands...`
                  : selectedClass ? `Ask about ${selectedClass.name} or type / for commands...` : 'Ask anything or type / for commands...'
                : 'AI is not configured. Contact admin to enable.'}
              disabled={!aiAvailable || sending}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none px-2 py-2 max-h-32"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending || !aiAvailable}
              className="p-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-2">
            AI may make mistakes. Verify important information.
          </p>
        </div>
        </>)}

        {/* ===== Artifacts Panel ===== */}
        {activePanel === 'artifacts' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" /> Saved Artifacts
              </h3>
              <p className="text-xs text-gray-400">{artifacts.length} items</p>
            </div>
            {loadingArtifacts ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>
            ) : artifacts.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No artifacts yet</p>
                <p className="text-xs mt-1">Save AI responses from chat to build your library</p>
              </div>
            ) : (
              <div className="space-y-3">
                {artifacts.map(a => (
                  <ArtifactCard key={a.id} artifact={a} onDelete={deleteArtifactItem} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== Student Insights Panel ===== */}
        {activePanel === 'insights' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" /> Student Performance
              </h3>
              {selectedClassId && (
                <button onClick={loadStudentInsights} disabled={loadingInsights}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  {loadingInsights ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />} Refresh
                </button>
              )}
            </div>
            {!selectedClassId ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a class above</p>
                <p className="text-xs mt-1">Choose a class to see student insights</p>
              </div>
            ) : loadingInsights ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-purple-600" /></div>
            ) : studentInsights ? (
              <div>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Students', value: studentInsights.totalStudents },
                    { label: 'Class Average', value: studentInsights.classAverage !== null ? `${studentInsights.classAverage}%` : '—' },
                    { label: 'At Risk', value: studentInsights.atRiskCount, color: studentInsights.atRiskCount > 0 ? 'text-red-600' : 'text-green-600' },
                    { label: 'Term', value: studentInsights.term || '—' },
                  ].map((card, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-200 dark:border-slate-700">
                      <p className="text-xs text-gray-500">{card.label}</p>
                      <p className={`text-xl font-bold ${card.color || 'text-gray-900 dark:text-white'}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
                {/* Students Table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-slate-700">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Student</th>
                          <th className="px-3 py-2 text-center font-semibold">Average</th>
                          <th className="px-3 py-2 text-center font-semibold">Attendance</th>
                          <th className="px-3 py-2 text-center font-semibold">Risk</th>
                          <th className="px-3 py-2 text-left font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {studentInsights.students.map((s: StudentInsight) => (
                          <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-slate-750">
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{s.name}</td>
                            <td className="px-3 py-2 text-center">
                              {s.averageScore !== null ? (
                                <span className={`font-semibold ${s.averageScore >= 60 ? 'text-green-600' : s.averageScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {s.averageScore}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {s.attendanceRate !== null ? (
                                <span className={`font-semibold ${s.attendanceRate >= 80 ? 'text-green-600' : s.attendanceRate >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {s.attendanceRate}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                s.riskLevel === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                s.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              }`}>{s.riskLevel}</span>
                            </td>
                            <td className="px-3 py-2">
                              {s.riskLevel !== 'low' && (
                                <button onClick={() => {
                                  setActivePanel('chat');
                                  setInput(`How can I help ${s.name} improve? They have an average of ${s.averageScore}% and ${s.attendanceRate}% attendance.`);
                                  inputRef.current?.focus();
                                }}
                                className="flex items-center gap-1 text-purple-600 hover:text-purple-800 dark:text-purple-400">
                                  <ArrowRight className="w-3 h-3" /> Ask AI
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click Refresh to load insights</p>
              </div>
            )}
          </div>
        )}

        {/* Mobile Panel Tabs */}
        <div className="sm:hidden flex items-center gap-1 px-4 pb-2">
          {(['chat', 'artifacts', 'insights'] as const).map(panel => (
            <button key={panel} onClick={() => { setActivePanel(panel); if (panel === 'artifacts') loadArtifacts(); if (panel === 'insights' && selectedClassId) loadStudentInsights(); }}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${activePanel === panel ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
            >{panel.charAt(0).toUpperCase() + panel.slice(1)}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// Artifact Card Component
// ==========================================
const ArtifactCard = ({ artifact, onDelete }: { artifact: Artifact; onDelete: (id: string) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const typeColors: Record<string, string> = {
    LESSON_PLAN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    QUIZ: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    RUBRIC: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeColors[artifact.type] || typeColors.OTHER}`}>
            {artifact.type.replace('_', ' ')}
          </span>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{artifact.title}</p>
          {artifact.published && <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-[10px]">Published</span>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <Eye className="w-4 h-4" />
          </button>
          <button onClick={() => { navigator.clipboard.writeText(artifact.content); toast.success('Copied!'); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(artifact.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-slate-700 pt-3">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {artifact.content}
            </ReactMarkdown>
          </div>
        </div>
      )}
      <div className="px-4 pb-2">
        <p className="text-[10px] text-gray-400">{new Date(artifact.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
};

export default AIAssistant;
