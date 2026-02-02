import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    Bot, Send, Plus, MessageSquare, Trash2, Loader2, Sparkles,
    BookOpen, FileText, Mail, ClipboardList,
    ChevronRight, History, Zap, Copy, FileDown, Star, Rocket, X, Brain, Target, Layers
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import LessonPlanGenerator from '../../components/teacher-assistant/LessonPlanGenerator';
import QuizGenerator from '../../components/teacher-assistant/QuizGenerator';
import EmailDrafter from '../../components/teacher-assistant/EmailDrafter';
import SlashCommandMenu from '../../components/teacher-assistant/SlashCommandMenu';
import FavoritePrompts from '../../components/teacher-assistant/FavoritePrompts';
import PublishToHomeworkModal from '../../components/teacher-assistant/PublishToHomeworkModal';
import StandardsAlignedGenerator from '../../components/teacher-assistant/StandardsAlignedGenerator';
import BloomsQuestionGenerator from '../../components/teacher-assistant/BloomsQuestionGenerator';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

interface Conversation {
    id: string;
    title: string;
    type: 'CHAT' | 'LESSON_PLAN' | 'QUIZ' | 'EMAIL';
    metadata?: any;
    updatedAt: string;
    _count?: { messages: number };
}

interface UsageStats {
    today: {
        messagesUsed: number;
        tokensUsed: number;
        messagesLimit: number;
        tokensLimit: number;
    };
    weekly: { feature: string; count: number; tokensUsed: number }[];
    recentActivity: { id: string; title: string; type: string; createdAt: string }[];
}

const TeacherAIAssistant = () => {
    const { user } = useAuth();
    const { tab } = useParams<{ tab?: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Map URL params to active tab
    const getActiveTabFromUrl = (): 'dashboard' | 'chat' | 'lesson-plan' | 'quiz' | 'email' | 'history' | 'standards' | 'blooms' | 'differentiate' => {
        if (!tab) return 'dashboard';
        const tabMap: Record<string, 'dashboard' | 'chat' | 'lesson-plan' | 'quiz' | 'email' | 'history' | 'standards' | 'blooms' | 'differentiate'> = {
            'lesson-plan': 'lesson-plan',
            'quiz': 'quiz',
            'email': 'email',
            'chat': 'chat',
            'history': 'history',
            'standards': 'standards',
            'blooms': 'blooms',
            'differentiate': 'differentiate',
        };
        return tabMap[tab] || 'dashboard';
    };

    const [activeTab, setActiveTab] = useState<'dashboard' | 'chat' | 'lesson-plan' | 'quiz' | 'email' | 'history' | 'standards' | 'blooms' | 'differentiate'>(getActiveTabFromUrl());
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [exportingId, setExportingId] = useState<string | null>(null);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishConversationId, setPublishConversationId] = useState<string | null>(null);
    const [publishQuizTitle, setPublishQuizTitle] = useState('');
    const [showFavorites, setShowFavorites] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Sync active tab with URL changes
    useEffect(() => {
        const newTab = getActiveTabFromUrl();
        if (newTab !== activeTab) {
            setActiveTab(newTab);
        }
    }, [tab, location.pathname]);

    // Navigate when tab changes internally
    const handleTabChange = (newTab: 'dashboard' | 'chat' | 'lesson-plan' | 'quiz' | 'email' | 'history' | 'standards' | 'blooms' | 'differentiate') => {
        setActiveTab(newTab);
        if (newTab === 'dashboard') {
            navigate('/teacher/ai-assistant');
        } else {
            navigate(`/teacher/ai-assistant/${newTab}`);
        }
    };

    useEffect(() => {
        fetchUsageStats();
        fetchConversations();
        loadDraft();
        
        // Keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + N - New chat
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                startNewChat();
            }
            // Ctrl/Cmd + K - Focus input
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            // Ctrl/Cmd + / - Show slash commands
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                if (activeTab === 'chat') {
                    inputRef.current?.focus();
                    setInputMessage('/');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Auto-save draft
    useEffect(() => {
        if (inputMessage && activeTab === 'chat') {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
            autoSaveTimerRef.current = setTimeout(() => {
                saveDraft();
            }, 3000); // Save after 3 seconds of inactivity
        }
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [inputMessage, activeTab]);

    // Detect slash commands
    useEffect(() => {
        if (inputMessage.startsWith('/') && inputMessage.length > 1 && activeTab === 'chat') {
            const rect = inputRef.current?.getBoundingClientRect();
            if (rect) {
                setSlashMenuPosition({
                    top: rect.top - 300,
                    left: rect.left,
                });
                setShowSlashMenu(true);
            }
        } else {
            setShowSlashMenu(false);
        }
    }, [inputMessage, activeTab]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchUsageStats = async () => {
        try {
            const response = await api.get('/teacher-assistant/usage/stats');
            setUsage(response.data);
        } catch (error) {
            console.error('Failed to fetch usage stats:', error);
        }
    };

    const fetchConversations = async (type?: string) => {
        try {
            setLoadingConversations(true);
            const params = type ? { type } : {};
            const response = await api.get('/teacher-assistant/conversations', { params });
            setConversations(response.data.conversations || response.data);
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        } finally {
            setLoadingConversations(false);
        }
    };

    const loadConversation = async (conversation: Conversation) => {
        try {
            const response = await api.get(`/teacher-assistant/conversations/${conversation.id}`);
            setActiveConversation(response.data);
            setMessages(response.data.messages || []);
            handleTabChange('chat');
        } catch (error) {
            toast.error('Failed to load conversation');
        }
    };

    const deleteConversation = async (id: string) => {
        if (!confirm('Delete this conversation?')) return;
        try {
            await api.delete(`/teacher-assistant/conversations/${id}`);
            setConversations(prev => prev.filter(c => c.id !== id));
            if (activeConversation?.id === id) {
                setActiveConversation(null);
                setMessages([]);
            }
            toast.success('Conversation deleted');
        } catch (error) {
            toast.error('Failed to delete conversation');
        }
    };

    const startNewChat = () => {
        setActiveConversation(null);
        setMessages([]);
        handleTabChange('chat');
    };

    const sendMessage = async () => {
        if (!inputMessage.trim() || sending) return;

        const userMessage: Message = {
            id: `temp-${Date.now()}`,
            role: 'user',
            content: inputMessage.trim(),
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputMessage('');
        setSending(true);
        clearDraft(); // Clear draft after sending

        try {
            const response = await api.post('/teacher-assistant/chat', {
                conversationId: activeConversation?.id,
                message: userMessage.content,
            });

            const aiMessage: Message = response.data.message;
            setMessages(prev => [
                ...prev.filter(m => m.id !== userMessage.id),
                { ...userMessage, id: `user-${Date.now()}` },
                aiMessage,
            ]);

            if (!activeConversation) {
                setActiveConversation({
                    id: response.data.conversationId,
                    title: userMessage.content.slice(0, 50),
                    type: 'CHAT',
                    updatedAt: new Date().toISOString(),
                });
                fetchConversations();
            }

            fetchUsageStats();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to send message');
            setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    const copyAsMarkdown = (text: string) => {
        const markdown = `\`\`\`\n${text}\n\`\`\``;
        navigator.clipboard.writeText(markdown);
        toast.success('Copied as Markdown!');
    };

    const saveDraft = async () => {
        if (!inputMessage.trim()) return;
        try {
            await api.post('/teacher-assistant/drafts', {
                type: 'chat',
                content: inputMessage,
                metadata: { conversationId: activeConversation?.id },
            });
        } catch (error) {
            console.error('Failed to save draft:', error);
        }
    };

    const loadDraft = async () => {
        try {
            const response = await api.get('/teacher-assistant/drafts', {
                params: { type: 'chat' },
            });
            if (response.data && response.data.length > 0) {
                const draft = response.data[0];
                setInputMessage(draft.content);
            }
        } catch (error) {
            console.error('Failed to load draft:', error);
        }
    };

    const clearDraft = async () => {
        try {
            const response = await api.get('/teacher-assistant/drafts', {
                params: { type: 'chat' },
            });
            if (response.data && response.data.length > 0) {
                await api.delete(`/teacher-assistant/drafts/${response.data[0].id}`);
            }
        } catch (error) {
            console.error('Failed to clear draft:', error);
        }
    };

    const handleSlashCommand = (command: any) => {
        setShowSlashMenu(false);
        setInputMessage('');
        
        switch (command.id) {
            case 'lesson':
                handleTabChange('lesson-plan');
                break;
            case 'quiz':
                handleTabChange('quiz');
                break;
            case 'email':
                handleTabChange('email');
                break;
            case 'tips':
                setInputMessage('Give me 5 practical teaching tips for engaging students');
                inputRef.current?.focus();
                break;
            case 'quick':
                setInputMessage('I need quick advice for classroom management');
                inputRef.current?.focus();
                break;
        }
    };

    const handlePublishToHomework = (conversationId: string, title: string) => {
        setPublishConversationId(conversationId);
        setPublishQuizTitle(title);
        setShowPublishModal(true);
    };

    const exportConversation = async (conversationId: string, format: 'pdf' | 'word', title: string) => {
        setExportingId(conversationId);
        try {
            const response = await api.get(`/teacher-assistant/conversations/${conversationId}/export/${format}`, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.${format === 'pdf' ? 'pdf' : 'docx'}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success(`${format.toUpperCase()} downloaded successfully!`);
        } catch (error) {
            console.error('Export error:', error);
            toast.error(`Failed to export ${format.toUpperCase()}`);
        } finally {
            setExportingId(null);
        }
    };

    const quickActions = [
        {
            id: 'standards',
            icon: BookOpen,
            title: 'Standards-Aligned',
            description: 'Create standards-mapped lessons',
            color: 'from-blue-600 to-blue-700',
            shadowColor: 'shadow-blue-600/30',
            badge: 'Academic'
        },
        {
            id: 'blooms',
            icon: Brain,
            title: 'Bloom\'s Questions',
            description: 'Generate cognitive-level questions',
            color: 'from-purple-600 to-purple-700',
            shadowColor: 'shadow-purple-600/30',
            badge: 'Academic'
        },
        {
            id: 'differentiate',
            icon: Layers,
            title: 'Differentiation',
            description: 'Create multi-level content',
            color: 'from-green-600 to-green-700',
            shadowColor: 'shadow-green-600/30',
            badge: 'Academic'
        },
        {
            id: 'lesson-plan',
            icon: FileText,
            title: 'Lesson Plan',
            description: 'Generate detailed lesson plans',
            color: 'from-indigo-600 to-indigo-700',
            shadowColor: 'shadow-indigo-600/30',
            badge: null
        },
        {
            id: 'quiz',
            icon: ClipboardList,
            title: 'Quiz Creator',
            description: 'Create assessments & quizzes',
            color: 'from-blue-500 to-blue-600',
            shadowColor: 'shadow-blue-500/30',
            badge: null
        },
        {
            id: 'email',
            icon: Mail,
            title: 'Email Drafter',
            description: 'Draft professional emails',
            color: 'from-slate-600 to-slate-700',
            shadowColor: 'shadow-slate-600/30',
            badge: null
        },
        {
            id: 'chat',
            icon: MessageSquare,
            title: 'Chat with AI',
            description: 'Ask anything about teaching',
            color: 'from-slate-700 to-slate-800',
            shadowColor: 'shadow-slate-700/30',
            badge: null
        },
    ];

    // Tab navigation items
    const tabItems = [
        { id: 'dashboard', label: 'Dashboard', icon: Sparkles },
        { id: 'standards', label: 'Standards', icon: Target, badge: 'Academic' },
        { id: 'blooms', label: 'Bloom\'s', icon: Brain, badge: 'Academic' },
        { id: 'differentiate', label: 'Differentiate', icon: Layers, badge: 'Academic' },
        { id: 'lesson-plan', label: 'Lesson Plan', icon: BookOpen },
        { id: 'quiz', label: 'Quiz', icon: ClipboardList },
        { id: 'email', label: 'Email', icon: Mail },
        { id: 'chat', label: 'Chat', icon: MessageSquare },
        { id: 'history', label: 'History', icon: History },
    ];

    const renderDashboard = () => (
        <div className="p-6 space-y-8">
            {/* Welcome Banner */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-800 via-blue-900 to-purple-900 rounded-3xl p-8 text-white shadow-2xl border border-slate-700/50">
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-14 h-14 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center">
                                <Bot size={32} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-3xl font-bold">AI Teaching Assistant</h1>
                                    <span className="px-3 py-1 bg-blue-500/30 backdrop-blur-sm rounded-full text-xs font-bold border border-blue-400/30">
                                        🎓 Academic Edition
                                    </span>
                                </div>
                                <p className="text-white/80 text-lg">Hello, {user?.fullName?.split(' ')[0]}! Ready to create standards-aligned content?</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-4">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg">
                                <Target size={16} />
                                <span className="text-sm font-medium">Standards-Aligned</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg">
                                <Brain size={16} />
                                <span className="text-sm font-medium">Bloom's Taxonomy</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg">
                                <Layers size={16} />
                                <span className="text-sm font-medium">Differentiation</span>
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:block">
                        <Sparkles size={120} className="text-white/20" />
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quick Actions</h2>
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                        🎓 Academic Tools Available
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {quickActions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => handleTabChange(action.id as any)}
                            className={`group relative overflow-hidden p-6 rounded-2xl bg-gradient-to-br ${action.color} text-white shadow-xl ${action.shadowColor} hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300`}
                        >
                            {action.badge && (
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold">
                                    {action.badge}
                                </div>
                            )}
                            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
                            <div className="relative z-10">
                                <action.icon size={32} className="mb-3" />
                                <h3 className="font-bold text-lg">{action.title}</h3>
                                <p className="text-white/80 text-sm">{action.description}</p>
                            </div>
                            <ChevronRight className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Usage Stats */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-gray-100 dark:border-slate-700">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Zap className="text-yellow-500" size={20} />
                        Today's Usage
                    </h3>
                    {usage && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-600 dark:text-gray-400">Messages</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {usage.today.messagesUsed} / {usage.today.messagesLimit}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                                        style={{ width: `${(usage.today.messagesUsed / usage.today.messagesLimit) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Weekly Activity</p>
                                <div className="flex flex-wrap gap-2">
                                    {usage.weekly.map((w, i) => (
                                        <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-slate-700 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300">
                                            {w.feature}: {w.count}
                                        </span>
                                    ))}
                                    {usage.weekly.length === 0 && (
                                        <span className="text-sm text-gray-500">No activity this week</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-gray-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <History className="text-purple-500" size={20} />
                            Recent Activity
                        </h3>
                        <button
                            onClick={() => handleTabChange('history')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            View All
                        </button>
                    </div>
                    {usage?.recentActivity && usage.recentActivity.length > 0 ? (
                        <div className="space-y-3">
                            {usage.recentActivity.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => loadConversation(item as any)}
                                    className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.type === 'LESSON_PLAN' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                        item.type === 'QUIZ' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                            item.type === 'EMAIL' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                                'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                                        }`}>
                                        {item.type === 'LESSON_PLAN' ? <BookOpen size={20} /> :
                                            item.type === 'QUIZ' ? <ClipboardList size={20} /> :
                                                item.type === 'EMAIL' ? <Mail size={20} /> :
                                                    <MessageSquare size={20} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 dark:text-white truncate">{item.title}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(item.createdAt).toLocaleDateString()} - {item.type.replace('_', ' ')}
                                        </p>
                                    </div>
                                    <ChevronRight size={20} className="text-gray-400" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <MessageSquare size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500">Start by creating a lesson plan or quiz!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const renderChat = () => (
        <div className="flex h-full">
            {/* Sidebar with Favorite Prompts */}
            {showFavorites && (
                <div className="w-80 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto p-4">
                    <FavoritePrompts
                        onSelectPrompt={(prompt) => {
                            setInputMessage(prompt);
                            inputRef.current?.focus();
                        }}
                    />
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                        <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">
                            💡 Keyboard Shortcuts
                        </p>
                        <div className="space-y-1 text-xs text-blue-700 dark:text-blue-400">
                            <div><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded">Ctrl+Enter</kbd> Send</div>
                            <div><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded">Ctrl+N</kbd> New chat</div>
                            <div><kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded">/</kbd> Commands</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Chat Header */}
                <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                        <Bot size={26} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-bold text-gray-900 dark:text-white">AI Teaching Assistant</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {activeConversation ? activeConversation.title : 'Ask me anything about teaching'}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowFavorites(!showFavorites)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                        title="Toggle favorites"
                    >
                        <Star size={20} className={showFavorites ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
                    </button>
                    <button
                        onClick={startNewChat}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} />
                        New Chat
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center max-w-md">
                                <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/30">
                                    <Sparkles size={40} className="text-white" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">How can I help you today?</h3>
                                <p className="text-gray-500 dark:text-gray-400 mb-6">
                                    Ask me about lesson planning, teaching strategies, classroom management, or any educational topic!
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {[
                                        'Help me with classroom management tips',
                                        'Suggest engaging activities for my lesson',
                                        'How to differentiate instruction?',
                                        'Best practices for assessments',
                                    ].map((prompt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setInputMessage(prompt)}
                                            className="text-left p-3 bg-gray-100 dark:bg-slate-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-md shadow-lg shadow-blue-600/30'
                                        : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 rounded-bl-md shadow-xl'
                                        }`}>
                                        {msg.role === 'assistant' && (
                                            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-slate-700">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                                                        <Bot size={16} className="text-white" />
                                                    </div>
                                                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">AI Assistant</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => copyToClipboard(msg.content)}
                                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                        title="Copy"
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => copyAsMarkdown(msg.content)}
                                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                        title="Copy as Markdown"
                                                    >
                                                        <FileText size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="p-4">
                                            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                                                {msg.content}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {sending && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md p-4 shadow-xl border border-gray-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 text-gray-500">
                                            <Loader2 size={18} className="animate-spin" />
                                            <span className="text-sm">Thinking...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input */}
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
                    <div className="flex items-end gap-3">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type your message or / for commands..."
                                className="w-full px-4 py-3 bg-gray-100 dark:bg-slate-700 border-0 rounded-2xl resize-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                                rows={1}
                                style={{ minHeight: '48px', maxHeight: '120px' }}
                            />
                            {inputMessage && (
                                <button
                                    onClick={() => {
                                        setInputMessage('');
                                        clearDraft();
                                    }}
                                    className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Clear"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={sendMessage}
                            disabled={!inputMessage.trim() || sending}
                            className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-lg shadow-blue-600/30"
                            title="Send (Ctrl+Enter)"
                        >
                            {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-xs">Ctrl+Enter</kbd> to send • Type <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-xs">/</kbd> for commands
                    </p>
                </div>

                {/* Slash Command Menu */}
                {showSlashMenu && (
                    <SlashCommandMenu
                        onSelect={handleSlashCommand}
                        onClose={() => setShowSlashMenu(false)}
                        position={slashMenuPosition}
                    />
                )}
            </div>
        </div>
    );

    const [historyFilter, setHistoryFilter] = useState<string>('all');

    const renderHistory = () => (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Header Section */}
            <div className="px-6 pt-6 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                            Conversation History
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} saved
                        </p>
                    </div>

                    {/* Filter Tabs - Pill Style */}
                    <div className="flex items-center p-1 bg-gray-100/80 dark:bg-slate-800 rounded-xl backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50">
                        {[
                            { id: 'all', label: 'All', icon: null },
                            { id: 'CHAT', label: 'Chat', icon: MessageSquare },
                            { id: 'LESSON_PLAN', label: 'Lesson', icon: BookOpen },
                            { id: 'QUIZ', label: 'Quiz', icon: ClipboardList },
                            { id: 'EMAIL', label: 'Email', icon: Mail },
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => {
                                    setHistoryFilter(type.id);
                                    fetchConversations(type.id === 'all' ? undefined : type.id);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${historyFilter === type.id
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                {type.icon && <type.icon size={14} />}
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                {loadingConversations ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-blue-900/30"></div>
                            <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
                        </div>
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading conversations...</p>
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-slate-800 dark:to-slate-700 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                            <History size={40} className="text-gray-300 dark:text-gray-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No conversations yet</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-sm">
                            Start chatting with the AI assistant to see your conversation history here
                        </p>
                        <button
                            onClick={startNewChat}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                        >
                            <MessageSquare size={16} />
                            Start a conversation
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {conversations.map((conv, index) => (
                            <div
                                key={conv.id}
                                className="group relative bg-white dark:bg-slate-800/80 rounded-xl border border-gray-100 dark:border-slate-700/50 hover:border-blue-200 dark:hover:border-blue-800/50 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                {/* Colored accent bar */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${conv.type === 'LESSON_PLAN' ? 'bg-blue-500' :
                                    conv.type === 'QUIZ' ? 'bg-purple-500' :
                                        conv.type === 'EMAIL' ? 'bg-green-500' :
                                            'bg-orange-500'
                                    }`} />

                                <div className="flex items-center p-4 pl-5">
                                    {/* Icon */}
                                    <div
                                        onClick={() => loadConversation(conv)}
                                        className="flex items-center gap-4 flex-1 cursor-pointer min-w-0"
                                    >
                                        <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${conv.type === 'LESSON_PLAN' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                            conv.type === 'QUIZ' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                                conv.type === 'EMAIL' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                                    'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                                            }`}>
                                            {conv.type === 'LESSON_PLAN' ? <BookOpen size={20} /> :
                                                conv.type === 'QUIZ' ? <ClipboardList size={20} /> :
                                                    conv.type === 'EMAIL' ? <Mail size={20} /> :
                                                        <MessageSquare size={20} />}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {conv.title}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide ${conv.type === 'LESSON_PLAN' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                                    conv.type === 'QUIZ' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                                                        conv.type === 'EMAIL' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                                                            'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                                                    }`}>
                                                    {conv.type.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {new Date(conv.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                                {conv._count && (
                                                    <>
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                                            {conv._count.messages} message{conv._count.messages !== 1 ? 's' : ''}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        {conv.type === 'QUIZ' && !conv.metadata?.publishedAsHomework && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handlePublishToHomework(conv.id, conv.title); }}
                                                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                                                title="Publish as Homework"
                                            >
                                                <Rocket size={16} />
                                            </button>
                                        )}
                                        {conv.metadata?.publishedAsHomework && (
                                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-lg flex items-center gap-1">
                                                <Rocket size={12} />
                                                Published
                                            </span>
                                        )}
                                        {(conv.type === 'LESSON_PLAN' || conv.type === 'QUIZ' || conv.type === 'EMAIL') && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); exportConversation(conv.id, 'pdf', conv.title); }}
                                                    disabled={exportingId === conv.id}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-50"
                                                    title="Export as PDF"
                                                >
                                                    {exportingId === conv.id ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); exportConversation(conv.id, 'word', conv.title); }}
                                                    disabled={exportingId === conv.id}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all disabled:opacity-50"
                                                    title="Export as Word"
                                                >
                                                    {exportingId === conv.id ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                            title="Delete conversation"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // Check if user has AI feature access
    const hasAIAccess = user?.subscription?.tier === 'PROFESSIONAL' || 
                        user?.subscription?.tier === 'ENTERPRISE' ||
                        user?.subscription?.features?.aiLessonPlanEnabled;

    // Show upgrade prompt if no AI access
    if (!hasAIAccess) {
        return (
            <div className="h-[calc(100vh-64px)] bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
                <div className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                        <Sparkles size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                        AI Assistant - Premium Feature
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        The AI Assistant is available exclusively for <strong>Professional</strong> and <strong>Enterprise</strong> subscribers. 
                        Upgrade your plan to unlock AI-powered lesson planning, quiz generation, and more.
                    </p>
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">What you'll get:</h3>
                        <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1 text-left">
                            <li>✨ AI Lesson Plan Generator</li>
                            <li>✨ Quiz & Assessment Creator</li>
                            <li>✨ Email Drafting Assistant</li>
                            <li>✨ Standards-Aligned Content</li>
                            <li>✨ Bloom's Taxonomy Questions</li>
                        </ul>
                    </div>
                    <button
                        onClick={() => navigate('/subscription')}
                        className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
                    >
                        Upgrade Now
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                        Current plan: <span className="font-medium">{user?.subscription?.tier || 'FREE'}</span>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-64px)] bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 overflow-hidden">
            {/* Page Header with Tab Navigation */}
            <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                                <Sparkles size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Assistant</h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Your intelligent teaching companion</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation Bar */}
                <div className="px-6 pb-0">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                        {tabItems.map(item => {
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleTabChange(item.id as any)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap border-b-2 -mb-px relative ${isActive
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700/50 border-transparent'
                                        }`}
                                >
                                    <item.icon size={16} />
                                    {item.label}
                                    {(item as any).badge && (
                                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-[10px] font-bold">
                                            {(item as any).badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="h-[calc(100%-120px)] flex flex-col overflow-hidden">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'chat' && renderChat()}
                {activeTab === 'standards' && <StandardsAlignedGenerator />}
                {activeTab === 'blooms' && <BloomsQuestionGenerator />}
                {activeTab === 'differentiate' && (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <Layers size={64} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Differentiation Engine
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Coming soon! Auto-create content for multiple learning levels.
                            </p>
                        </div>
                    </div>
                )}
                {activeTab === 'lesson-plan' && <LessonPlanGenerator />}
                {activeTab === 'quiz' && <QuizGenerator />}
                {activeTab === 'email' && <EmailDrafter />}
                {activeTab === 'history' && renderHistory()}
            </div>

            {/* Publish to Homework Modal */}
            {showPublishModal && publishConversationId && (
                <PublishToHomeworkModal
                    conversationId={publishConversationId}
                    quizTitle={publishQuizTitle}
                    onClose={() => {
                        setShowPublishModal(false);
                        setPublishConversationId(null);
                        setPublishQuizTitle('');
                    }}
                    onSuccess={() => {
                        fetchConversations();
                    }}
                />
            )}
        </div>
    );
};

export default TeacherAIAssistant;
