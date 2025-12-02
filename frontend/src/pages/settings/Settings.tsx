import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { Save, School, Calendar, Globe, Phone, Mail, MapPin, MessageSquare, Server, Palette } from 'lucide-react';

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
      setTerms(termsRes.data);
    } catch (error) {
      console.error('Failed to fetch settings', error);
    } finally {
      setLoading(false);
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
