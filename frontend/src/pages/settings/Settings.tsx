import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { Save, School, Calendar, Globe, Phone, Mail, MapPin, MessageSquare, Server, Palette, Bell, Send, Upload, Trash2, Image } from 'lucide-react';

interface SettingsData {
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolWebsite: string;
  currentTermId: string;

  // Theme
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  // Notification Channels
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;

  // Fee Reminder Settings
  feeReminderEnabled: boolean;
  feeReminderDaysBefore: number;
  overdueReminderEnabled: boolean;
  overdueReminderFrequency: number;

  // SMTP
  smtpHost: string;
  smtpPort: number | '';
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFromEmail: string;
  smtpFromName: string;

  // SMS
  smsProvider: string;
  smsApiKey: string;
  smsApiSecret: string;
  smsSenderId: string;
}

interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

const Settings = () => {
  const { refreshSettings } = useTheme();
  const [settings, setSettings] = useState<SettingsData>({
    schoolName: '',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    schoolWebsite: '',
    currentTermId: '',

    primaryColor: '#2563eb',
    secondaryColor: '#475569',
    accentColor: '#f59e0b',

    emailNotificationsEnabled: true,
    smsNotificationsEnabled: false,
    feeReminderEnabled: true,
    feeReminderDaysBefore: 7,
    overdueReminderEnabled: true,
    overdueReminderFrequency: 7,

    smtpHost: '',
    smtpPort: '',
    smtpSecure: true,
    smtpUser: '',
    smtpPassword: '',
    smtpFromEmail: '',
    smtpFromName: '',

    smsProvider: '',
    smsApiKey: '',
    smsApiSecret: '',
    smsSenderId: '',
  });
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'academic' | 'communication' | 'theme'>('general');

  // Logo upload state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, termsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/academic-terms')
      ]);

      setSettings({
        schoolName: settingsRes.data.schoolName || '',
        schoolAddress: settingsRes.data.schoolAddress || '',
        schoolPhone: settingsRes.data.schoolPhone || '',
        schoolEmail: settingsRes.data.schoolEmail || '',
        schoolWebsite: settingsRes.data.schoolWebsite || '',
        currentTermId: settingsRes.data.currentTermId || '',

        primaryColor: settingsRes.data.primaryColor || '#2563eb',
        secondaryColor: settingsRes.data.secondaryColor || '#475569',
        accentColor: settingsRes.data.accentColor || '#f59e0b',

        emailNotificationsEnabled: settingsRes.data.emailNotificationsEnabled ?? true,
        smsNotificationsEnabled: settingsRes.data.smsNotificationsEnabled ?? false,
        feeReminderEnabled: settingsRes.data.feeReminderEnabled ?? true,
        feeReminderDaysBefore: settingsRes.data.feeReminderDaysBefore ?? 7,
        overdueReminderEnabled: settingsRes.data.overdueReminderEnabled ?? true,
        overdueReminderFrequency: settingsRes.data.overdueReminderFrequency ?? 7,

        smtpHost: settingsRes.data.smtpHost || '',
        smtpPort: settingsRes.data.smtpPort || '',
        smtpSecure: settingsRes.data.smtpSecure ?? true,
        smtpUser: settingsRes.data.smtpUser || '',
        smtpPassword: settingsRes.data.smtpPassword || '',
        smtpFromEmail: settingsRes.data.smtpFromEmail || '',
        smtpFromName: settingsRes.data.smtpFromName || '',

        smsProvider: settingsRes.data.smsProvider || '',
        smsApiKey: settingsRes.data.smsApiKey || '',
        smsApiSecret: settingsRes.data.smsApiSecret || '',
        smsSenderId: settingsRes.data.smsSenderId || '',
      });
      setLogoUrl(settingsRes.data.logoUrl || null);
      setTerms(termsRes.data);
    } catch (error) {
      console.error('Failed to fetch settings', error);
    } finally {
      setLoading(false);
    }
  };

  // Logo upload handlers
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await api.post('/settings/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setLogoUrl(response.data.logoUrl);
      refreshSettings(); // Update theme context
    } catch (error) {
      console.error('Failed to upload logo', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Are you sure you want to delete the school logo?')) return;

    try {
      await api.delete('/settings/logo');
      setLogoUrl(null);
      refreshSettings();
    } catch (error) {
      console.error('Failed to delete logo', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...settings,
        currentTermId: settings.currentTermId === '' ? null : settings.currentTermId,
        smtpPort: settings.smtpPort === '' ? null : Number(settings.smtpPort),
      };
      await api.put('/settings', payload);
      await refreshSettings();
      alert('Settings saved successfully');
    } catch (error: any) {
      console.error('Failed to save settings', error.response?.data || error);
      alert('Failed to save settings: ' + (error.response?.data?.errors?.[0]?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">System Settings</h1>

      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-2 px-1 ${activeTab === 'general' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('academic')}
          className={`pb-2 px-1 ${activeTab === 'academic' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Academic
        </button>
        <button
          onClick={() => setActiveTab('theme')}
          className={`pb-2 px-1 ${activeTab === 'theme' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Theme & Branding
        </button>
        <button
          onClick={() => setActiveTab('communication')}
          className={`pb-2 px-1 ${activeTab === 'communication' ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Communication
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Information */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <School className="text-blue-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-800">School Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
                <input
                  type="text"
                  required
                  value={settings.schoolName}
                  onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* School Logo Upload */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">School Logo</label>
                <div className="flex items-center gap-4">
                  {/* Logo Preview */}
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
                    {logoUrl ? (
                      <img
                        src={logoUrl.startsWith('http') ? logoUrl : `${window.location.origin}${logoUrl}`}
                        alt="School Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Image size={32} className="text-gray-400" />
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <label
                      htmlFor="logo-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploadingLogo
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                      <Upload size={16} />
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={handleDeleteLogo}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={16} />
                        Remove
                      </button>
                    )}
                    <p className="text-xs text-gray-500">PNG, JPG up to 2MB. Recommended: 200x200px</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={settings.schoolPhone}
                    onChange={(e) => setSettings({ ...settings, schoolPhone: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={settings.schoolEmail}
                    onChange={(e) => setSettings({ ...settings, schoolEmail: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                  <textarea
                    rows={3}
                    value={settings.schoolAddress}
                    onChange={(e) => setSettings({ ...settings, schoolAddress: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <div className="relative">
                  <Globe size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="url"
                    value={settings.schoolWebsite}
                    onChange={(e) => setSettings({ ...settings, schoolWebsite: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Academic Configuration */}
        {activeTab === 'academic' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <Calendar className="text-blue-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-800">Academic Configuration</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Academic Term</label>
              <p className="text-sm text-gray-500 mb-2">This sets the active term for attendance, grading, and fees.</p>
              <select
                value={settings.currentTermId}
                onChange={(e) => setSettings({ ...settings, currentTermId: e.target.value })}
                className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Active Term</option>
                {terms.map(term => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({new Date(term.startDate).toLocaleDateString()} - {new Date(term.endDate).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Theme Configuration */}
        {activeTab === 'theme' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <Palette className="text-blue-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-800">Theme & Branding</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 uppercase"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Used for buttons, links, and active states.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.secondaryColor}
                    onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                    className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.secondaryColor}
                    onChange={(e) => setSettings({ ...settings, secondaryColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 uppercase"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Used for text, borders, and backgrounds.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                    className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.accentColor}
                    onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 uppercase"
                    pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Used for highlights and special indicators.</p>
              </div>
            </div>
          </div>
        )}

        {/* Communication Settings */}
        {activeTab === 'communication' && (
          <div className="space-y-6">
            {/* Notification Channels */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <Bell className="text-blue-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-800">Notification Channels</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-800">Email Notifications</h3>
                    <p className="text-sm text-gray-500">Send notifications via email to parents and staff</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.emailNotificationsEnabled}
                      onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-800">SMS Notifications</h3>
                    <p className="text-sm text-gray-500">Send notifications via SMS to parents</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.smsNotificationsEnabled}
                      onChange={(e) => setSettings({ ...settings, smsNotificationsEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Fee Reminder Settings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <Send className="text-blue-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-800">Fee Reminder Settings</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-800">Automatic Fee Reminders</h3>
                    <p className="text-sm text-gray-500">Send reminders before fee due dates</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.feeReminderEnabled}
                      onChange={(e) => setSettings({ ...settings, feeReminderEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {settings.feeReminderEnabled && (
                  <div className="pl-4 border-l-2 border-blue-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Send reminder this many days before due date</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={settings.feeReminderDaysBefore}
                      onChange={(e) => setSettings({ ...settings, feeReminderDaysBefore: parseInt(e.target.value) || 7 })}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-500">days</span>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-800">Overdue Reminders</h3>
                    <p className="text-sm text-gray-500">Send reminders for overdue payments</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.overdueReminderEnabled}
                      onChange={(e) => setSettings({ ...settings, overdueReminderEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {settings.overdueReminderEnabled && (
                  <div className="pl-4 border-l-2 border-orange-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Send overdue reminder every</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={settings.overdueReminderFrequency}
                      onChange={(e) => setSettings({ ...settings, overdueReminderFrequency: parseInt(e.target.value) || 7 })}
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-500">days</span>
                  </div>
                )}
              </div>
            </div>

            {/* SMTP Settings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <Server className="text-blue-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-800">Email Settings (SMTP)</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={settings.smtpHost}
                    onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="smtp.gmail.com"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={settings.smtpPort}
                    onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="587"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={settings.smtpUser}
                    onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={settings.smtpPassword}
                    onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
                  <input
                    type="email"
                    value={settings.smtpFromEmail}
                    onChange={(e) => setSettings({ ...settings, smtpFromEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="noreply@school.com"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
                  <input
                    type="text"
                    value={settings.smtpFromName}
                    onChange={(e) => setSettings({ ...settings, smtpFromName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="School Admin"
                  />
                </div>

                <div className="col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.smtpSecure}
                      onChange={(e) => setSettings({ ...settings, smtpSecure: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Use Secure Connection (SSL/TLS)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* SMS Settings */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4 border-b pb-2">
                <MessageSquare className="text-blue-600" size={20} />
                <h2 className="text-lg font-semibold text-gray-800">SMS Gateway Settings</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select
                    value={settings.smsProvider}
                    onChange={(e) => setSettings({ ...settings, smsProvider: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Provider</option>
                    <option value="TWILIO">Twilio</option>
                    <option value="AFRICASTALKING">Africa's Talking</option>
                    <option value="GENERIC">Generic HTTP</option>
                  </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sender ID</label>
                  <input
                    type="text"
                    value={settings.smsSenderId}
                    onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="SCHOOL"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key / SID</label>
                  <input
                    type="password"
                    value={settings.smsApiKey}
                    onChange={(e) => setSettings({ ...settings, smsApiKey: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Secret / Token</label>
                  <input
                    type="password"
                    value={settings.smsApiSecret}
                    onChange={(e) => setSettings({ ...settings, smsApiSecret: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
