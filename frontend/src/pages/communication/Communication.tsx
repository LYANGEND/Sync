import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../utils/api';
import { 
  Send, Mail, Bell, Users, CheckCircle, AlertCircle, MessageSquare, 
  Megaphone, Clock, BarChart3, Smartphone, MessageCircle, AlertTriangle,
  Sparkles, Calendar, FileText, Zap, Plus, Trash2, Phone, Wand2, ChevronDown, Wallet
} from 'lucide-react';
import ChatInterface from './ChatInterface';
import SentItems from './SentItems';
import AnnouncementHistory from './AnnouncementHistory';
import { useAuth } from '../../context/AuthContext';

const ROLES = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];

type TabType = 'announcements' | 'messages' | 'sent' | 'history' | 'templates' | 'emergency' | 'sms';

const Communication = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('announcements');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendSms, setSendSms] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sendNotification, setSendNotification] = useState(true);
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT' | 'EMERGENCY'>('NORMAL');
  const [scheduledAt, setScheduledAt] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // AI composer state
  const [showAIComposer, setShowAIComposer] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState<'formal' | 'friendly' | 'urgent' | 'celebratory'>('formal');
  const [aiLoading, setAiLoading] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateCategory, setTemplateCategory] = useState('general');

  // Emergency broadcast state
  const [emergencySubject, setEmergencySubject] = useState('');
  const [emergencyMessage, setEmergencyMessage] = useState('');
  const [emergencySending, setEmergencySending] = useState(false);

  // SMS Center state
  const [smsMode, setSmsMode] = useState<'single' | 'bulk'>('single');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsStatus, setSmsStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [smsBulkRecipients, setSmsBulkRecipients] = useState<{ phone: string; message: string }[]>([{ phone: '', message: '' }]);
  const [smsBroadcastPhones, setSmsBroadcastPhones] = useState('');
  const [smsBroadcastMessage, setSmsBroadcastMessage] = useState('');
  const [smsBulkType, setSmsBulkType] = useState<'broadcast' | 'individual'>('broadcast');
  const [smsBalance, setSmsBalance] = useState<string | null>(null);
  const [smsBalanceLoading, setSmsBalanceLoading] = useState(false);
  const [smsScheduledAt, setSmsScheduledAt] = useState('');

  const isAdmin = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'].includes(user?.role || '');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canSendAnnouncements = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'].includes(user?.role || '');
  const canChat = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER', 'PARENT', 'STUDENT'].includes(user?.role || '');
  const canViewLogs = isAdmin;

  useEffect(() => {
    if (!canSendAnnouncements && canChat) {
      setActiveTab('messages');
    }
  }, [canSendAnnouncements, canChat]);

  useEffect(() => {
    if (activeTab === 'templates' && canSendAnnouncements) {
      fetchTemplates();
    }
  }, [activeTab]);

  const fetchTemplates = async () => {
    try {
      const res = await api.get('/communication/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error('Failed to fetch templates', err);
    }
  };

  const handleRoleToggle = (role: string) => {
    setTargetRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      setStatus({ type: 'error', message: 'Please fill in all fields' });
      return;
    }

    setSending(true);
    setStatus(null);

    try {
      const payload: any = {
        subject,
        message,
        targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
        sendEmail,
        sendSms,
        sendWhatsApp,
        sendNotification,
        priority,
      };

      if (scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }

      const response = await api.post('/communication/announcements', payload);

      setStatus({ type: 'success', message: response.data.message });
      setSubject('');
      setMessage('');
      setTargetRoles([]);
      setSendEmail(false);
      setSendSms(false);
      setSendWhatsApp(false);
      setScheduledAt('');
      setPriority('NORMAL');
    } catch (error: any) {
      console.error('Failed to send announcement', error);
      setStatus({ type: 'error', message: error.response?.data?.message || 'Failed to send announcement' });
    } finally {
      setSending(false);
    }
  };

  const handleAICompose = async () => {
    if (!aiTopic) return;
    setAiLoading(true);
    try {
      const res = await api.post('/communication/ai-compose', {
        topic: aiTopic,
        tone: aiTone,
        audience: targetRoles.length > 0 ? targetRoles.join(', ') : undefined,
      });
      setSubject(res.data.subject || '');
      setMessage(res.data.message || '');
      setShowAIComposer(false);
      setAiTopic('');
      setStatus({ type: 'success', message: '✨ AI draft generated! Review and edit before sending.' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'AI composition failed. Check AI settings.' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleUseTemplate = (template: any) => {
    setSubject(template.subject || '');
    setMessage(template.body);
    setActiveTab('announcements');
    setStatus({ type: 'success', message: `Template "${template.name}" loaded` });
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !templateBody) return;
    try {
      await api.post('/communication/templates', {
        name: templateName,
        subject: templateSubject,
        body: templateBody,
        category: templateCategory,
      });
      setTemplateName('');
      setTemplateBody('');
      setTemplateSubject('');
      setShowTemplateForm(false);
      fetchTemplates();
      setStatus({ type: 'success', message: 'Template saved!' });
    } catch {
      setStatus({ type: 'error', message: 'Failed to save template' });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/communication/templates/${id}`);
      fetchTemplates();
    } catch {
      setStatus({ type: 'error', message: 'Failed to delete template' });
    }
  };

  const handleEmergencyBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencySubject || !emergencyMessage) return;
    if (!window.confirm('⚠️ This will send an emergency broadcast to ALL users via ALL channels (Email, SMS, WhatsApp, Push, In-App). Continue?')) return;

    setEmergencySending(true);
    try {
      const res = await api.post('/communication/emergency-broadcast', {
        subject: emergencySubject,
        message: emergencyMessage,
      });
      setStatus({ type: 'success', message: res.data.message });
      setEmergencySubject('');
      setEmergencyMessage('');
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Emergency broadcast failed' });
    } finally {
      setEmergencySending(false);
    }
  };

  if (!canSendAnnouncements && !canChat) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto text-center text-gray-500 dark:text-gray-400">
        You do not have permission to access this page.
      </div>
    );
  }

  const tabs: { key: TabType; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'announcements', label: 'New Announcement', icon: <Megaphone size={18} />, show: canSendAnnouncements },
    { key: 'sms', label: 'SMS Center', icon: <Phone size={18} />, show: isAdmin },
    { key: 'history', label: 'History', icon: <Clock size={18} />, show: canSendAnnouncements },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={18} />, show: canChat },
    { key: 'templates', label: 'Templates', icon: <FileText size={18} />, show: canSendAnnouncements },
    { key: 'sent', label: 'Sent Items', icon: <BarChart3 size={18} />, show: canViewLogs },
    { key: 'emergency', label: 'Emergency', icon: <AlertTriangle size={18} />, show: isSuperAdmin },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-6xl mx-auto space-y-6">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none stroke-current">
          <Megaphone size={160} />
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Megaphone className="w-8 h-8 text-blue-200" />
            Communication Hub
          </h1>
          <p className="text-blue-100 mt-2 text-sm md:text-base max-w-2xl leading-relaxed">
            Centralized platform for announcements, direct messaging, and multi-channel broadcasts to students, parents, and staff.
          </p>
        </div>
      </div>

      {/* Status Banner */}
      <AnimatePresence>
        {status && activeTab !== 'sms' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.95 }}
            className={`p-4 rounded-xl flex items-center gap-3 shadow-sm border ${
              status.type === 'success' 
                ? 'bg-green-50/80 border-green-200 dark:bg-green-900/20 dark:border-green-800/50 text-green-800 dark:text-green-300' 
                : 'bg-red-50/80 border-red-200 dark:bg-red-900/20 dark:border-red-800/50 text-red-800 dark:text-red-300'
            }`}
          >
            {status.type === 'success' ? <CheckCircle size={20} className="text-green-600 dark:text-green-400" /> : <AlertCircle size={20} className="text-red-600 dark:text-red-400" />}
            <span className="font-medium">{status.message}</span>
            <button onClick={() => setStatus(null)} className="ml-auto p-1 hover:bg-black/5 rounded-lg transition-colors">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Navigation (Framer Motion) */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide relative z-0">
        {tabs.filter(t => t.show).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 whitespace-nowrap text-sm ${
                isActive
                  ? tab.key === 'emergency' 
                    ? 'text-red-700 dark:text-red-400' 
                    : tab.key === 'sms'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="communicationTabs"
                  className="absolute inset-0 bg-white dark:bg-slate-800 shadow-sm border border-gray-200 dark:border-slate-700 rounded-xl -z-10"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
      {activeTab === 'sms' && isAdmin ? (
        // ===== SMS CENTER TAB =====
        <div className="space-y-6">
          {/* SMS Balance & Mode Selector */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                    <Phone size={24} />
                  </div>
                  SMS Command Center
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-sm text-sm">Send single or bulk text messages directly to parent and staff mobile numbers.</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Balance Check */}
                <button
                  type="button"
                  onClick={async () => {
                    setSmsBalanceLoading(true);
                    try {
                      const res = await api.get('/sms/balance');
                      setSmsBalance(res.data.balance);
                    } catch (err: any) {
                      setSmsBalance(err.response?.data?.error || 'Could not check balance');
                    } finally {
                      setSmsBalanceLoading(false);
                    }
                  }}
                  disabled={smsBalanceLoading}
                  className="px-4 py-2.5 text-sm bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-600 font-medium transition-colors shadow-sm flex items-center gap-2"
                >
                  <Wallet size={16} className="text-gray-400" />
                  {smsBalanceLoading ? 'Checking...' : 'Check Credits'}
                </button>
                {smsBalance !== null && (
                  <span className="text-sm font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 px-4 py-2.5 rounded-xl shadow-sm">
                    Credits: {smsBalance}
                  </span>
                )}
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex bg-gray-100/50 dark:bg-slate-700/30 p-1.5 rounded-xl mt-6">
              <button
                type="button"
                onClick={() => { setSmsMode('single'); setSmsStatus(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  smsMode === 'single'
                    ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow shadow-green-600/10'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Smartphone size={18} />
                Single Recipient
              </button>
              <button
                type="button"
                onClick={() => { setSmsMode('bulk'); setSmsStatus(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  smsMode === 'bulk'
                    ? 'bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 shadow shadow-green-600/10'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Users size={18} />
                Bulk Broadcast
              </button>
            </div>
          </div>

          {/* Status */}
          <AnimatePresence>
            {smsStatus && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className={`p-4 rounded-xl flex items-center gap-3 border shadow-sm ${
                smsStatus.type === 'success' 
                  ? 'bg-green-50/80 border-green-200 dark:bg-green-900/20 dark:border-green-800/50 text-green-800 dark:text-green-300' 
                  : 'bg-red-50/80 border-red-200 dark:bg-red-900/20 dark:border-red-800/50 text-red-800 dark:text-red-300'
              }`}>
                {smsStatus.type === 'success' ? <CheckCircle size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-red-600" />}
                <span className="font-medium">{smsStatus.message}</span>
                <button onClick={() => setSmsStatus(null)} className="ml-auto p-1 hover:bg-black/5 rounded-lg opacity-60 hover:opacity-100">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* SINGLE SMS */}
          {smsMode === 'single' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }} 
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 md:p-8"
            >
              <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                <Smartphone size={18} className="text-green-600" />
                Send Single SMS
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="e.g. 0977123456 or 260977123456"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Zambian numbers: 0977..., 260977..., or +260977...</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message</label>
                  <textarea
                    rows={4}
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Type your message..."
                    maxLength={1600}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {smsMessage.length}/1600 chars · {Math.ceil(smsMessage.length / 160) || 0} SMS credit{Math.ceil(smsMessage.length / 160) !== 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                    <Calendar size={14} />
                    Schedule (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={smsScheduledAt}
                      onChange={(e) => setSmsScheduledAt(e.target.value)}
                      className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    {smsScheduledAt && (
                      <button type="button" onClick={() => setSmsScheduledAt('')} className="text-sm text-red-500 hover:text-red-700">Clear</button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={smsSending || !smsPhone.trim() || !smsMessage.trim()}
                  onClick={async () => {
                    setSmsSending(true);
                    setSmsStatus(null);
                    try {
                      const payload: any = { phone: smsPhone.trim(), message: smsMessage };
                      if (smsScheduledAt) payload.scheduledAt = new Date(smsScheduledAt).toISOString();
                      const res = await api.post('/sms/send', payload);
                      setSmsStatus({ type: 'success', message: res.data.message || 'SMS sent!' });
                      setSmsPhone('');
                      setSmsMessage('');
                      setSmsScheduledAt('');
                    } catch (err: any) {
                      setSmsStatus({ type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Failed to send SMS' });
                    } finally {
                      setSmsSending(false);
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                  <Send size={18} />
                  {smsSending ? 'Sending...' : smsScheduledAt ? 'Schedule SMS' : 'Send SMS'}
                </button>
              </div>
            </motion.div>
          )}

          {/* BULK SMS */}
          {smsMode === 'bulk' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                  <Users size={18} className="text-green-600" />
                  Bulk SMS
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSmsBulkType('broadcast')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      smsBulkType === 'broadcast'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-800'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    Same message to all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmsBulkType('individual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      smsBulkType === 'individual'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-800'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    Different messages
                  </button>
                </div>
              </div>

              {/* Broadcast: same message to many */}
              {smsBulkType === 'broadcast' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Phone Numbers</label>
                    <textarea
                      rows={4}
                      value={smsBroadcastPhones}
                      onChange={(e) => setSmsBroadcastPhones(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-green-500 font-mono text-sm"
                      placeholder={"Enter phone numbers, one per line or comma-separated:\n0977123456\n0966789012\n0955345678"}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {smsBroadcastPhones.trim() ? smsBroadcastPhones.split(/[,\n]+/).filter(p => p.trim()).length : 0} number(s) entered
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message (sent to all)</label>
                    <textarea
                      rows={4}
                      value={smsBroadcastMessage}
                      onChange={(e) => setSmsBroadcastMessage(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-green-500"
                      placeholder="Type your message..."
                      maxLength={1600}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {smsBroadcastMessage.length}/1600 chars · {Math.ceil(smsBroadcastMessage.length / 160) || 0} SMS credit{Math.ceil(smsBroadcastMessage.length / 160) !== 1 ? 's' : ''} per recipient
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                      <Calendar size={14} />
                      Schedule (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={smsScheduledAt}
                        onChange={(e) => setSmsScheduledAt(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
                        min={new Date().toISOString().slice(0, 16)}
                      />
                      {smsScheduledAt && (
                        <button type="button" onClick={() => setSmsScheduledAt('')} className="text-sm text-red-500 hover:text-red-700">Clear</button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={smsSending || !smsBroadcastPhones.trim() || !smsBroadcastMessage.trim()}
                    onClick={async () => {
                      const phones = smsBroadcastPhones.split(/[,\n]+/).map(p => p.trim()).filter(Boolean);
                      if (phones.length === 0) return;
                      if (phones.length > 50 && !window.confirm(`You are about to send ${phones.length} SMS messages. Continue?`)) return;
                      setSmsSending(true);
                      setSmsStatus(null);
                      try {
                        const payload: any = { phones, message: smsBroadcastMessage };
                        if (smsScheduledAt) payload.scheduledAt = new Date(smsScheduledAt).toISOString();
                        const res = await api.post('/sms/broadcast', payload);
                        setSmsStatus({ type: 'success', message: `✅ Broadcast complete: ${res.data.sent}/${res.data.total} sent successfully` });
                        setSmsBroadcastPhones('');
                        setSmsBroadcastMessage('');
                        setSmsScheduledAt('');
                      } catch (err: any) {
                        setSmsStatus({ type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Broadcast failed' });
                      } finally {
                        setSmsSending(false);
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                  >
                    <Send size={18} />
                    {smsSending ? 'Sending...' : smsScheduledAt ? 'Schedule Broadcast' : `Send Broadcast (${smsBroadcastPhones.trim() ? smsBroadcastPhones.split(/[,\n]+/).filter(p => p.trim()).length : 0} recipients)`}
                  </button>
                </div>
              )}

              {/* Individual: different message per recipient */}
              {smsBulkType === 'individual' && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {smsBulkRecipients.map((r, idx) => (
                      <div key={idx} className="flex gap-3 items-start p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-300 text-sm font-bold">
                          {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            type="tel"
                            value={r.phone}
                            onChange={(e) => {
                              const updated = [...smsBulkRecipients];
                              updated[idx].phone = e.target.value;
                              setSmsBulkRecipients(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                            placeholder="Phone number"
                          />
                          <textarea
                            rows={2}
                            value={r.message}
                            onChange={(e) => {
                              const updated = [...smsBulkRecipients];
                              updated[idx].message = e.target.value;
                              setSmsBulkRecipients(updated);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                            placeholder="Message for this recipient..."
                            maxLength={1600}
                          />
                        </div>
                        {smsBulkRecipients.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSmsBulkRecipients(smsBulkRecipients.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSmsBulkRecipients([...smsBulkRecipients, { phone: '', message: '' }])}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    <Plus size={16} />
                    Add Recipient
                  </button>
                  <button
                    type="button"
                    disabled={smsSending || smsBulkRecipients.every(r => !r.phone.trim() || !r.message.trim())}
                    onClick={async () => {
                      const valid = smsBulkRecipients.filter(r => r.phone.trim() && r.message.trim());
                      if (valid.length === 0) return;
                      if (valid.length > 20 && !window.confirm(`You are about to send ${valid.length} individual SMS messages. Continue?`)) return;
                      setSmsSending(true);
                      setSmsStatus(null);
                      try {
                        const res = await api.post('/sms/bulk', { recipients: valid });
                        setSmsStatus({ type: 'success', message: `✅ Bulk send complete: ${res.data.sent}/${res.data.total} sent successfully` });
                        setSmsBulkRecipients([{ phone: '', message: '' }]);
                      } catch (err: any) {
                        setSmsStatus({ type: 'error', message: err.response?.data?.error || err.response?.data?.message || 'Bulk send failed' });
                      } finally {
                        setSmsSending(false);
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                  >
                    <Send size={18} />
                    {smsSending ? 'Sending...' : `Send ${smsBulkRecipients.filter(r => r.phone.trim() && r.message.trim()).length} Messages`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : activeTab === 'messages' && canChat ? (
        <ChatInterface />
      ) : activeTab === 'sent' && canViewLogs ? (
        <SentItems />
      ) : activeTab === 'history' && canSendAnnouncements ? (
        <AnnouncementHistory />
      ) : activeTab === 'templates' && canSendAnnouncements ? (
        // ===== TEMPLATES TAB =====
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <FileText size={20} className="text-blue-600" />
                Message Templates
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Save reusable templates for announcements</p>
            </div>
            <button
              onClick={() => setShowTemplateForm(!showTemplateForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              {showTemplateForm ? 'Cancel' : '+ New Template'}
            </button>
          </div>

          {showTemplateForm && (
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 space-y-4">
              <input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
              />
              <input
                placeholder="Subject (optional)"
                value={templateSubject}
                onChange={(e) => setTemplateSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
              />
              <textarea
                placeholder="Template body..."
                rows={4}
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
              />
              <div className="flex gap-2 items-center">
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white text-sm"
                >
                  <option value="general">General</option>
                  <option value="fee_reminder">Fee Reminder</option>
                  <option value="attendance">Attendance</option>
                  <option value="report">Report Card</option>
                  <option value="event">Event</option>
                  <option value="custom">Custom</option>
                </select>
                <button
                  onClick={handleSaveTemplate}
                  disabled={!templateName || !templateBody}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  Save Template
                </button>
              </div>
            </div>
          )}

          <div className="p-6">
            {templates.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No templates yet. Create your first one!</p>
            ) : (
              <div className="grid gap-4">
                {templates.map((t: any) => (
                  <div key={t.id} className="border border-gray-200 dark:border-slate-600 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-800 dark:text-white">{t.name}</h3>
                        {t.subject && <p className="text-sm text-gray-500 dark:text-gray-400">Subject: {t.subject}</p>}
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {t.category}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUseTemplate(t)}
                          className="px-3 py-1 text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{t.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'emergency' && isSuperAdmin ? (
        // ===== EMERGENCY BROADCAST TAB =====
        <div className="bg-red-50 dark:bg-slate-800 rounded-3xl shadow-sm border-2 border-red-500/30 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none stroke-current text-red-900">
            <AlertTriangle size={200} />
          </div>
          <div className="p-8 border-b border-red-200/50 dark:border-red-900/30 relative z-10">
            <h2 className="text-2xl font-bold text-red-700 dark:text-red-400 flex items-center gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl text-red-600 animate-pulse">
                <AlertTriangle size={28} />
              </div>
              Emergency Broadcast
            </h2>
            <p className="text-red-600/80 dark:text-red-400/80 mt-2 max-w-xl font-medium">
              CRITICAL: This sends to ALL users via ALL channels simultaneously (Email, SMS, WhatsApp, Push, In-App). Use only for severe emergencies.
            </p>
          </div>

          <form onSubmit={handleEmergencyBroadcast} className="p-8 space-y-5 relative z-10">
            <div>
              <label className="block text-sm font-bold text-red-800 dark:text-red-300 mb-1.5 uppercase tracking-wide">Emergency Subject</label>
              <input
                type="text"
                value={emergencySubject}
                onChange={(e) => setEmergencySubject(e.target.value)}
                placeholder="e.g. URGENT: SCHOOL CLOSURE DUE TO WEATHER"
                className="w-full px-5 py-3 border-2 border-red-300 dark:border-red-800 rounded-xl bg-white dark:bg-slate-900 dark:text-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-red-300 font-medium text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-red-800 dark:text-red-300 mb-1.5 uppercase tracking-wide">Emergency Message</label>
              <textarea
                rows={5}
                value={emergencyMessage}
                onChange={(e) => setEmergencyMessage(e.target.value)}
                placeholder="Describe the emergency situation clearly and provide immediate instructions..."
                className="w-full px-5 py-4 border-2 border-red-300 dark:border-red-800 rounded-xl bg-white dark:bg-slate-900 dark:text-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-red-300 font-medium text-lg"
              />
            </div>
            <div className="pt-4">
              <button
                type="submit"
                disabled={emergencySending || !emergencySubject || !emergencyMessage}
                className="w-full flex justify-center items-center gap-3 px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg shadow-xl shadow-red-600/30 transition-all active:scale-[0.98]"
              >
                <Zap size={24} />
                {emergencySending ? 'BROADCASTING EMERGENCY...' : '🚨 INITIATE EMERGENCY BROADCAST'}
              </button>
            </div>
          </form>
        </div>
      ) : canSendAnnouncements ? (
        // ===== NEW ANNOUNCEMENT TAB =====
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 md:p-8 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                  <Send size={24} />
                </div>
                New Announcement
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Broadcast messages via multiple channels. All deliveries are tracked.</p>
            </div>
            <button
              onClick={() => setShowAIComposer(!showAIComposer)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                showAIComposer
                  ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800'
                  : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300 dark:bg-slate-700 dark:border-purple-900 dark:hover:bg-purple-900/20'
              }`}
            >
              <Wand2 size={18} />
              {showAIComposer ? 'Close AI Assistant' : 'Write with AI'}
            </button>
          </div>

          {/* AI Composer Panel */}
          <AnimatePresence>
            {showAIComposer && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-b border-purple-100 dark:border-purple-900/50 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/10 dark:to-indigo-900/10 overflow-hidden"
              >
                <div className="p-6 md:p-8 space-y-4">
                  <h3 className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-2">
                    <Sparkles size={18} className="text-purple-600 dark:text-purple-400" /> AI Announcement Composer
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-purple-700/70 dark:text-purple-300/70 mb-1.5 uppercase">Topic or details</label>
                      <input
                        type="text"
                        value={aiTopic}
                        onChange={(e) => setAiTopic(e.target.value)}
                        placeholder="e.g. 'School closing early tomorrow due to weather. Pickup at 1PM.'"
                        className="w-full px-4 py-3 border border-purple-200 dark:border-purple-800/60 rounded-xl bg-white dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-purple-700/70 dark:text-purple-300/70 mb-1.5 uppercase">Tone</label>
                      <div className="relative">
                        <select
                          value={aiTone}
                          onChange={(e) => setAiTone(e.target.value as any)}
                          className="w-full px-4 py-3 border border-purple-200 dark:border-purple-800/60 rounded-xl bg-white dark:bg-slate-800 dark:text-white appearance-none focus:ring-2 focus:ring-purple-500 outline-none font-medium"
                        >
                          <option value="formal">Formal & Professional</option>
                          <option value="friendly">Friendly & Warm</option>
                          <option value="urgent">Urgent & Direct</option>
                          <option value="celebratory">Celebratory & Happy</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-3.5 text-purple-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleAICompose}
                      disabled={aiLoading || !aiTopic}
                      className="flex justify-center w-full sm:w-auto items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 text-sm font-bold shadow-md shadow-purple-600/20 transition-all active:scale-[0.98]"
                    >
                      {aiLoading ? <span className="animate-spin text-xl">✨</span> : <Sparkles size={18} />}
                      {aiLoading ? 'Drafting with AI...' : 'Generate Draft'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Message Content */}
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-3 text-lg font-medium border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50/50 dark:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-800 dark:text-white"
                    placeholder="e.g. School Closure Notice"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Message Content</label>
                  <textarea
                    rows={8}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50/50 dark:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-800 dark:text-white resize-y"
                    placeholder="Type your announcement here..."
                  />
                </div>
                
                {/* Save as Template Button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (subject && message) {
                        setTemplateName('');
                        setTemplateSubject(subject);
                        setTemplateBody(message);
                        setShowTemplateForm(true);
                        setActiveTab('templates');
                      }
                    }}
                    disabled={!subject || !message}
                    className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 flex items-center gap-1.5 transition-colors p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700"
                  >
                    <FileText size={16} /> Save this as a Template
                  </button>
                </div>
              </div>

              {/* Right Column: Settings & Delivery */}
              <div className="space-y-8 lg:border-l border-gray-100 dark:border-slate-700 lg:pl-8">
                {/* Priority Selection */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2.5 uppercase tracking-wider">Priority Level</label>
                  <div className="flex flex-col gap-2">
                    {(['NORMAL', 'URGENT', 'EMERGENCY'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-all text-left flex items-center justify-between ${
                          priority === p
                            ? p === 'EMERGENCY' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 ring-1 ring-red-500 shadow-sm'
                              : p === 'URGENT' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 ring-1 ring-amber-500 shadow-sm'
                              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 ring-1 ring-blue-500 shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {p === 'EMERGENCY' ? '🚨 ' : p === 'URGENT' ? '⚡ ' : '📋 '} {p.charAt(0) + p.slice(1).toLowerCase()}
                        </span>
                        {priority === p && <CheckCircle size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Audience */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Users size={14} />
                      Target Roles
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleRoleToggle(role)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                          targetRoles.includes(role)
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {role.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Leave all unchecked to send to EVERYONE.</p>
                </div>

                {/* Schedule */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={14} />
                    Schedule Send
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-slate-600 rounded-xl bg-gray-50 dark:bg-slate-700/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 dark:text-white outline-none"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  {scheduledAt && (
                    <button type="button" onClick={() => setScheduledAt('')} className="mt-1.5 text-xs font-medium text-red-500 hover:text-red-600 text-right w-full">
                      Clear Schedule
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Channels */}
            <div className="pt-6 border-t border-gray-100 dark:border-slate-700">
              <label className="block text-sm font-semibold text-gray-800 dark:text-white mb-3">Delivery Channels</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* In-App Notification */}
                <label className={`relative flex flex-col items-center justify-center p-4 min-h-[100px] border-2 rounded-2xl cursor-pointer transition-all ${
                  sendNotification 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' 
                    : 'border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-slate-800'
                }`}>
                  <input type="checkbox" checked={sendNotification} onChange={(e) => setSendNotification(e.target.checked)} className="sr-only" />
                  <Bell size={28} className={`mb-2 ${sendNotification ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-sm font-bold ${sendNotification ? 'text-blue-800 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>In-App UI</span>
                  {sendNotification && <div className="absolute top-2 right-2 text-blue-600"><CheckCircle size={18} className="fill-blue-100" /></div>}
                </label>

                {/* Email */}
                <label className={`relative flex flex-col items-center justify-center p-4 min-h-[100px] border-2 rounded-2xl cursor-pointer transition-all ${
                  sendEmail 
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' 
                    : 'border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-800'
                }`}>
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="sr-only" />
                  <Mail size={28} className={`mb-2 ${sendEmail ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-sm font-bold ${sendEmail ? 'text-indigo-800 dark:text-indigo-300' : 'text-gray-500 dark:text-gray-400'}`}>Email Inbox</span>
                  {sendEmail && <div className="absolute top-2 right-2 text-indigo-600"><CheckCircle size={18} className="fill-indigo-100" /></div>}
                </label>

                {/* SMS */}
                <label className={`relative flex flex-col items-center justify-center p-4 min-h-[100px] border-2 rounded-2xl cursor-pointer transition-all ${
                  sendSms 
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-sm' 
                    : 'border-gray-200 dark:border-slate-600 hover:border-green-300 dark:hover:border-green-700 bg-white dark:bg-slate-800'
                }`}>
                  <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="sr-only" />
                  <Smartphone size={28} className={`mb-2 ${sendSms ? 'text-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-sm font-bold ${sendSms ? 'text-green-800 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>Text / SMS</span>
                  {sendSms && <div className="absolute top-2 right-2 text-green-600"><CheckCircle size={18} className="fill-green-100" /></div>}
                </label>

                {/* WhatsApp */}
                <label className={`relative flex flex-col items-center justify-center p-4 min-h-[100px] border-2 rounded-2xl cursor-pointer transition-all ${
                  sendWhatsApp 
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-sm' 
                    : 'border-gray-200 dark:border-slate-600 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-800'
                }`}>
                  <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} className="sr-only" />
                  <MessageCircle size={28} className={`mb-2 ${sendWhatsApp ? 'text-emerald-600' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className={`text-sm font-bold ${sendWhatsApp ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>WhatsApp</span>
                  {sendWhatsApp && <div className="absolute top-2 right-2 text-emerald-600"><CheckCircle size={18} className="fill-emerald-100" /></div>}
                </label>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-6 border-t border-gray-100 dark:border-slate-700 flex justify-end">
              <button
                type="submit"
                disabled={sending || (!sendEmail && !sendNotification && !sendSms && !sendWhatsApp) || !subject || !message}
                className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg active:scale-[0.98] ${
                  sending || (!sendEmail && !sendNotification && !sendSms && !sendWhatsApp) || !subject || !message
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-slate-700 dark:text-gray-500 shadow-none'
                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-600/30'
                }`}
              >
                {sending ? (
                  <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Sending...</>
                ) : scheduledAt ? (
                  <><Calendar size={22} /> Schedule for Later</>
                ) : (
                  <><Send size={22} /> Send Announcement Now</>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Communication;
