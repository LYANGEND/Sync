import React, { useState, useRef, useEffect } from 'react';
import {
  Coins, Send, Loader2, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Sparkles, RefreshCw, ChevronDown, ChevronUp,
  Shield, Lightbulb, X, MessageSquare, History, Trash2,
  Plus, Clock, Edit3, Check, Target, Users, Zap,
  ShieldCheck, Wallet, FileDown, BarChart3, Save, BookOpen,
  Download,
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

type PowerTab = 'forecast' | 'compliance' | 'allocator' | 'budget' | 'audit' | 'reports';

interface CashFlowForecast {
  forecast30: { expectedInflow: number; expectedOutflow: number; netCashFlow: number };
  forecast60: { expectedInflow: number; expectedOutflow: number; netCashFlow: number };
  forecast90: { expectedInflow: number; expectedOutflow: number; netCashFlow: number };
  keyAssumptions: string[];
  riskFactors: string[];
  recommendations: string[];
  narrative: string;
}

interface ComplianceItem {
  status: 'compliant' | 'warning' | 'overdue' | 'unknown';
  description: string;
  lastAmount?: number;
  nextDeadline: string;
}

interface ComplianceStatus {
  paye: ComplianceItem;
  napsa: ComplianceItem;
  nhima: ComplianceItem;
  zra: ComplianceItem;
  overallScore: number;
  overallLabel: string;
  alerts: string[];
  recommendations: string[];
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

  // Finance Intelligence Suite state
  const [showPowerFeatures, setShowPowerFeatures] = useState(false);
  const [activePowerTab, setActivePowerTab] = useState<PowerTab>('forecast');
  const [cashFlowForecast, setCashFlowForecast] = useState<CashFlowForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocationResult, setAllocationResult] = useState<{ allocated: number; totalAmount: number; message: string; results: any[] } | null>(null);
  const [rawSnapshot, setRawSnapshot] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  // Saved reports state
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [savingReport, setSavingReport] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedReportType, setSelectedReportType] = useState('CUSTOM');
  const [academicTerms, setAcademicTerms] = useState<{ id: string; name: string }[]>([]);

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
    'Export our current financial report to CSV',
    'Auto-allocate all unallocated payments to student fee balances',
    'Give me a PAYE, NAPSA and NHIMA compliance summary',
    'What is our 90-day cash flow risk?',
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

  const loadCashFlowForecast = async () => {
    setForecastLoading(true);
    try {
      const res = await api.get('/financial/ai-advisor/cash-flow-forecast');
      setCashFlowForecast(res.data);
    } catch (e: any) {
      const msg = e.response?.data?.error || 'Failed to generate forecast';
      const retry = e.response?.data?.retryAfter;
      toast.error(retry ? `${msg} Try again in ${retry}s.` : msg);
    } finally {
      setForecastLoading(false);
    }
  };

  const loadComplianceStatus = async () => {
    setComplianceLoading(true);
    try {
      const res = await api.get('/financial/ai-advisor/compliance');
      setComplianceStatus(res.data);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to check compliance');
    } finally {
      setComplianceLoading(false);
    }
  };

  const runPaymentAllocation = async () => {
    setAllocating(true);
    try {
      const res = await api.post('/financial/ai-advisor/allocate-payments');
      setAllocationResult(res.data);
      if (res.data.allocated > 0) toast.success(res.data.message);
      else toast.success('All payments already fully allocated');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to allocate payments');
    } finally {
      setAllocating(false);
    }
  };

  const loadRawSnapshot = async () => {
    if (snapshotLoading) return;
    setSnapshotLoading(true);
    try {
      const res = await api.get('/financial/ai-advisor/snapshot');
      setRawSnapshot(res.data);
    } catch {
      toast.error('Failed to load financial data');
    } finally {
      setSnapshotLoading(false);
    }
  };

  // ── Load academic terms for report tagging ──
  const loadAcademicTerms = async () => {
    try {
      const res = await api.get('/academic-terms');
      setAcademicTerms((res.data || []).map((t: any) => ({ id: t.id, name: t.name || t.termName || t.id })));
    } catch {
      // silently ignore — terms are optional
    }
  };

  // ── Load saved reports ──
  const loadSavedReports = async () => {
    setReportsLoading(true);
    try {
      const res = await api.get('/financial/ai-advisor/reports');
      setSavedReports(res.data || []);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to load saved reports');
    } finally {
      setReportsLoading(false);
    }
  };

  // ── Save report to system ──
  const saveReportToSystem = async () => {
    if (!reportTitle.trim()) { toast.error('Please enter a report title'); return; }
    setSavingReport(true);
    try {
      await api.post('/financial/ai-advisor/reports', {
        title: reportTitle.trim(),
        reportType: selectedReportType,
        termId: selectedTermId || undefined,
        summary: insights
          ? `Health Score: ${insights.healthScore}/100 (${insights.healthLabel}). Revenue: ZMW ${insights.snapshot.revenueThisMonth.toLocaleString()}. Outstanding: ZMW ${insights.snapshot.outstandingFees.toLocaleString()}.`
          : undefined,
      });
      toast.success('Report saved to system!');
      setReportTitle('');
      setSelectedTermId('');
      loadSavedReports();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save report');
    } finally {
      setSavingReport(false);
    }
  };

  // ── Export as CSV ──
  const exportCSV = () => {
    if (!insights) { toast.error('Load Financial Health Dashboard first'); return; }
    const rows: (string | number)[][] = [
      ['Sync School — Financial Report', new Date().toLocaleDateString('en-GB')],
      [],
      ['FINANCIAL HEALTH SCORE', insights.healthScore, insights.healthLabel],
      [],
      ['KEY METRICS', '', ''],
      ['Metric', 'Value', 'Trend'],
      ...insights.keyMetrics.map(m => [m.label, m.value, m.trend]),
      [],
      ['SNAPSHOT', '', ''],
      ['Revenue (Month)', `ZMW ${insights.snapshot.revenueThisMonth.toLocaleString()}`, ''],
      ['Expenses (Month)', `ZMW ${insights.snapshot.expensesThisMonth.toLocaleString()}`, ''],
      ['Net Income', `ZMW ${insights.snapshot.netIncome.toLocaleString()}`, ''],
      ['Collection Rate', `${insights.snapshot.collectionRate}%`, ''],
      ['Outstanding Fees', `ZMW ${insights.snapshot.outstandingFees.toLocaleString()}`, ''],
      [],
      ['CRITICAL ALERTS', '', ''],
      ['Title', 'Description', 'Severity'],
      ...insights.criticalAlerts.map(a => [a.title, a.description, a.severity]),
      [],
      ['RECOMMENDATIONS', '', ''],
      ['Title', 'Description', 'Impact'],
      ...insights.recommendations.map(r => [r.title, r.description, r.impact]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-finance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Exported as CSV');
  };

  // ── Export as Excel (.xlsx) ──
  const exportExcel = () => {
    if (!insights) { toast.error('Load Financial Health Dashboard first'); return; }
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary
    const summaryData = [
      ['Sync School — Financial Health Report', ''],
      ['Generated', new Date().toLocaleDateString('en-GB')],
      ['', ''],
      ['HEALTH SCORE', `${insights.healthScore}/100`],
      ['HEALTH LABEL', insights.healthLabel],
      ['', ''],
      ['SNAPSHOT', ''],
      ['Revenue (Month)', insights.snapshot.revenueThisMonth],
      ['Expenses (Month)', insights.snapshot.expensesThisMonth],
      ['Net Income', insights.snapshot.netIncome],
      ['Collection Rate', `${insights.snapshot.collectionRate}%`],
      ['Outstanding Fees', insights.snapshot.outstandingFees],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    // Sheet 2 — Key Metrics
    const metricsData = [
      ['Metric', 'Value', 'Trend', 'Good?'],
      ...insights.keyMetrics.map(m => [m.label, m.value, m.trend, m.isGood ? 'Yes' : 'No']),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metricsData), 'Key Metrics');

    // Sheet 3 — Alerts
    const alertsData = [
      ['Alert Title', 'Description', 'Severity'],
      ...insights.criticalAlerts.map(a => [a.title, a.description, a.severity]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alertsData), 'Alerts');

    // Sheet 4 — Recommendations
    const recData = [
      ['Recommendation', 'Description', 'Impact'],
      ...insights.recommendations.map(r => [r.title, r.description, r.impact]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recData), 'Recommendations');

    XLSX.writeFile(wb, `sync-finance-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Exported as Excel (.xlsx)');
  };

  // ── Export as PDF ──
  const exportPDF = () => {
    if (!insights) { toast.error('Load Financial Health Dashboard first'); return; }
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Header
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Sync School — Financial Report', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${dateStr}`, 14, 21);
    doc.setTextColor(0, 0, 0);

    // Health Score box
    const scoreColor: [number, number, number] = insights.healthScore >= 70 ? [16, 185, 129] : insights.healthScore >= 45 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(...scoreColor);
    doc.roundedRect(14, 34, 55, 22, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(`${insights.healthScore}`, 25, 46);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('/100', 36, 46);
    doc.setFontSize(8);
    doc.text(insights.healthLabel, 16, 52);
    doc.setTextColor(0, 0, 0);

    // Snapshot grid
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('FINANCIAL SNAPSHOT', 80, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const snapshotItems = [
      ['Revenue (Month)', `ZMW ${insights.snapshot.revenueThisMonth.toLocaleString()}`],
      ['Expenses (Month)', `ZMW ${insights.snapshot.expensesThisMonth.toLocaleString()}`],
      ['Net Income', `ZMW ${insights.snapshot.netIncome.toLocaleString()}`],
      ['Collection Rate', `${insights.snapshot.collectionRate}%`],
      ['Outstanding Fees', `ZMW ${insights.snapshot.outstandingFees.toLocaleString()}`],
    ];
    snapshotItems.forEach(([label, value], i) => {
      doc.setTextColor(100, 100, 100);
      doc.text(label, 80, 44 + i * 6);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(value, 140, 44 + i * 6);
      doc.setFont('helvetica', 'normal');
    });
    doc.setTextColor(0, 0, 0);

    let y = 65;

    // Key Metrics table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Metrics', 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value', 'Trend']],
      body: insights.keyMetrics.map(m => [m.label, m.value, m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→']),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 252, 249] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Alerts table
    if (insights.criticalAlerts.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Critical Alerts', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['Alert', 'Description', 'Severity']],
        body: insights.criticalAlerts.map(a => [a.title, a.description, a.severity.toUpperCase()]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [254, 249, 249] },
        margin: { left: 14, right: 14 },
        columnStyles: { 2: { cellWidth: 22 } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Recommendations table
    if (insights.recommendations.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Recommendations', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['Title', 'Description', 'Impact']],
        body: insights.recommendations.map(r => [r.title, r.description, r.impact]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 249, 255] },
        margin: { left: 14, right: 14 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(`Sync · Run your school. In sync. · Page ${p} of ${pageCount} · ${dateStr}`, 14, 290);
    }

    doc.save(`sync-finance-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('Exported as PDF');
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

      {/* ======== FINANCE INTELLIGENCE SUITE ======== */}
      <div className="mb-6">
        <button
          onClick={() => setShowPowerFeatures(!showPowerFeatures)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-gray-200 mb-3 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
        >
          <Zap size={18} className="text-purple-500" />
          Finance Intelligence Suite
          <span className="text-[10px] px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full font-medium">10 AI Powers</span>
          {showPowerFeatures ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showPowerFeatures && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Quick Action Buttons */}
            <div className="flex flex-wrap gap-2 p-4 bg-gradient-to-r from-slate-50 to-purple-50/30 dark:from-slate-900/50 dark:to-purple-900/10 border-b border-slate-200 dark:border-slate-700">
              {[
                { label: '📊 Cash Flow Forecast', tab: 'forecast' as PowerTab, action: () => { setActivePowerTab('forecast'); if (!cashFlowForecast) loadCashFlowForecast(); } },
                { label: '🔐 Compliance Check', tab: 'compliance' as PowerTab, action: () => { setActivePowerTab('compliance'); if (!complianceStatus) loadComplianceStatus(); } },
                { label: '💳 Allocate Payments', tab: 'allocator' as PowerTab, action: () => setActivePowerTab('allocator') },
                { label: '📈 Budget vs Actual', tab: 'budget' as PowerTab, action: () => { setActivePowerTab('budget'); if (!rawSnapshot) loadRawSnapshot(); } },
                { label: '📋 Audit Trail', tab: 'audit' as PowerTab, action: () => { setActivePowerTab('audit'); if (!rawSnapshot) loadRawSnapshot(); } },
                { label: '� Reports & Export', tab: 'reports' as PowerTab, action: () => { setActivePowerTab('reports'); loadSavedReports(); loadAcademicTerms(); } },
              ].map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.action}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all border ${
                    btn.tab && activePowerTab === btn.tab
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-gray-300 border-slate-200 dark:border-slate-600 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-5">

              {/* ──── CASH FLOW FORECAST ──── */}
              {activePowerTab === 'forecast' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                      <TrendingUp size={16} className="text-blue-500" /> 30 / 60 / 90-Day Cash Flow Forecast
                    </h4>
                    <button onClick={loadCashFlowForecast} disabled={forecastLoading} className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors">
                      <RefreshCw size={11} className={forecastLoading ? 'animate-spin' : ''} /> Regenerate
                    </button>
                  </div>
                  {forecastLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-blue-500 mr-2" size={20} />
                      <span className="text-sm text-slate-500 dark:text-gray-400">AI is forecasting cash flows…</span>
                    </div>
                  ) : !cashFlowForecast ? (
                    <div className="text-center py-8">
                      <TrendingUp size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">Generate an AI-powered 30/60/90-day cash flow projection based on historical data</p>
                      <button onClick={loadCashFlowForecast} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                        Generate Forecast
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {([
                          { label: '30 Days', data: cashFlowForecast.forecast30 },
                          { label: '60 Days', data: cashFlowForecast.forecast60 },
                          { label: '90 Days', data: cashFlowForecast.forecast90 },
                        ] as const).map(({ label, data }) => (
                          <div key={label} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                            <p className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-3">{label}</p>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-green-600 dark:text-green-400">↑ Inflow</span>
                                <span className="text-xs font-medium text-green-700 dark:text-green-400">ZMW {Number(data.expectedInflow).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-[10px] text-red-500">↓ Outflow</span>
                                <span className="text-xs font-medium text-red-600 dark:text-red-400">ZMW {Number(data.expectedOutflow).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-600">
                                <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">Net</span>
                                <span className={`text-sm font-bold ${Number(data.netCashFlow) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                                  ZMW {Number(data.netCashFlow).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {cashFlowForecast.narrative && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{cashFlowForecast.narrative}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {cashFlowForecast.riskFactors?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5"><AlertTriangle size={12} /> Risk Factors</p>
                            <ul className="space-y-1">
                              {cashFlowForecast.riskFactors.map((r, i) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-gray-400 flex items-start gap-1.5">
                                  <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>{r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {cashFlowForecast.recommendations?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5"><Lightbulb size={12} /> Recommendations</p>
                            <ul className="space-y-1">
                              {cashFlowForecast.recommendations.map((r, i) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-gray-400 flex items-start gap-1.5">
                                  <span className="text-emerald-400 mt-0.5 flex-shrink-0">•</span>{r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──── COMPLIANCE TRACKER ──── */}
              {activePowerTab === 'compliance' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-green-500" /> Zambian Statutory Compliance Tracker
                    </h4>
                    <button onClick={loadComplianceStatus} disabled={complianceLoading} className="text-xs text-slate-400 hover:text-green-500 flex items-center gap-1 transition-colors">
                      <RefreshCw size={11} className={complianceLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                  </div>
                  {complianceLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-green-500 mr-2" size={20} />
                      <span className="text-sm text-slate-500 dark:text-gray-400">Checking compliance status…</span>
                    </div>
                  ) : !complianceStatus ? (
                    <div className="text-center py-8">
                      <ShieldCheck size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">Check PAYE, NAPSA, NHIMA and ZRA compliance in one click</p>
                      <button onClick={loadComplianceStatus} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors">
                        Run Compliance Check
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0 ${
                          complianceStatus.overallScore >= 85 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          complianceStatus.overallScore >= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {complianceStatus.overallScore}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{complianceStatus.overallLabel}</p>
                          <p className="text-xs text-slate-500 dark:text-gray-400">Overall Compliance Score</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { key: 'paye', label: 'PAYE', subtitle: 'Income Tax', data: complianceStatus.paye },
                          { key: 'napsa', label: 'NAPSA', subtitle: 'Pension (5%+5%)', data: complianceStatus.napsa },
                          { key: 'nhima', label: 'NHIMA', subtitle: 'Health (1%+1%)', data: complianceStatus.nhima },
                          { key: 'zra', label: 'ZRA', subtitle: 'Tax Authority', data: complianceStatus.zra },
                        ] as const).map(({ key, label, subtitle, data }) => (
                          <div key={key} className={`p-3 rounded-xl border ${
                            data.status === 'compliant' ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' :
                            data.status === 'warning'   ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20' :
                            data.status === 'overdue'   ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
                            'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-bold text-slate-800 dark:text-white">{label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                data.status === 'compliant' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                                data.status === 'warning'   ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                                data.status === 'overdue'   ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                                'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-gray-300'
                              }`}>
                                {data.status === 'compliant' ? '✓ OK' : data.status === 'warning' ? '⚠ Review' : data.status === 'overdue' ? '✗ Overdue' : '? Unknown'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-gray-400">{subtitle}</p>
                            <p className="text-[10px] text-slate-600 dark:text-gray-300 mt-1 leading-tight">{data.description}</p>
                            <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">Next deadline: <span className="font-medium">{data.nextDeadline}</span></p>
                          </div>
                        ))}
                      </div>
                      {complianceStatus.alerts?.length > 0 && (
                        <div className="space-y-2">
                          {complianceStatus.alerts.map((alert, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-amber-700 dark:text-amber-300">{alert}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 dark:text-gray-300 mb-2 flex items-center gap-1.5"><Lightbulb size={12} className="text-emerald-500" /> Recommendations</p>
                        <ul className="space-y-1.5">
                          {complianceStatus.recommendations.map((r, i) => (
                            <li key={i} className="text-xs text-slate-500 dark:text-gray-400 flex items-start gap-1.5">
                              <span className="text-emerald-400 mt-0.5 flex-shrink-0">→</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──── PAYMENT ALLOCATOR ──── */}
              {activePowerTab === 'allocator' && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2 mb-4">
                    <Wallet size={16} className="text-purple-500" /> Payment Allocation Engine
                  </h4>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800 mb-4">
                    <p className="text-sm text-purple-800 dark:text-purple-200 font-medium mb-1">What this does</p>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      Matches unallocated payments to outstanding student fee balances, starting with the oldest due date.
                      Fixes incorrect balances, eliminates parent disputes and strengthens your audit trail.
                    </p>
                  </div>
                  {!allocationResult ? (
                    <button
                      onClick={runPaymentAllocation}
                      disabled={allocating}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-60 transition-colors font-medium text-sm"
                    >
                      {allocating ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
                      {allocating ? 'Allocating payments…' : '▶ Run Auto-Allocation Now'}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className={`p-4 rounded-xl border ${allocationResult.allocated > 0 ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'}`}>
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">{allocationResult.message}</p>
                        {allocationResult.allocated > 0 && (
                          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                            Processed {allocationResult.allocated} payment(s) — ZMW {Number(allocationResult.totalAmount).toLocaleString()} allocated
                          </p>
                        )}
                      </div>
                      {allocationResult.results?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 dark:text-gray-300 mb-2">Allocation Details</p>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {allocationResult.results.map((r: any, i: number) => (
                              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs">
                                <span className="text-slate-700 dark:text-gray-300">{r.student}</span>
                                <span className="text-slate-500 dark:text-gray-400">{r.allocations} fee(s)</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">ZMW {Number(r.amount).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => setAllocationResult(null)}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw size={10} /> Run again
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ──── BUDGET VS ACTUAL ──── */}
              {activePowerTab === 'budget' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                      <BarChart3 size={16} className="text-amber-500" /> Budget vs Actual (Real-Time)
                    </h4>
                    <button onClick={loadRawSnapshot} disabled={snapshotLoading} className="text-xs text-slate-400 hover:text-amber-500 flex items-center gap-1 transition-colors">
                      <RefreshCw size={11} className={snapshotLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                  </div>
                  {snapshotLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-amber-500 mr-2" size={20} />
                      <span className="text-sm text-slate-500 dark:text-gray-400">Loading budget data…</span>
                    </div>
                  ) : !rawSnapshot?.budgets?.length ? (
                    <div className="text-center py-8">
                      <BarChart3 size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-gray-400 mb-1">No budgets found</p>
                      <p className="text-xs text-slate-400 dark:text-gray-500">Ask the AI: "Create a Term 1 2026 budget with SALARIES 50000 and UTILITIES 8000"</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {rawSnapshot.budgets.map((budget: any, bi: number) => (
                        <div key={bi} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50">
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">{budget.name}</p>
                              <p className="text-[10px] text-slate-400 dark:text-gray-500">{budget.period} · {budget.year} · {budget.status}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-800 dark:text-white">{budget.utilizationPercent}</p>
                              <p className="text-[10px] text-slate-400 dark:text-gray-500">utilized</p>
                            </div>
                          </div>
                          <div className="p-3 space-y-2.5">
                            {budget.items.map((item: any, ii: number) => {
                              const pct = item.allocated > 0 ? Math.round((item.spent / item.allocated) * 100) : 0;
                              return (
                                <div key={ii}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-slate-600 dark:text-gray-300">{item.category}</span>
                                    <span className={`text-[10px] font-medium ${pct > 100 ? 'text-red-600' : pct > 80 ? 'text-amber-600' : 'text-slate-500 dark:text-gray-400'}`}>
                                      {Number(item.spent).toLocaleString()} / {Number(item.allocated).toLocaleString()} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ──── AUDIT TRAIL ──── */}
              {activePowerTab === 'audit' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                      <Clock size={16} className="text-slate-500" /> Financial Audit Trail
                    </h4>
                    <button onClick={loadRawSnapshot} disabled={snapshotLoading} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors">
                      <RefreshCw size={11} className={snapshotLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                  </div>
                  {snapshotLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-slate-400 mr-2" size={20} />
                      <span className="text-sm text-slate-500 dark:text-gray-400">Loading audit log…</span>
                    </div>
                  ) : !rawSnapshot?.recentFinancialActivity?.length ? (
                    <div className="text-center py-8">
                      <Clock size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-gray-400">No audit log entries found</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {rawSnapshot.recentFinancialActivity.map((log: any, i: number) => (
                        <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Shield size={11} className="text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 dark:text-gray-200 truncate">{log.description || log.action}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 dark:text-gray-500">{log.entity}</span>
                              {log.amount && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">ZMW {Number(log.amount).toLocaleString()}</span>}
                              <span className="text-[10px] text-slate-300 dark:text-gray-600">{new Date(log.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as any)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ──── REPORTS & EXPORT ──── */}
              {activePowerTab === 'reports' && (
                <div className="space-y-6">
                  {/* Export section */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2 mb-4">
                      <Download size={16} className="text-emerald-500" /> Export Financial Report
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-gray-500 mb-3">
                      {insights ? 'Financial Health Dashboard is loaded. Choose your export format:' : 'Load the Financial Health Dashboard (top of page) first to enable exports.'}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={exportPDF}
                        disabled={!insights}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                          <FileDown size={20} className="text-white" />
                        </div>
                        <span className="text-xs font-semibold text-red-700 dark:text-red-400">Export PDF</span>
                        <span className="text-[10px] text-slate-400 dark:text-gray-500 text-center">Full formatted report with tables &amp; charts</span>
                      </button>
                      <button
                        onClick={exportExcel}
                        disabled={!insights}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                          <BarChart3 size={20} className="text-white" />
                        </div>
                        <span className="text-xs font-semibold text-green-700 dark:text-green-400">Export Excel</span>
                        <span className="text-[10px] text-slate-400 dark:text-gray-500 text-center">Multi-sheet .xlsx with metrics &amp; alerts</span>
                      </button>
                      <button
                        onClick={exportCSV}
                        disabled={!insights}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="w-10 h-10 bg-slate-500 rounded-lg flex items-center justify-center">
                          <FileDown size={20} className="text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-600 dark:text-gray-300">Export CSV</span>
                        <span className="text-[10px] text-slate-400 dark:text-gray-500 text-center">Raw data for spreadsheets &amp; auditors</span>
                      </button>
                    </div>
                  </div>

                  {/* Save to System section */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2 mb-4">
                      <Save size={16} className="text-purple-500" /> Save Report to System
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Report Title *</label>
                        <input
                          type="text"
                          value={reportTitle}
                          onChange={e => setReportTitle(e.target.value)}
                          placeholder="e.g. Term 1 2026 Financial Health Report"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Report Type</label>
                          <select
                            value={selectedReportType}
                            onChange={e => setSelectedReportType(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                          >
                            {[
                              ['CUSTOM', 'Custom Report'],
                              ['INCOME_STATEMENT', 'Income Statement'],
                              ['FEE_STATEMENT', 'Fee Statement'],
                              ['CASH_FLOW', 'Cash Flow'],
                              ['AGED_RECEIVABLES', 'Aged Receivables'],
                              ['COMPLIANCE', 'Compliance Report'],
                              ['AUDIT_REPORT', 'Audit Report'],
                            ].map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1">Link to Term (optional)</label>
                          <select
                            value={selectedTermId}
                            onChange={e => setSelectedTermId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                          >
                            <option value="">— No term —</option>
                            {academicTerms.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={saveReportToSystem}
                        disabled={savingReport || !reportTitle.trim()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 dark:disabled:bg-purple-900 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {savingReport ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        {savingReport ? 'Saving…' : 'Save Report to System'}
                      </button>
                    </div>
                  </div>

                  {/* Saved reports list */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                        <BookOpen size={16} className="text-blue-500" /> Saved Reports
                      </h4>
                      <button onClick={loadSavedReports} disabled={reportsLoading} className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors">
                        <RefreshCw size={11} className={reportsLoading ? 'animate-spin' : ''} /> Refresh
                      </button>
                    </div>
                    {reportsLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="animate-spin text-blue-500 mr-2" size={18} />
                        <span className="text-sm text-slate-500 dark:text-gray-400">Loading saved reports…</span>
                      </div>
                    ) : savedReports.length === 0 ? (
                      <div className="text-center py-6">
                        <BookOpen size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm text-slate-500 dark:text-gray-400">No saved reports yet</p>
                        <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Save a report above to archive it in the system</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {savedReports.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{r.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full font-medium">{r.reportType?.replace(/_/g, ' ')}</span>
                                {r.term?.name && <span className="text-[10px] text-slate-400 dark:text-gray-500">📅 {r.term.name}</span>}
                                <span className="text-[10px] text-slate-400 dark:text-gray-500">{new Date(r.reportDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                              </div>
                              {r.summary && <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1 line-clamp-1">{r.summary}</p>}
                            </div>
                            <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                              <span className="text-[10px] text-slate-400 dark:text-gray-500">{r.user?.fullName || 'System'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
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

// Action Button for AI-suggested actions (creates, sends, debt collection)
const ActionButton: React.FC<{ action: { type: string; params: Record<string, any> } }> = ({ action }) => {
  const [executing, setExecuting] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);

  // Actions that go through the unified execute-action endpoint
  const createActions: Record<string, { label: string; icon: React.ElementType; color: string; confirmMsg: string }> = {
    CREATE_VENDOR:      { label: 'Create Vendor',     icon: Plus,    color: 'emerald',  confirmMsg: `Create vendor "${action.params?.name || ''}"?` },
    CREATE_EXPENSE:     { label: 'Create Expense',    icon: Minus,   color: 'red',      confirmMsg: `Record expense: ZMW ${Number(action.params?.amount || 0).toLocaleString()} — ${action.params?.description || ''}?` },
    CREATE_INVOICE:     { label: 'Create Invoice',    icon: Coins,   color: 'blue',     confirmMsg: `Create invoice for ${action.params?.studentName || ''}?` },
    RECORD_PAYMENT:     { label: 'Record Payment',    icon: Check,   color: 'green',    confirmMsg: `Record ZMW ${Number(action.params?.amount || 0).toLocaleString()} payment from ${action.params?.studentName || ''}?` },
    CREATE_BUDGET:      { label: 'Create Budget',     icon: Target,  color: 'purple',   confirmMsg: `Create budget "${action.params?.name || ''}"?` },
    CREATE_PETTY_CASH_TRANSACTION: { label: 'Record Petty Cash', icon: Coins, color: 'amber', confirmMsg: `Record petty cash ${action.params?.type?.toLowerCase() || 'transaction'}: ZMW ${Number(action.params?.amount || 0).toLocaleString()}?` },
    CREATE_FEE_TEMPLATE: { label: 'Create Fee Template', icon: Plus, color: 'indigo', confirmMsg: `Create fee "${action.params?.name || ''}" — ZMW ${Number(action.params?.amount || 0).toLocaleString()}?` },
  };

  // Legacy actions that call their own endpoints directly
  const legacyActions: Record<string, { label: string; icon: React.ElementType; color: string; endpoint: string; method: string }> = {
    SEND_REMINDERS: { label: 'Send Reminders', icon: Send, color: 'blue', endpoint: '/debt-collection/send', method: 'POST' },
    CREATE_CAMPAIGN: { label: 'Create Campaign', icon: Target, color: 'purple', endpoint: '/debt-collection/campaigns', method: 'POST' },
    VIEW_DEBTORS: { label: 'View Debtors', icon: Users, color: 'orange', endpoint: '/debt-collection/debtors', method: 'GET' },
    AUTO_ALLOCATE_PAYMENTS: { label: 'Allocate Payments', icon: Wallet, color: 'purple', endpoint: '/financial/ai-advisor/allocate-payments', method: 'POST' },
    EXPORT_REPORT: { label: 'Export Financial Report', icon: FileDown, color: 'emerald', endpoint: '/financial/ai-advisor/snapshot', method: 'GET' },
    SAVE_REPORT: { label: 'Save Report to System', icon: Save, color: 'purple', endpoint: '/financial/ai-advisor/reports', method: 'POST' },
  };

  const isCreateAction = !!createActions[action.type];
  const config = createActions[action.type] || legacyActions[action.type];
  if (!config) return null;

  const handleExecute = async () => {
    if (action.type === 'VIEW_DEBTORS') {
      setResult('📋 Switch to the Debt Collection tab to view all debtors');
      return;
    }

    // Require confirmation for create actions
    if (isCreateAction && !confirmed) {
      setConfirmed(true);
      return;
    }

    setExecuting(true);
    try {
      let res;
      if (isCreateAction) {
        // All create actions go through the unified executor
        res = await api.post('/financial/ai-advisor/execute-action', { type: action.type, params: action.params });
        setResult(res.data.success ? `✅ ${res.data.message}` : `⚠️ ${res.data.message || 'Action completed'}`);
      } else {
        // Legacy debt collection actions
        const legacy = legacyActions[action.type];
        res = legacy.method === 'POST'
          ? await api.post(legacy.endpoint, action.params)
          : await api.get(legacy.endpoint, { params: action.params });

        if (action.type === 'SEND_REMINDERS') {
          const sent = res.data.sent ?? res.data.result?.totalSent ?? 0;
          const failed = res.data.failed ?? 0;
          setResult(sent > 0
            ? `✅ Sent ${sent} reminders!${failed > 0 ? ` (${failed} failed)` : ''}`
            : `⚠️ ${res.data.message || 'No reminders sent — check SMTP settings'}`);
        } else if (action.type === 'CREATE_CAMPAIGN') {
          setResult(`✅ Campaign "${res.data.campaign?.name || ''}" created!`);
        } else if (action.type === 'AUTO_ALLOCATE_PAYMENTS') {
          const allocated = res.data.allocated ?? 0;
          setResult(allocated > 0
            ? `✅ Allocated ZMW ${Number(res.data.totalAmount || 0).toFixed(2)} across ${allocated} payment(s)`
            : `ℹ️ ${res.data.message || 'All payments already allocated'}`);
        } else if (action.type === 'EXPORT_REPORT') {
          const snap = res.data;
          // Build common rows for all formats
          const rows = [
            ['Sync School — Financial Report', new Date().toLocaleDateString('en-GB')],
            [],
            ['Revenue (Month)', snap.revenue?.thisMonth || 0],
            ['Expenses (Month)', snap.expenses?.thisMonth || 0],
            ['Net Income', snap.profitability?.netIncomeThisMonth || 0],
            ['Collection Rate %', snap.feeCollection?.collectionRatePercent || 'N/A'],
            ['Outstanding Fees', snap.feeCollection?.outstanding || 0],
          ];
          const filename = `sync-report-${new Date().toISOString().slice(0, 10)}`;

          // Offer download options
          const doCSV = () => {
            const csv = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${filename}.csv`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
          };
          const doExcel = () => {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Summary');
            XLSX.writeFile(wb, `${filename}.xlsx`);
          };
          const doPDF = () => {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            doc.setFillColor(16, 185, 129);
            doc.rect(0, 0, 210, 22, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text('Sync School — Financial Snapshot', 14, 14);
            doc.setTextColor(0, 0, 0);
            autoTable(doc, {
              startY: 30,
              head: [['Metric', 'Value']],
              body: rows.filter(r => r.length === 2 && r[0]).map(r => [String(r[0]), String(r[1])]),
              styles: { fontSize: 9 },
              headStyles: { fillColor: [16, 185, 129], textColor: 255 },
              margin: { left: 14, right: 14 },
            });
            doc.save(`${filename}.pdf`);
          };
          // Store handlers on window so JSX can use them (same component)
          (window as any).__syncExport = { doCSV, doExcel, doPDF };
          // If AI specified a format, trigger it immediately
          const fmt = (action.params?.format || '').toUpperCase();
          if (fmt === 'PDF') { doPDF(); setResult('✅ PDF report downloaded'); }
          else if (fmt === 'EXCEL' || fmt === 'XLSX') { doExcel(); setResult('✅ Excel report downloaded'); }
          else if (fmt === 'CSV') { doCSV(); setResult('✅ CSV report downloaded'); }
          else setResult('EXPORT_FORMAT_PICKER');
        } else if (action.type === 'SAVE_REPORT') {
          const title = action.params?.title || `Financial Report ${new Date().toLocaleDateString('en-GB')}`;
          const saveRes = await api.post('/financial/ai-advisor/reports', {
            title,
            reportType: action.params?.reportType || 'CUSTOM',
            termId: action.params?.termId || undefined,
            summary: action.params?.summary || undefined,
          });
          setResult(`✅ Report "${saveRes.data.report?.title || title}" saved to system successfully!`);
        } else {
          setResult('✅ Done!');
        }
      }
    } catch (err: any) {
      setResult(`❌ ${err.response?.data?.error || 'Action failed'}`);
      setConfirmed(false);
    } finally {
      setExecuting(false);
    }
  };

  const Icon = config.icon;
  const colorClass = config.color;

  // Summarize params nicely
  const paramSummary = isCreateAction
    ? createActions[action.type].confirmMsg
    : Object.entries(action.params || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ');

  return (
    <div className="space-y-2 mt-2">
      {!result ? (
        <div className="flex flex-col gap-1">
          {confirmed && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ⚠️ {paramSummary} Click again to confirm.
            </p>
          )}
          <button
            onClick={handleExecute}
            disabled={executing}
            className={`inline-flex items-center gap-2 px-3 py-2 bg-${colorClass}-50 dark:bg-${colorClass}-900/20 border border-${colorClass}-200 dark:border-${colorClass}-700 rounded-lg text-sm font-medium text-${colorClass}-700 dark:text-${colorClass}-300 hover:bg-${colorClass}-100 dark:hover:bg-${colorClass}-900/30 transition-colors disabled:opacity-50`}
          >
            {executing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Icon size={14} />
            )}
            {executing ? 'Executing...' : confirmed ? `Confirm ${config.label}` : config.label}
          </button>
        </div>
      ) : result === 'EXPORT_FORMAT_PICKER' ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600 dark:text-gray-300 flex items-center gap-1">
            <FileDown size={12} className="text-emerald-500" /> Choose export format:
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '📄 PDF', fn: () => (window as any).__syncExport?.doPDF(), color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50' },
              { label: '📊 Excel', fn: () => (window as any).__syncExport?.doExcel(), color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' },
              { label: '📋 CSV', fn: () => (window as any).__syncExport?.doCSV(), color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-slate-600' },
            ].map(({ label, fn, color }) => (
              <button key={label} onClick={fn} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${color}`}>{label}</button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-600 dark:text-gray-400 flex items-start gap-1">
          <Zap size={12} className="text-yellow-500 mt-0.5 flex-shrink-0" />
          <span>{result}</span>
        </p>
      )}
    </div>
  );
};

export default AIFinancialAdvisor;
