import { useState } from 'react';
import { Brain, Loader2, Plus, Minus } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

const BloomsQuestionGenerator = () => {
    const [formData, setFormData] = useState({
        topic: '',
        subject: '',
        gradeLevel: 5,
        distribution: {
            remember: 2,
            understand: 3,
            apply: 3,
            analyze: 2,
            evaluate: 0,
            create: 0,
        },
        questionType: 'mixed' as 'multiple-choice' | 'short-answer' | 'essay' | 'mixed',
    });
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const bloomsLevels = [
        { key: 'remember', label: 'Remember', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', description: 'Recall facts, terms, concepts' },
        { key: 'understand', label: 'Understand', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', description: 'Explain ideas or concepts' },
        { key: 'apply', label: 'Apply', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', description: 'Use information in new situations' },
        { key: 'analyze', label: 'Analyze', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', description: 'Draw connections, examine relationships' },
        { key: 'evaluate', label: 'Evaluate', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', description: 'Justify decisions or positions' },
        { key: 'create', label: 'Create', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', description: 'Produce new or original work' },
    ];

    const updateDistribution = (key: string, delta: number) => {
        setFormData(prev => ({
            ...prev,
            distribution: {
                ...prev.distribution,
                [key]: Math.max(0, (prev.distribution[key as keyof typeof prev.distribution] || 0) + delta),
            },
        }));
    };

    const totalQuestions = Object.values(formData.distribution).reduce((sum, val) => sum + val, 0);

    const handleGenerate = async () => {
        if (!formData.topic || !formData.subject) {
            toast.error('Please fill in all required fields');
            return;
        }
        if (totalQuestions === 0) {
            toast.error('Please add at least one question');
            return;
        }

        setGenerating(true);
        try {
            const response = await api.post('/teacher-assistant/academic/blooms-questions', formData);
            setResult(response.data.questions);
            toast.success('Questions generated!');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to generate questions');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center">
                        <Brain size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Bloom's Taxonomy Question Generator
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Create questions at specific cognitive levels
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Basic Info */}
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Assessment Details</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Topic *
                                </label>
                                <input
                                    type="text"
                                    value={formData.topic}
                                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                                    placeholder="e.g., Photosynthesis, Fractions"
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Subject *
                                </label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="e.g., Science, Mathematics"
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Grade Level *
                                </label>
                                <select
                                    value={formData.gradeLevel}
                                    onChange={(e) => setFormData({ ...formData, gradeLevel: parseInt(e.target.value) })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                >
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Question Type
                                </label>
                                <select
                                    value={formData.questionType}
                                    onChange={(e) => setFormData({ ...formData, questionType: e.target.value as any })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                >
                                    <option value="mixed">Mixed</option>
                                    <option value="multiple-choice">Multiple Choice</option>
                                    <option value="short-answer">Short Answer</option>
                                    <option value="essay">Essay</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Bloom's Distribution */}
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Question Distribution
                            </h3>
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                Total: {totalQuestions} questions
                            </span>
                        </div>
                        
                        <div className="space-y-3">
                            {bloomsLevels.map((level) => (
                                <div key={level.key} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-1 rounded text-xs font-semibold ${level.color}`}>
                                                    {level.label}
                                                </span>
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {level.description}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => updateDistribution(level.key, -1)}
                                                className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <span className="w-12 text-center font-semibold text-gray-900 dark:text-white">
                                                {formData.distribution[level.key as keyof typeof formData.distribution]}
                                            </span>
                                            <button
                                                onClick={() => updateDistribution(level.key, 1)}
                                                className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${level.color.split(' ')[0].replace('100', '500')} transition-all`}
                                            style={{
                                                width: totalQuestions > 0
                                                    ? `${(formData.distribution[level.key as keyof typeof formData.distribution] / totalQuestions) * 100}%`
                                                    : '0%'
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || totalQuestions === 0}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
                    >
                        {generating ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Generating Questions...
                            </>
                        ) : (
                            <>
                                <Brain size={20} />
                                Generate {totalQuestions} Question{totalQuestions !== 1 ? 's' : ''}
                            </>
                        )}
                    </button>

                    {/* Result */}
                    {result && (
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Generated Questions</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                                {result}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BloomsQuestionGenerator;
