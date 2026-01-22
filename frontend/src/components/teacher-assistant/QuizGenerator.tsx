import { useState, useEffect } from 'react';
import { ClipboardList, Loader2, Copy, Download, RefreshCw, Sparkles, CheckCircle } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Subject {
    id: string;
    name: string;
    code: string;
}

const QuizGenerator = () => {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(false);
    const [generatedQuiz, setGeneratedQuiz] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        subject: '',
        topic: '',
        gradeLevel: 7,
        questionCount: 10,
        questionTypes: ['multiple-choice'] as ('multiple-choice' | 'true-false' | 'short-answer')[],
        difficulty: 'medium' as 'easy' | 'medium' | 'hard' | 'mixed',
        includeAnswerKey: true,
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

    const toggleQuestionType = (type: 'multiple-choice' | 'true-false' | 'short-answer') => {
        setFormData(prev => {
            const types = prev.questionTypes.includes(type)
                ? prev.questionTypes.filter(t => t !== type)
                : [...prev.questionTypes, type];
            return { ...prev, questionTypes: types.length > 0 ? types : [type] };
        });
    };

    const generateQuiz = async () => {
        if (!formData.subject || !formData.topic) {
            toast.error('Please fill in subject and topic');
            return;
        }

        if (formData.questionTypes.length === 0) {
            toast.error('Please select at least one question type');
            return;
        }

        setLoading(true);
        setGeneratedQuiz(null);

        try {
            const response = await api.post('/teacher-assistant/quiz/generate', formData);
            setGeneratedQuiz(response.data.quiz);
            toast.success('Quiz generated!');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to generate quiz');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (generatedQuiz) {
            navigator.clipboard.writeText(generatedQuiz);
            toast.success('Copied to clipboard!');
        }
    };

    const downloadAsTxt = () => {
        if (generatedQuiz) {
            const blob = new Blob([generatedQuiz], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz-${formData.topic.replace(/\s+/g, '-')}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Downloaded!');
        }
    };

    const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const questionCountOptions = [5, 10, 15, 20, 25, 30];
    const difficultyOptions = [
        { value: 'easy', label: 'Easy', description: 'Basic recall & understanding' },
        { value: 'medium', label: 'Medium', description: 'Application & analysis' },
        { value: 'hard', label: 'Hard', description: 'Synthesis & evaluation' },
        { value: 'mixed', label: 'Mixed', description: 'Variety of difficulty levels' },
    ];
    const questionTypeOptions = [
        { value: 'multiple-choice', label: 'Multiple Choice', icon: '☑️' },
        { value: 'true-false', label: 'True/False', icon: '✓✗' },
        { value: 'short-answer', label: 'Short Answer', icon: '📝' },
    ];

    return (
        <div className="flex h-full overflow-hidden">
            {/* Form Panel */}
            <div className="w-full lg:w-1/2 p-6 overflow-y-auto bg-white dark:bg-slate-800/50 border-r border-gray-200 dark:border-slate-700">
                <div className="max-w-lg mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                            <ClipboardList size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quiz Creator</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Generate assessments and quizzes</p>
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
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white"
                            >
                                <option value="">Select a subject...</option>
                                {subjects.map(sub => (
                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                ))}
                                <option value="Mathematics">Mathematics</option>
                                <option value="English">English</option>
                                <option value="Science">Science</option>
                                <option value="Social Studies">Social Studies</option>
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
                                placeholder="e.g., Photosynthesis, World War 2"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
                            />
                        </div>

                        {/* Grade Level & Question Count */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Grade Level
                                </label>
                                <select
                                    value={formData.gradeLevel}
                                    onChange={(e) => handleInputChange('gradeLevel', parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white"
                                >
                                    {gradeOptions.map(grade => (
                                        <option key={grade} value={grade}>Grade {grade}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                    Questions
                                </label>
                                <select
                                    value={formData.questionCount}
                                    onChange={(e) => handleInputChange('questionCount', parseInt(e.target.value))}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 dark:text-white"
                                >
                                    {questionCountOptions.map(count => (
                                        <option key={count} value={count}>{count} questions</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Question Types */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Question Types
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {questionTypeOptions.map(type => (
                                    <button
                                        key={type.value}
                                        onClick={() => toggleQuestionType(type.value as any)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${formData.questionTypes.includes(type.value as any)
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <span>{type.icon}</span>
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Difficulty */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Difficulty Level
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {difficultyOptions.map(diff => (
                                    <button
                                        key={diff.value}
                                        onClick={() => handleInputChange('difficulty', diff.value)}
                                        className={`p-3 rounded-xl text-left transition-all ${formData.difficulty === diff.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                            }`}
                                    >
                                        <div className="font-medium text-sm">{diff.label}</div>
                                        <div className={`text-xs ${formData.difficulty === diff.value ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {diff.description}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Include Answer Key */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">Include Answer Key</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Add answers and explanations</p>
                            </div>
                            <button
                                onClick={() => handleInputChange('includeAnswerKey', !formData.includeAnswerKey)}
                                className={`relative w-14 h-7 rounded-full transition-colors ${formData.includeAnswerKey ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
                                    }`}
                            >
                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.includeAnswerKey ? 'left-8' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={generateQuiz}
                            disabled={loading || !formData.subject || !formData.topic}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Generating Quiz...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    Generate Quiz
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Result Panel */}
            <div className="hidden lg:flex flex-1 flex-col bg-gray-50 dark:bg-slate-900">
                {generatedQuiz ? (
                    <>
                        {/* Result Header */}
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="text-green-500" size={20} />
                                <span className="font-semibold text-gray-900 dark:text-white">Quiz Generated</span>
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
                                    onClick={downloadAsTxt}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                                >
                                    <Download size={16} />
                                    Download
                                </button>
                                <button
                                    onClick={generateQuiz}
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
                                    {generatedQuiz}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center max-w-md px-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <ClipboardList size={48} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Your Quiz Will Appear Here
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Configure your quiz settings and click "Generate Quiz" to create an assessment.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuizGenerator;
