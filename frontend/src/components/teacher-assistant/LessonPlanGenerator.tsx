import { useState, useEffect } from 'react';
import { BookOpen, Loader2, Copy, Download, RefreshCw, Sparkles, CheckCircle, FileText } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Subject {
    id: string;
    name: string;
    code: string;
}

interface GeneratedResponse {
    conversationId: string;
    lessonPlan: string;
    metadata: {
        subject: string;
        topic: string;
        gradeLevel: number;
        duration: number;
    };
}

const LessonPlanGenerator = () => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [generatedPlan, setGeneratedPlan] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        subject: '',
        topic: '',
        gradeLevel: 7,
        duration: 45,
        learningObjectives: [''],
        specialRequirements: '',
        teachingStyle: 'mixed' as 'lecture' | 'hands-on' | 'group-work' | 'mixed',
    });

    useEffect(() => {
        fetchSubjects();
    }, []);

    const fetchSubjects = async () => {
        try {
            const response = await api.get('/teacher-assistant/subjects');
            setSubjects(response.data);
        } catch (error) {
            console.error('Failed to fetch subjects:', error);
        }
    };

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addObjective = () => {
        setFormData(prev => ({
            ...prev,
            learningObjectives: [...prev.learningObjectives, ''],
        }));
    };

    const updateObjective = (index: number, value: string) => {
        setFormData(prev => ({
            ...prev,
            learningObjectives: prev.learningObjectives.map((obj, i) => i === index ? value : obj),
        }));
    };

    const removeObjective = (index: number) => {
        if (formData.learningObjectives.length > 1) {
            setFormData(prev => ({
                ...prev,
                learningObjectives: prev.learningObjectives.filter((_, i) => i !== index),
            }));
        }
    };

    const generateLessonPlan = async () => {
        if (!formData.subject || !formData.topic) {
            toast.error('Please fill in subject and topic');
            return;
        }

        setLoading(true);
        setGeneratedPlan(null);

        try {
            const response = await api.post<GeneratedResponse>('/teacher-assistant/lesson-plan/generate', {
                subject: formData.subject,
                topic: formData.topic,
                gradeLevel: formData.gradeLevel,
                duration: formData.duration,
                learningObjectives: formData.learningObjectives.filter(o => o.trim()),
                specialRequirements: formData.specialRequirements || undefined,
                teachingStyle: formData.teachingStyle,
            });

            setGeneratedPlan(response.data.lessonPlan);
            setConversationId(response.data.conversationId);
            toast.success('Lesson plan generated!');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to generate lesson plan');
        } finally {
            setLoading(false);
        }
    };

    const exportDocument = async (format: 'pdf' | 'word') => {
        if (!conversationId) {
            toast.error('No lesson plan to export');
            return;
        }

        setExporting(true);
        try {
            const response = await api.get(`/teacher-assistant/conversations/${conversationId}/export/${format}`, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data]);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lesson-plan-${formData.topic.replace(/[^a-z0-9]/gi, '_')}.${format === 'pdf' ? 'pdf' : 'docx'}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success(`${format.toUpperCase()} downloaded successfully!`);
        } catch (error) {
            console.error('Export error:', error);
            toast.error(`Failed to export ${format.toUpperCase()}`);
        } finally {
            setExporting(false);
        }
    };

    const copyToClipboard = () => {
        if (generatedPlan) {
            navigator.clipboard.writeText(generatedPlan);
            toast.success('Copied to clipboard!');
        }
    };

    const downloadAsTxt = () => {
        if (generatedPlan) {
            const blob = new Blob([generatedPlan], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lesson-plan-${formData.topic.replace(/\s+/g, '-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Downloaded!');
        }
    };

    const durationOptions = [30, 45, 60, 90, 120];
    const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const teachingStyles = [
        { value: 'lecture', label: 'Lecture-based' },
        { value: 'hands-on', label: 'Hands-on Activities' },
        { value: 'group-work', label: 'Group Work' },
        { value: 'mixed', label: 'Mixed Approach' },
    ];

    return (
        <div className="flex h-full overflow-hidden">
            {/* Form Panel */}
            <div className="w-full lg:w-1/2 p-6 overflow-y-auto bg-white dark:bg-slate-800/50 border-r border-gray-200 dark:border-slate-700">
                <div className="max-w-lg mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                            <BookOpen size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Lesson Plan Generator</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Create detailed lesson plans in seconds</p>
                        </div>
                    </div>

                    <div className="space-y-5">
                        {/* Subject */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Subject <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={formData.subject}
                                onChange={(e) => handleInputChange('subject', e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                            >
                                <option value="">Select a subject...</option>
                                {subjects.map(sub => (
                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                ))}
                                <option value="Mathematics">Mathematics</option>
                                <option value="English">English</option>
                                <option value="Science">Science</option>
                                <option value="Social Studies">Social Studies</option>
                                <option value="History">History</option>
                                <option value="Geography">Geography</option>
                            </select>
                        </div>

                        {/* Topic */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Topic <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formData.topic}
                                onChange={(e) => handleInputChange('topic', e.target.value)}
                                placeholder="e.g., Photosynthesis, Quadratic Equations"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </div>

                        {/* Grade Level & Duration */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Grade Level
                                </label>
                                <select
                                    value={formData.gradeLevel}
                                    onChange={(e) => handleInputChange('gradeLevel', parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                                >
                                    {gradeOptions.map(grade => (
                                        <option key={grade} value={grade}>Grade {grade}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Duration
                                </label>
                                <select
                                    value={formData.duration}
                                    onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                                >
                                    {durationOptions.map(dur => (
                                        <option key={dur} value={dur}>{dur} minutes</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Teaching Style */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Teaching Style
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {teachingStyles.map(style => (
                                    <button
                                        key={style.value}
                                        onClick={() => handleInputChange('teachingStyle', style.value)}
                                        className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${formData.teachingStyle === style.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Learning Objectives */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Learning Objectives (Optional)
                            </label>
                            <div className="space-y-2">
                                {formData.learningObjectives.map((obj, index) => (
                                    <div key={index} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={obj}
                                            onChange={(e) => updateObjective(index, e.target.value)}
                                            placeholder={`Objective ${index + 1}`}
                                            className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                                        />
                                        {formData.learningObjectives.length > 1 && (
                                            <button
                                                onClick={() => removeObjective(index)}
                                                className="px-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={addObjective}
                                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    + Add another objective
                                </button>
                            </div>
                        </div>

                        {/* Special Requirements */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Special Requirements (Optional)
                            </label>
                            <textarea
                                value={formData.specialRequirements}
                                onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
                                placeholder="e.g., ELL accommodations, visual learner support"
                                rows={2}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 resize-none"
                            />
                        </div>

                        {/* Tip Box */}
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                            <div className="flex items-start gap-3">
                                <Sparkles className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    <span className="font-semibold">Tip:</span> The more details you provide, the better the lesson plan will be! Add specific learning objectives for best results.
                                </p>
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={generateLessonPlan}
                            disabled={loading || !formData.subject || !formData.topic}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    Generate Lesson Plan
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Result Panel */}
            <div className="hidden lg:flex flex-1 flex-col bg-gray-50 dark:bg-slate-900">
                {generatedPlan ? (
                    <>
                        {/* Result Header */}
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="text-green-500" size={20} />
                                <span className="font-semibold text-gray-900 dark:text-white">Lesson Plan Generated</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyToClipboard}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                                    title="Copy to clipboard"
                                >
                                    <Copy size={16} />
                                    Copy
                                </button>
                                <button
                                    onClick={() => exportDocument('pdf')}
                                    disabled={exporting}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Export as PDF"
                                >
                                    {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                    PDF
                                </button>
                                <button
                                    onClick={() => exportDocument('word')}
                                    disabled={exporting}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Export as Word"
                                >
                                    {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    Word
                                </button>
                                <button
                                    onClick={generateLessonPlan}
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
                                    title="Regenerate lesson plan"
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
                                    {generatedPlan}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center max-w-md px-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <BookOpen size={48} className="text-blue-500 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Your Lesson Plan Will Appear Here
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Fill in the form and click "Generate Lesson Plan" to create a comprehensive lesson plan tailored to your needs.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LessonPlanGenerator;
