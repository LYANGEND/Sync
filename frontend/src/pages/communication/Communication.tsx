import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { 
  Send, Mail, Bell, Users, CheckCircle, AlertCircle, MessageSquare, 
  Megaphone, Clock, BarChart3, Smartphone, MessageCircle, AlertTriangle,
  Sparkles, Calendar, FileText, Zap
} from 'lucide-react';
import ChatInterface from './ChatInterface';
import SentItems from './SentItems';
import AnnouncementHistory from './AnnouncementHistory';
import { useAuth } from '../../context/AuthContext';

const ROLES = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];

type TabType = 'announcements' | 'messages' | 'sent' | 'history' | 'templates' | 'emergency';

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
    { key: 'history', label: 'History', icon: <Clock size={18} />, show: canSendAnnouncements },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={18} />, show: canChat },
    { key: 'templates', label: 'Templates', icon: <FileText size={18} />, show: canSendAnnouncements },
    { key: 'sent', label: 'Sent Items', icon: <BarChart3 size={18} />, show: canViewLogs },
    { key: 'emergency', label: 'Emergency', icon: <AlertTriangle size={18} />, show: isSuperAdmin },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Communication Hub</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage announcements, messages, templates and track all communications</p>
      </div>

      {/* Status Banner */}
      {status && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
        }`}>
          {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {status.message}
          <button onClick={() => setStatus(null)} className="ml-auto text-sm opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.filter(t => t.show).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap text-sm ${
              activeTab === tab.key
                ? tab.key === 'emergency' 
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20' 
                  : 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'messages' && canChat ? (
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
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-2 border-red-200 dark:border-red-900 overflow-hidden">
          <div className="p-6 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
            <h2 className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle size={20} />
              Emergency Broadcast
            </h2>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              Sends to ALL users via ALL channels simultaneously (Email, SMS, WhatsApp, Push, In-App)
            </p>
          </div>

          <form onSubmit={handleEmergencyBroadcast} className="p-6 space-y-4">
            <input
              type="text"
              value={emergencySubject}
              onChange={(e) => setEmergencySubject(e.target.value)}
              placeholder="Emergency subject..."
              className="w-full px-4 py-2 border border-red-300 dark:border-red-800 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-red-500"
            />
            <textarea
              rows={4}
              value={emergencyMessage}
              onChange={(e) => setEmergencyMessage(e.target.value)}
              placeholder="Describe the emergency situation..."
              className="w-full px-4 py-2 border border-red-300 dark:border-red-800 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-red-500"
            />
            <button
              type="submit"
              disabled={emergencySending || !emergencySubject || !emergencyMessage}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-bold shadow-lg"
            >
              <Zap size={20} />
              {emergencySending ? 'Broadcasting...' : '🚨 Send Emergency Broadcast'}
            </button>
          </form>
        </div>
      ) : canSendAnnouncements ? (
        // ===== NEW ANNOUNCEMENT TAB =====
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                <Send size={20} className="text-blue-600" />
                New Announcement
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Broadcast via multiple channels. All deliveries are tracked.</p>
            </div>
            <button
              onClick={() => setShowAIComposer(!showAIComposer)}
              className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 text-sm font-medium border border-purple-200 dark:border-purple-800"
            >
              <Sparkles size={16} />
              AI Compose
            </button>
          </div>

          {/* AI Composer Panel */}
          {showAIComposer && (
            <div className="p-6 border-b border-purple-100 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-900/10">
              <h3 className="font-medium text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
                <Sparkles size={16} /> AI Announcement Composer
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="What is the announcement about? e.g. 'School closing early on Friday'"
                  className="w-full px-4 py-2 border border-purple-200 dark:border-purple-800 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
                />
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value as any)}
                  className="px-4 py-2 border border-purple-200 dark:border-purple-800 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="formal">Formal</option>
                  <option value="friendly">Friendly</option>
                  <option value="urgent">Urgent</option>
                  <option value="celebratory">Celebratory</option>
                </select>
              </div>
              <button
                onClick={handleAICompose}
                disabled={aiLoading || !aiTopic}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
              >
                <Sparkles size={14} />
                {aiLoading ? 'Generating...' : 'Generate Draft'}
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Priority Selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Priority:</label>
              {(['NORMAL', 'URGENT', 'EMERGENCY'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                    priority === p
                      ? p === 'EMERGENCY' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                        : p === 'URGENT' ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                        : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                      : 'bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-600'
                  }`}
                >
                  {p === 'EMERGENCY' ? '🚨 ' : p === 'URGENT' ? '⚡ ' : ''}{p}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white"
                placeholder="e.g. School Closure Notice"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white"
                placeholder="Type your announcement here..."
              />
            </div>

            {/* Target Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Users size={16} />
                Target Audience (Leave empty for ALL users)
              </label>
              <div className="flex flex-wrap gap-3">
                {ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleToggle(role)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      targetRoles.includes(role)
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600'
                    }`}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                <Calendar size={16} />
                Schedule (optional — leave empty to send immediately)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full md:w-auto px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white"
                min={new Date().toISOString().slice(0, 16)}
              />
              {scheduledAt && (
                <button type="button" onClick={() => setScheduledAt('')} className="ml-2 text-sm text-red-500 hover:text-red-700">
                  Clear schedule
                </button>
              )}
            </div>

            {/* Delivery Channels */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-slate-700">
              {/* In-App Notification */}
              <label className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all text-center ${
                sendNotification ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input type="checkbox" checked={sendNotification} onChange={(e) => setSendNotification(e.target.checked)} className="sr-only" />
                <Bell size={24} className={sendNotification ? 'text-blue-600' : 'text-gray-400'} />
                <span className="text-xs font-medium mt-2 text-gray-700 dark:text-gray-200">In-App</span>
                {sendNotification && <CheckCircle size={14} className="mt-1 text-blue-600" />}
              </label>

              {/* Email */}
              <label className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all text-center ${
                sendEmail ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="sr-only" />
                <Mail size={24} className={sendEmail ? 'text-blue-600' : 'text-gray-400'} />
                <span className="text-xs font-medium mt-2 text-gray-700 dark:text-gray-200">Email</span>
                {sendEmail && <CheckCircle size={14} className="mt-1 text-blue-600" />}
              </label>

              {/* SMS */}
              <label className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all text-center ${
                sendSms ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="sr-only" />
                <Smartphone size={24} className={sendSms ? 'text-green-600' : 'text-gray-400'} />
                <span className="text-xs font-medium mt-2 text-gray-700 dark:text-gray-200">SMS</span>
                {sendSms && <CheckCircle size={14} className="mt-1 text-green-600" />}
              </label>

              {/* WhatsApp */}
              <label className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-all text-center ${
                sendWhatsApp ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input type="checkbox" checked={sendWhatsApp} onChange={(e) => setSendWhatsApp(e.target.checked)} className="sr-only" />
                <MessageCircle size={24} className={sendWhatsApp ? 'text-emerald-600' : 'text-gray-400'} />
                <span className="text-xs font-medium mt-2 text-gray-700 dark:text-gray-200">WhatsApp</span>
                {sendWhatsApp && <CheckCircle size={14} className="mt-1 text-emerald-600" />}
              </label>
            </div>

            <div className="flex justify-between items-center pt-4">
              {/* Save as Template */}
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
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 disabled:opacity-30 flex items-center gap-1"
              >
                <FileText size={14} /> Save as Template
              </button>

              <button
                type="submit"
                disabled={sending || (!sendEmail && !sendNotification && !sendSms && !sendWhatsApp)}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
              >
                {scheduledAt ? <Calendar size={18} /> : <Send size={18} />}
                {sending ? 'Sending...' : scheduledAt ? 'Schedule Announcement' : 'Send Announcement'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default Communication;
