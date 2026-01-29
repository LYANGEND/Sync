import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Save, Clock, Calendar, DollarSign, FileText,
    Bell, Mail, MessageSquare, Settings as SettingsIcon
} from 'lucide-react';
import api from '../../utils/api';

interface BranchSettings {
    branchId: string;
    operatingHours: {
        monday: { open: string; close: string; closed: boolean };
        tuesday: { open: string; close: string; closed: boolean };
        wednesday: { open: string; close: string; closed: boolean };
        thursday: { open: string; close: string; closed: boolean };
        friday: { open: string; close: string; closed: boolean };
        saturday: { open: string; close: string; closed: boolean };
        sunday: { open: string; close: string; closed: boolean };
    };
    holidays: Array<{ date: string; name: string }>;
    notifications: {
        emailEnabled: boolean;
        smsEnabled: boolean;
        whatsappEnabled: boolean;
    };
    customFees: {
        registrationFee: number;
        examFee: number;
        libraryFee: number;
    };
}

const defaultSettings: BranchSettings = {
    branchId: '',
    operatingHours: {
        monday: { open: '08:00', close: '17:00', closed: false },
        tuesday: { open: '08:00', close: '17:00', closed: false },
        wednesday: { open: '08:00', close: '17:00', closed: false },
        thursday: { open: '08:00', close: '17:00', closed: false },
        friday: { open: '08:00', close: '17:00', closed: false },
        saturday: { open: '08:00', close: '13:00', closed: false },
        sunday: { open: '08:00', close: '17:00', closed: true }
    },
    holidays: [],
    notifications: {
        emailEnabled: true,
        smsEnabled: false,
        whatsappEnabled: false
    },
    customFees: {
        registrationFee: 0,
        examFee: 0,
        libraryFee: 0
    }
};

const BranchSettings = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [settings, setSettings] = useState<BranchSettings>(defaultSettings);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'hours' | 'holidays' | 'notifications' | 'fees'>('hours');
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });

    useEffect(() => {
        if (id) {
            fetchSettings();
        }
    }, [id]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            // In a real implementation, this would fetch from an API
            // For now, we'll use default settings with the branch ID
            setSettings({ ...defaultSettings, branchId: id! });
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            // In a real implementation, this would save to an API
            await new Promise(resolve => setTimeout(resolve, 1000));
            alert('Settings saved successfully!');
        } catch (error) {
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const updateOperatingHours = (day: keyof typeof settings.operatingHours, field: string, value: any) => {
        setSettings({
            ...settings,
            operatingHours: {
                ...settings.operatingHours,
                [day]: {
                    ...settings.operatingHours[day],
                    [field]: value
                }
            }
        });
    };

    const addHoliday = () => {
        if (newHoliday.date && newHoliday.name) {
            setSettings({
                ...settings,
                holidays: [...settings.holidays, newHoliday]
            });
            setNewHoliday({ date: '', name: '' });
        }
    };

    const removeHoliday = (index: number) => {
        setSettings({
            ...settings,
            holidays: settings.holidays.filter((_, i) => i !== index)
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'hours', label: 'Operating Hours', icon: Clock },
        { id: 'holidays', label: 'Holidays', icon: Calendar },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'fees', label: 'Custom Fees', icon: DollarSign }
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/branches/${id}`)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Branch Settings</h1>
                        <p className="text-gray-500 dark:text-gray-400">Configure branch-specific settings</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    <Save size={20} />
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-slate-700">
                <nav className="flex gap-4 -mb-px overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <Icon size={18} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'hours' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Operating Hours</h3>
                    <div className="space-y-4">
                        {Object.entries(settings.operatingHours).map(([day, hours]) => (
                            <div key={day} className="flex items-center gap-4">
                                <div className="w-32">
                                    <span className="font-medium text-gray-900 dark:text-white capitalize">{day}</span>
                                </div>
                                <div className="flex items-center gap-4 flex-1">
                                    <input
                                        type="time"
                                        value={hours.open}
                                        onChange={(e) => updateOperatingHours(day as any, 'open', e.target.value)}
                                        disabled={hours.closed}
                                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50"
                                    />
                                    <span className="text-gray-500">to</span>
                                    <input
                                        type="time"
                                        value={hours.close}
                                        onChange={(e) => updateOperatingHours(day as any, 'close', e.target.value)}
                                        disabled={hours.closed}
                                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white disabled:opacity-50"
                                    />
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={hours.closed}
                                            onChange={(e) => updateOperatingHours(day as any, 'closed', e.target.checked)}
                                            className="rounded"
                                        />
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Closed</span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'holidays' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Branch Holidays</h3>
                    
                    {/* Add Holiday */}
                    <div className="flex gap-4 mb-6">
                        <input
                            type="date"
                            value={newHoliday.date}
                            onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        />
                        <input
                            type="text"
                            value={newHoliday.name}
                            onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                            placeholder="Holiday name"
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                        />
                        <button
                            onClick={addHoliday}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Add Holiday
                        </button>
                    </div>

                    {/* Holiday List */}
                    <div className="space-y-2">
                        {settings.holidays.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No holidays configured</p>
                        ) : (
                            settings.holidays.map((holiday, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{holiday.name}</p>
                                        <p className="text-sm text-gray-500">{new Date(holiday.date).toLocaleDateString()}</p>
                                    </div>
                                    <button
                                        onClick={() => removeHoliday(idx)}
                                        className="text-red-600 hover:text-red-700 text-sm"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'notifications' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Notification Preferences</h3>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Mail size={20} className="text-blue-600" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Email Notifications</p>
                                    <p className="text-sm text-gray-500">Send notifications via email</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.notifications.emailEnabled}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    notifications: { ...settings.notifications, emailEnabled: e.target.checked }
                                })}
                                className="rounded"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <MessageSquare size={20} className="text-green-600" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">SMS Notifications</p>
                                    <p className="text-sm text-gray-500">Send notifications via SMS</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.notifications.smsEnabled}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    notifications: { ...settings.notifications, smsEnabled: e.target.checked }
                                })}
                                className="rounded"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <MessageSquare size={20} className="text-green-600" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">WhatsApp Notifications</p>
                                    <p className="text-sm text-gray-500">Send notifications via WhatsApp</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={settings.notifications.whatsappEnabled}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    notifications: { ...settings.notifications, whatsappEnabled: e.target.checked }
                                })}
                                className="rounded"
                            />
                        </label>
                    </div>
                </div>
            )}

            {activeTab === 'fees' && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Custom Fee Structure</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Registration Fee
                            </label>
                            <input
                                type="number"
                                value={settings.customFees.registrationFee}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    customFees: { ...settings.customFees, registrationFee: parseFloat(e.target.value) || 0 }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                placeholder="0.00"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Exam Fee
                            </label>
                            <input
                                type="number"
                                value={settings.customFees.examFee}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    customFees: { ...settings.customFees, examFee: parseFloat(e.target.value) || 0 }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                placeholder="0.00"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Library Fee
                            </label>
                            <input
                                type="number"
                                value={settings.customFees.libraryFee}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    customFees: { ...settings.customFees, libraryFee: parseFloat(e.target.value) || 0 }
                                })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-900 dark:text-blue-200">
                                <strong>Note:</strong> These fees are specific to this branch and will override the default fee structure for students enrolled here.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchSettings;
