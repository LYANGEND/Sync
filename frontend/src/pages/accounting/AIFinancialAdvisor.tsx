import React, { useState, useRef, useEffect } from 'react';
import {
  Coins, Send, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Sparkles, RefreshCw, ChevronDown, ChevronUp,
  Shield, Lightbulb, X, MessageSquare, History, Trash2,
  Plus, Clock, Edit3, Check, Target, Users, Zap,
} from 'lucide-react';
import api from '../../utils/api';

// ========================================
// TYPES
// ========================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: { type: string; params: Record<string, any> };
}

interface QuickInsights {
  healthScore: number;
  healthLabel: string;
  criticalAlerts: Array<{ title: string; description: string; severity: 'high' | 'medium' | 'low' }>;
  recommendations: Array<{ title: string; description: string; impact: string }>;
  keyMetrics: Array<{ label: string; value: string; trend: 'up' | 'down' | 'stable'; isGood: boolean }>;
  snapshot: {
    revenueThisMonth: number;
    expensesThisMonth: number;
    netIncome: number;
    collectionRate: string;
    outstandingFees: number;
  };
}

interface Props {
  embedded?: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

// ========================================
// COMPONENT
// ========================================

const AIFinancialAdvisor: React.FC<Props> = ({ embedded }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<QuickInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showInsights, setShowInsights] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Conversation history state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Suggested questions
  const suggestedQuestions = [
    'How is our fee collection performance this month?',
    'What are the biggest expense categories and are we overspending?',
    'Give me a cash flow forecast for the next 3 months',
    'Which students have the highest outstanding balances?',
    'Are we compliant with ZRA statutory deductions?',
    'How can we improve our revenue collection rate?',
    'Compare this month\'s financial performance to last month',
    'What budget areas need attention?',
    'Send payment reminders to all overdue parents',
    'Create a debt collection campaign for parents owing over 1000',
    'Show me the debtor segmentation breakdown',
    'Which debtors are at highest risk of non-payment?',
  ];

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load quick insights on mount (with cleanup to prevent duplicate calls)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setInsightsLoading(true);
      setInsightsError('');
      try {
        const res = await api.post('/financial/ai-advisor/quick-insights');
        if (!cancelled) setInsights(res.data);
      } catch (error: any) {
        if (!cancelled) {
          const retryAfter = error.response?.data?.retryAfter;
          const msg = error.response?.data?.error || 'Failed to load insights';
          setInsightsError(retryAfter ? `${msg} Try again in ${retryAfter}s.` : msg);
        }
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    };

    load();
    loadConversations();

    return () => { cancelled = true; };
  }, []);

  const loadConversations = async () => {
    setConversationsLoading(true);
    try {
      const res = await api.get('/financial/ai-advisor/conversations');
      setConversations(res.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setConversationsLoading(false);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await api.get(`/financial/ai-advisor/conversations/${id}`);
      const loaded: ChatMessage[] = res.data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }));
      setMessages(loaded);
      setActiveConversationId(id);
      setShowChat(true);
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.delete(`/financial/ai-advisor/conversations/${id}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleRenameConversation = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.patch(`/financial/ai-advisor/conversations/${id}`, { title: renameValue.trim() });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: renameValue.trim() } : c));
      setRenamingId(null);
      setRenameValue('');
    } catch (error) {
      console.error('Failed to rename conversation:', error);
    }
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setShowChat(true);
    setShowHistory(false);
  };

  const loadQuickInsights = async () => {
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const res = await api.post('/financial/ai-advisor/quick-insights');
      setInsights(res.data);
    } catch (error: any) {
      const retryAfter = error.response?.data?.retryAfter;
      const msg = error.response?.data?.error || 'Failed to load insights';
      setInsightsError(retryAfter ? `${msg} Try again in ${retryAfter}s.` : msg);
    } finally {
      setInsightsLoading(false);
    }
  };

  const sendMessage = async (question?: string) => {
    const text = question || input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/financial/ai-advisor', {
        question: text,
        conversationHistory,
        conversationId: activeConversationId || undefined,
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: res.data.answer,
        timestamp: new Date(),
        action: res.data.action || undefined,
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Track conversation ID for persistence
      if (res.data.conversationId) {
        setActiveConversationId(res.data.conversationId);
        // Refresh sidebar list
        loadConversations();
      }
    } catch (error: any) {
      const retryAfter = error.response?.data?.retryAfter;
      const errMsg = error.response?.data?.error || 'Failed to get AI response';
      const display = retryAfter
        ? `⚠️ ${errMsg} Try again in ${retryAfter} seconds.`
        : `⚠️ ${errMsg}`;
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: display, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
      case 'medium': return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
      default: return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle size={16} className="text-red-500" />;
      case 'medium': return <AlertTriangle size={16} className="text-yellow-500" />;
      default: return <Shield size={16} className="text-blue-500" />;
    }
  };

  const getTrendIcon = (trend: string, isGood: boolean) => {
    const color = isGood ? 'text-green-500' : 'text-red-500';
    switch (trend) {
      case 'up': return <TrendingUp size={14} className={color} />;
      case 'down': return <TrendingDown size={14} className={color} />;
      default: return <Minus size={14} className="text-slate-400" />;
    }
  };

  // Parse inline markdown: **bold**, *italic*, `code`, ~~strike~~, [link](url)
  const renderInline = (text: string, keyPrefix: string = '') => {
    const tokens = text.split(/(\*\*.*?\*\*|\*.*?\*|`[^`]+`|~~.*?~~|\[.*?\]\(.*?\))/g);
    return tokens.map((tok, j) => {
      const k = `${keyPrefix}-${j}`;
      if (tok.startsWith('**') && tok.endsWith('**'))
        return <strong key={k} className="font-semibold text-slate-800 dark:text-white">{tok.slice(2, -2)}</strong>;
      if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2)
        return <em key={k} className="italic">{tok.slice(1, -1)}</em>;
      if (tok.startsWith('`') && tok.endsWith('`'))
        return <code key={k} className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-blue-700 dark:text-blue-300 text-xs font-mono">{tok.slice(1, -1)}</code>;
      if (tok.startsWith('~~') && tok.endsWith('~~'))
        return <del key={k} className="text-slate-400 line-through">{tok.slice(2, -2)}</del>;
      const linkMatch = tok.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch)
        return <a key={k} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300">{linkMatch[1]}</a>;
      return <span key={k}>{tok}</span>;
    });
  };

  // Format markdown AI response into rich React elements
  const formatResponse = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code blocks ```
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          <div key={elements.length} className="my-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
            {lang && <div className="bg-slate-200 dark:bg-slate-600 px-3 py-1 text-[10px] font-mono text-slate-500 dark:text-gray-400 uppercase tracking-wider">{lang}</div>}
            <pre className="bg-slate-100 dark:bg-slate-900 px-3 py-2 overflow-x-auto text-xs font-mono text-slate-700 dark:text-gray-300 leading-relaxed">
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        continue;
      }

      // Tables: detect | header | header |
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
        const tableRows: string[] = [trimmed];
        i++;
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableRows.push(lines[i].trim());
          i++;
        }
        // Filter out separator rows (|---|---|)
        const dataRows = tableRows.filter(r => !/^\|[\s\-:|]+\|$/.test(r));
        if (dataRows.length > 0) {
          const parseCells = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());
          const headerCells = parseCells(dataRows[0]);
          const bodyRows = dataRows.slice(1);
          elements.push(
            <div key={elements.length} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-700">
                    {headerCells.map((cell, ci) => (
                      <th key={ci} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-gray-200 text-xs whitespace-nowrap">
                        {renderInline(cell, `th-${ci}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                  {bodyRows.map((row, ri) => {
                    const cells = parseCells(row);
                    return (
                      <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        {cells.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-slate-600 dark:text-gray-300 text-xs">
                            {renderInline(cell, `td-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }

      // Blockquote
      if (trimmed.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('> ')) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <blockquote key={elements.length} className="my-2 border-l-3 border-emerald-400 dark:border-emerald-500 pl-3 py-1 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-r-lg">
            {quoteLines.map((ql, qi) => (
              <p key={qi} className="text-sm text-slate-600 dark:text-gray-300 italic">{renderInline(ql, `bq-${qi}`)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}\s*$/.test(trimmed)) {
        elements.push(<hr key={elements.length} className="my-3 border-slate-200 dark:border-slate-600" />);
        i++;
        continue;
      }

      // Headers
      if (trimmed.startsWith('#### ')) {
        elements.push(
          <h5 key={elements.length} className="font-semibold text-slate-700 dark:text-gray-200 mt-3 mb-1 text-xs uppercase tracking-wide">
            {renderInline(trimmed.slice(5), `h5-${i}`)}
          </h5>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={elements.length} className="font-bold text-slate-800 dark:text-white mt-4 mb-1.5 text-sm flex items-center gap-1.5">
            {renderInline(trimmed.slice(4), `h4-${i}`)}
          </h4>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={elements.length} className="font-bold text-slate-800 dark:text-white mt-4 mb-2 text-base border-b border-slate-200 dark:border-slate-600 pb-1">
            {renderInline(trimmed.slice(3), `h3-${i}`)}
          </h3>
        );
        i++;
        continue;
      }
      if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={elements.length} className="font-bold text-lg text-slate-800 dark:text-white mt-4 mb-2">
            {renderInline(trimmed.slice(2), `h2-${i}`)}
          </h2>
        );
        i++;
        continue;
      }

      // Bullet list — collect consecutive bullets into a group
      if (/^[-•*]\s/.test(trimmed)) {
        const items: { indent: number; text: string }[] = [];
        while (i < lines.length && /^\s*[-•*]\s/.test(lines[i])) {
          const raw = lines[i];
          const indent = raw.search(/\S/);
          const text = raw.replace(/^\s*[-•*]\s+/, '');
          items.push({ indent, text });
          i++;
        }
        const minIndent = Math.min(...items.map(it => it.indent));
        elements.push(
          <ul key={elements.length} className="my-1.5 space-y-1">
            {items.map((item, li) => (
              <li key={li} className="flex items-start gap-2 text-sm text-slate-600 dark:text-gray-300" style={{ paddingLeft: `${(item.indent - minIndent) * 12}px` }}>
                <span className="text-emerald-500 mt-0.5 flex-shrink-0 text-xs">●</span>
                <span>{renderInline(item.text, `ul-${li}`)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered list — collect consecutive numbered items
      if (/^\d+[.)]\s/.test(trimmed)) {
        const items: { num: string; text: string }[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i].trim())) {
          const match = lines[i].trim().match(/^(\d+)[.)]\s+(.*)/);
          if (match) items.push({ num: match[1], text: match[2] });
          i++;
        }
        elements.push(
          <ol key={elements.length} className="my-1.5 space-y-1.5">
            {items.map((item, li) => (
              <li key={li} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-gray-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {item.num}
                </span>
                <span className="flex-1">{renderInline(item.text, `ol-${li}`)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Empty line
      if (!trimmed) {
        elements.push(<div key={elements.length} className="h-1.5" />);
        i++;
        continue;
      }

      // Regular paragraph with inline formatting
      elements.push(
        <p key={elements.length} className="text-slate-600 dark:text-gray-300 text-sm my-0.5 leading-relaxed">
          {renderInline(trimmed, `p-${i}`)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <div className={embedded ? '' : 'p-6'}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">AI Financial Advisor</h1>
          <p className="text-slate-500 dark:text-gray-400">AI-powered financial analysis and recommendations</p>
        </div>
      )}

      {/* Quick Insights Dashboard */}
      <div className="mb-6">
        <button
          onClick={() => setShowInsights(!showInsights)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          <Sparkles size={18} className="text-amber-500" />
          Financial Health Dashboard
          {showInsights ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showInsights && (
          <div className="space-y-4">
            {insightsLoading ? (
              <div className="flex items-center justify-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <Loader2 className="animate-spin text-emerald-500 mr-3" size={24} />
                <span className="text-slate-500 dark:text-gray-400">Analyzing your finances with AI...</span>
              </div>
            ) : insightsError ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <div className="text-center">
                  <AlertTriangle size={32} className="text-amber-500 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-gray-400 mb-1">{insightsError}</p>
                  <p className="text-sm text-slate-500 dark:text-gray-500 mb-4">
                    You can still use the chat below to ask questions about your finances.
                  </p>
                  <button
                    onClick={loadQuickInsights}
                    className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1 mx-auto"
                  >
                    <RefreshCw size={14} /> Try Again
                  </button>
                </div>
              </div>
            ) : insights ? (
              <>
                {/* Health Score + Key Metrics Row */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Health Score Card */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col items-center justify-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold ${getHealthColor(insights.healthScore)}`}>
                      {insights.healthScore}
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-gray-300 mt-2">{insights.healthLabel}</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500">Financial Health</p>
                  </div>

                  {/* Key Metrics */}
                  {insights.keyMetrics.slice(0, 4).map((metric, i) => (
                    <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500 dark:text-gray-400">{metric.label}</span>
                        {getTrendIcon(metric.trend, metric.isGood)}
                      </div>
                      <p className="text-lg font-bold text-slate-800 dark:text-white">{metric.value}</p>
                    </div>
                  ))}
                </div>

                {/* Alerts + Recommendations */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Critical Alerts */}
                  {insights.criticalAlerts.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                      <h4 className="font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-500" />
                        Alerts & Warnings
                      </h4>
                      <div className="space-y-2">
                        {insights.criticalAlerts.map((alert, i) => (
                          <div key={i} className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}>
                            <div className="flex items-start gap-2">
                              {getSeverityIcon(alert.severity)}
                              <div>
                                <p className="text-sm font-medium text-slate-800 dark:text-white">{alert.title}</p>
                                <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">{alert.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {insights.recommendations.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                      <h4 className="font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                        <Lightbulb size={16} className="text-emerald-500" />
                        AI Recommendations
                      </h4>
                      <div className="space-y-2">
                        {insights.recommendations.map((rec, i) => (
                          <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                            <p className="text-sm font-medium text-slate-800 dark:text-white">{rec.title}</p>
                            <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">{rec.description}</p>
                            <span className="inline-block mt-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                              Impact: {rec.impact}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-600 dark:text-green-400">Revenue (Month)</p>
                    <p className="text-sm font-bold text-green-700 dark:text-green-300">ZMW {insights.snapshot.revenueThisMonth.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-red-600 dark:text-red-400">Expenses (Month)</p>
                    <p className="text-sm font-bold text-red-700 dark:text-red-300">ZMW {insights.snapshot.expensesThisMonth.toLocaleString()}</p>
                  </div>
                  <div className={`rounded-lg p-3 text-center ${insights.snapshot.netIncome >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <p className="text-xs text-slate-600 dark:text-gray-400">Net Income</p>
                    <p className={`text-sm font-bold ${insights.snapshot.netIncome >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
                      ZMW {insights.snapshot.netIncome.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-purple-600 dark:text-purple-400">Collection Rate</p>
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{insights.snapshot.collectionRate}%</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400">Outstanding</p>
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-300">ZMW {insights.snapshot.outstandingFees.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={loadQuickInsights}
                    className="text-sm text-slate-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw size={12} /> Refresh Insights
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Chat Interface */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Chat Header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 cursor-pointer"
          onClick={() => setShowChat(!showChat)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <Coins size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Finance AI Advisor</h3>
              <p className="text-emerald-100 text-xs">
                {activeConversationId
                  ? conversations.find(c => c.id === activeConversationId)?.title || 'Active conversation'
                  : 'AI-powered analysis of your school\'s finances'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); setShowChat(true); }}
              className="bg-white/20 hover:bg-white/30 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              title="Conversation History"
            >
              <History size={13} /> History
              {conversations.length > 0 && (
                <span className="bg-white/30 text-[10px] px-1.5 rounded-full">{conversations.length}</span>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); startNewChat(); }}
              className="bg-white/20 hover:bg-white/30 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              title="New Chat"
            >
              <Plus size={13} /> New
            </button>
            {messages.length > 0 && (
              <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                {messages.length} msgs
              </span>
            )}
            {showChat ? <ChevronDown size={18} className="text-white" /> : <ChevronUp size={18} className="text-white" />}
          </div>
        </div>

        {showChat && (
          <div className="flex" style={{ height: showHistory || messages.length > 0 ? '500px' : 'auto' }}>
            {/* Conversation History Sidebar */}
            {showHistory && (
              <div className="w-64 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wide">Chat History</h4>
                    <button
                      onClick={() => setShowHistory(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <button
                    onClick={startNewChat}
                    className="w-full text-sm px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> New Chat
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {conversationsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={16} className="animate-spin text-emerald-500" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <MessageSquare size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-400 dark:text-gray-500">No saved conversations yet</p>
                      <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">Start a chat and it will appear here</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {conversations.map(conv => (
                        <div
                          key={conv.id}
                          className={`group px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
                            activeConversationId === conv.id
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500'
                              : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {renamingId === conv.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameConversation(conv.id)}
                                className="flex-1 text-xs px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-gray-200 focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRenameConversation(conv.id)}
                                className="text-green-500 hover:text-green-600"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                onClick={() => { setRenamingId(null); setRenameValue(''); }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div onClick={() => loadConversation(conv.id)}>
                              <p className="text-sm text-slate-700 dark:text-gray-200 font-medium truncate">
                                {conv.title}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-400 dark:text-gray-500 flex items-center gap-0.5">
                                  <Clock size={9} /> {new Date(conv.updatedAt).toLocaleDateString()}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-gray-500">
                                  {conv._count.messages} msgs
                                </span>
                              </div>
                            </div>
                          )}

                          {renamingId !== conv.id && (
                            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); setRenamingId(conv.id); setRenameValue(conv.title); }}
                                className="text-[10px] text-slate-400 hover:text-emerald-500 flex items-center gap-0.5"
                              >
                                <Edit3 size={10} /> Rename
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                                className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                              >
                                <Trash2 size={10} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Main Chat Area */}
            <div className="flex flex-col flex-1 min-w-0">
            {/* Messages */}
            {messages.length > 0 ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-2xl rounded-br-md px-4 py-2'
                      : 'bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-md px-4 py-3'}`}>
                      {msg.role === 'user' ? (
                        <p className="text-sm">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {formatResponse(msg.content)}
                        </div>
                      )}
                      {/* AI Action Button */}
                      {msg.action && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                          <ActionButton action={msg.action} />
                        </div>
                      )}
                      <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-emerald-200' : 'text-slate-400 dark:text-gray-500'}`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-emerald-500" />
                        <span className="text-sm text-slate-500 dark:text-gray-400">Analyzing financial data...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            ) : (
              /* Suggested Questions (when no messages) */
              <div className="p-4">
                <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">Try asking:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        sendMessage(q);
                      }}
                      className="text-left px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-gray-300 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-900/20 dark:hover:border-emerald-600 transition-colors"
                    >
                      <MessageSquare size={12} className="inline mr-2 text-emerald-500" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="border-t border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about revenue, expenses, cash flow, budgets, compliance..."
                  className="flex-1 resize-none px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                  rows={1}
                  style={{ maxHeight: '100px' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 100) + 'px';
                  }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setActiveConversationId(null); }}
                  className="text-xs text-slate-400 hover:text-red-500 mt-2 flex items-center gap-1 transition-colors"
                >
                  <X size={10} /> Clear chat
                </button>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Action Button for AI-suggested debt collection actions
const ActionButton: React.FC<{ action: { type: string; params: Record<string, any> } }> = ({ action }) => {
  const [executing, setExecuting] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const actionConfig: Record<string, { label: string; icon: React.ElementType; color: string; endpoint: string; method: string }> = {
    SEND_REMINDERS: {
      label: 'Send Reminders',
      icon: Send,
      color: 'blue',
      endpoint: '/debt-collection/send',
      method: 'POST',
    },
    CREATE_CAMPAIGN: {
      label: 'Create Campaign',
      icon: Target,
      color: 'purple',
      endpoint: '/debt-collection/campaigns',
      method: 'POST',
    },
    VIEW_DEBTORS: {
      label: 'View Debtors',
      icon: Users,
      color: 'orange',
      endpoint: '/debt-collection/debtors',
      method: 'GET',
    },
  };

  const config = actionConfig[action.type];
  if (!config) return null;

  const handleExecute = async () => {
    // For VIEW_DEBTORS, navigate to the debt collection tab
    if (action.type === 'VIEW_DEBTORS') {
      setResult('Switch to the Debt Collection tab to view all debtors');
      return;
    }

    setExecuting(true);
    try {
      const res = config.method === 'POST'
        ? await api.post(config.endpoint, action.params)
        : await api.get(config.endpoint, { params: action.params });

      if (action.type === 'SEND_REMINDERS') {
        setResult(`✅ Sent ${res.data.result?.totalSent || 0} reminders successfully!`);
      } else if (action.type === 'CREATE_CAMPAIGN') {
        setResult(`✅ Campaign "${res.data.campaign?.name || ''}" created!`);
      } else {
        setResult('✅ Action completed successfully!');
      }
    } catch (err: any) {
      setResult(`❌ ${err.response?.data?.error || 'Action failed'}`);
    } finally {
      setExecuting(false);
    }
  };

  const Icon = config.icon;

  return (
    <div className="space-y-2">
      {!result ? (
        <button
          onClick={handleExecute}
          disabled={executing}
          className={`inline-flex items-center gap-2 px-3 py-2 bg-${config.color}-50 dark:bg-${config.color}-900/20 border border-${config.color}-200 dark:border-${config.color}-700 rounded-lg text-sm font-medium text-${config.color}-700 dark:text-${config.color}-300 hover:bg-${config.color}-100 dark:hover:bg-${config.color}-900/30 transition-colors disabled:opacity-50`}
        >
          {executing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Icon size={14} />
          )}
          {executing ? 'Executing...' : config.label}
          {action.params && Object.keys(action.params).length > 0 && (
            <span className="text-xs opacity-70">
              ({Object.entries(action.params).map(([k, v]) => `${k}: ${v}`).join(', ')})
            </span>
          )}
        </button>
      ) : (
        <p className="text-xs text-slate-600 dark:text-gray-400 flex items-center gap-1">
          <Zap size={12} className="text-yellow-500" />
          {result}
        </p>
      )}
    </div>
  );
};

export default AIFinancialAdvisor;
