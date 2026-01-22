import { useState } from 'react';
import { Mail, Loader2, Copy, RefreshCw, Sparkles, CheckCircle, Plus, X } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const EmailDrafter = () => {
    const [loading, setLoading] = useState(false);
    const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        purpose: 'general' as 'field-trip' | 'grades' | 'behavior' | 'event' | 'general',
        recipient: 'parent' as 'parent' | 'parents-group' | 'admin' | 'colleague',
        tone: 'friendly' as 'formal' | 'friendly' | 'urgent' | 'informative',
        keyPoints: [''],
        customDetails: '',
    });

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addKeyPoint = () => {
        setFormData(prev => ({
            ...prev,
            keyPoints: [...prev.keyPoints, ''],
        }));
    };

    const updateKeyPoint = (index: number, value: string) => {
        setFormData(prev => ({
            ...prev,
            keyPoints: prev.keyPoints.map((point, i) => i === index ? value : point),
        }));
    };

    const removeKeyPoint = (index: number) => {
        if (formData.keyPoints.length > 1) {
            setFormData(prev => ({
                ...prev,
                keyPoints: prev.keyPoints.filter((_, i) => i !== index),
            }));
        }
    };

    const generateEmail = async () => {
        if (formData.keyPoints.every(p => !p.trim())) {
            toast.error('Please add at least one key point');
            return;
        }

        setLoading(true);
        setGeneratedEmail(null);

        try {
            const response = await api.post('/teacher-assistant/email/draft', {
                ...formData,
                keyPoints: formData.keyPoints.filter(p => p.trim()),
                customDetails: formData.customDetails || undefined,
            });

            setGeneratedEmail(response.data.email);
            toast.success('Email drafted!');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to draft email');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (generatedEmail) {
            navigator.clipboard.writeText(generatedEmail);
            toast.success('Copied to clipboard!');
        }
    };

    const purposeOptions = [
        { value: 'field-trip', label: 'Field Trip', icon: '🚌', description: 'Permission & details' },
        { value: 'grades', label: 'Academic Progress', icon: '📊', description: 'Grade updates' },
        { value: 'behavior', label: 'Behavior', icon: '💬', description: 'Classroom observations' },
        { value: 'event', label: 'Event', icon: '📅', description: 'Activity notifications' },
        { value: 'general', label: 'General', icon: '📧', description: 'Other communications' },
    ];

    const recipientOptions = [
        { value: 'parent', label: 'Individual Parent', icon: '👤' },
        { value: 'parents-group', label: 'All Parents', icon: '👥' },
        { value: 'admin', label: 'Administration', icon: '🏫' },
        { value: 'colleague', label: 'Colleague', icon: '🤝' },
    ];

    const toneOptions = [
        { value: 'formal', label: 'Formal', description: 'Professional & official' },
        { value: 'friendly', label: 'Friendly', description: 'Warm & approachable' },
        { value: 'urgent', label: 'Urgent', description: 'Time-sensitive' },
        { value: 'informative', label: 'Informative', description: 'Clear & factual' },
    ];

    return (
        <div className="flex h-full overflow-hidden">
            {/* Form Panel */}
            <div className="w-full lg:w-1/2 p-6 overflow-y-auto bg-white dark:bg-slate-800/50 border-r border-gray-200 dark:border-slate-700">
                <div className="max-w-lg mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                            <Mail size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Email Drafter</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Create professional emails quickly</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {/* Purpose */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Email Purpose
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {purposeOptions.map(purpose => (
                                    <button
                                        key={purpose.value}
                                        onClick={() => handleInputChange('purpose', purpose.value)}
                                        className={`p-3 rounded-xl text-left transition-all ${formData.purpose === purpose.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 font-medium text-sm">
                                            <span>{purpose.icon}</span>
                                            {purpose.label}
                                        </div>
                                        <div className={`text-xs mt-1 ${formData.purpose === purpose.value ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {purpose.description}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recipient */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Recipient
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {recipientOptions.map(recipient => (
                                    <button
                                        key={recipient.value}
                                        onClick={() => handleInputChange('recipient', recipient.value)}
                                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${formData.recipient === recipient.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <span>{recipient.icon}</span>
                                        {recipient.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tone */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Tone
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {toneOptions.map(tone => (
                                    <button
                                        key={tone.value}
                                        onClick={() => handleInputChange('tone', tone.value)}
                                        className={`p-3 rounded-xl text-left transition-all ${formData.tone === tone.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <div className="font-medium text-sm">{tone.label}</div>
                                        <div className={`text-xs ${formData.tone === tone.value ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {tone.description}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Key Points */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Key Points <span className="text-red-500">*</span>
                            </label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                Add the main points you want to include in the email
                            </p>
                            <div className="space-y-2">
                                {formData.keyPoints.map((point, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={point}
                                            onChange={(e) => updateKeyPoint(index, e.target.value)}
                                            placeholder={`Key point ${index + 1}...`}
                                            className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                                        />
                                        {formData.keyPoints.length > 1 && (
                                            <button
                                                onClick={() => removeKeyPoint(index)}
                                                className="px-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                            >
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={addKeyPoint}
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    <Plus size={16} />
                                    Add another point
                                </button>
                            </div>
                        </div>

                        {/* Additional Details */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Additional Details (Optional)
                            </label>
                            <textarea
                                value={formData.customDetails}
                                onChange={(e) => handleInputChange('customDetails', e.target.value)}
                                placeholder="Any specific details you want to include..."
                                rows={3}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                            />
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={generateEmail}
                            disabled={loading || formData.keyPoints.every(p => !p.trim())}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Drafting Email...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    Draft Email
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Result Panel */}
            <div className="hidden lg:flex flex-1 flex-col bg-gray-50 dark:bg-slate-900">
                {generatedEmail ? (
                    <>
                        {/* Result Header */}
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="text-green-500" size={20} />
                                <span className="font-semibold text-gray-900 dark:text-white">Email Drafted</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                    <Copy size={16} />
                                    Copy
                                </button>
                                <button
                                    onClick={generateEmail}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl hover:bg-slate-800 transition-colors"
                                >
                                    <RefreshCw size={16} />
                                    Regenerate
                                </button>
                            </div>
                        </div>

                        {/* Result Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 p-8">
                                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                                    {generatedEmail}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center max-w-md px-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <Mail size={48} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Your Email Will Appear Here
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Select the purpose, recipient, and key points, then click "Draft Email" to generate a professional email.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmailDrafter;
