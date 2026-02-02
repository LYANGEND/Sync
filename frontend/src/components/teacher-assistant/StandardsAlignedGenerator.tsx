import { useState } from 'react';
import { BookOpen, Loader2, CheckCircle, Search } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface Standard {
    id: string;
    code: string;
    description: string;
    framework: string;
}

const StandardsAlignedGenerator = () => {
    const [formData, setFormData] = useState({
        standards: [] as string[],
        subject: '',
        gradeLevel: 5,
        duration: 45,
        teachingStyle: 'mixed',
    });
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Standard[]>([]);
    const [searching, setSearching] = useState(false);

    const searchStandards = async () => {
        if (!searchQuery.trim()) return;
        
        setSearching(true);
        try {
            const response = await api.get('/teacher-assistant/standards/search', {
                params: {
                    query: searchQuery,
                    subject: formData.subject || undefined,
                    gradeLevel: formData.gradeLevel || undefined,
                },
            });
            setSearchResults(response.data);
        } catch (error) {
            console.error('Search error:', error);
            toast.error('Failed to search standards');
        } finally {
            setSearching(false);
        }
    };

    const toggleStandard = (code: string) => {
        setFormData(prev => ({
            ...prev,
            standards: prev.standards.includes(code)
                ? prev.standards.filter(s => s !== code)
                : [...prev.standards, code],
        }));
    };

    const handleGenerate = async () => {
        if (formData.standards.length === 0) {
            toast.error('Please select at least one standard');
            return;
        }
        if (!formData.subject) {
            toast.error('Please enter a subject');
            return;
        }

        setGenerating(true);
        try {
            const response = await api.post('/teacher-assistant/academic/standards-aligned-lesson', formData);
            setResult(response.data.lesson);
            toast.success('Standards-aligned lesson generated!');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to generate lesson');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                        <BookOpen size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Standards-Aligned Lesson Generator
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Create lessons explicitly mapped to curriculum standards
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Basic Info */}
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Lesson Details</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Subject *
                                </label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="e.g., Mathematics, Science"
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Grade Level *
                                </label>
                                <select
                                    value={formData.gradeLevel}
                                    onChange={(e) => setFormData({ ...formData, gradeLevel: parseInt(e.target.value) })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                >
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Duration (minutes) *
                                </label>
                                <input
                                    type="number"
                                    value={formData.duration}
                                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                                    min="15"
                                    max="180"
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Teaching Style
                                </label>
                                <select
                                    value={formData.teachingStyle}
                                    onChange={(e) => setFormData({ ...formData, teachingStyle: e.target.value })}
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                >
                                    <option value="lecture">Lecture</option>
                                    <option value="hands-on">Hands-on</option>
                                    <option value="group-work">Group Work</option>
                                    <option value="mixed">Mixed Methods</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Standards Selection */}
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 space-y-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Select Standards *</h3>
                        
                        {/* Search */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && searchStandards()}
                                placeholder="Search standards (e.g., CCSS.MATH.5.NF.A.1)"
                                className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={searchStandards}
                                disabled={searching}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                                Search
                            </button>
                        </div>

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {searchResults.map((standard) => (
                                    <div
                                        key={standard.id}
                                        onClick={() => toggleStandard(standard.code)}
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                            formData.standards.includes(standard.code)
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 dark:border-slate-600 hover:border-blue-300'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center ${
                                                formData.standards.includes(standard.code)
                                                    ? 'bg-blue-600'
                                                    : 'bg-gray-200 dark:bg-slate-600'
                                            }`}>
                                                {formData.standards.includes(standard.code) && (
                                                    <CheckCircle size={16} className="text-white" />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-gray-900 dark:text-white">
                                                    {standard.code}
                                                </p>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                    {standard.description}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Selected Standards */}
                        {formData.standards.length > 0 && (
                            <div className="pt-4 border-t border-gray-200 dark:border-slate-600">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Selected Standards ({formData.standards.length}):
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {formData.standards.map((code) => (
                                        <span
                                            key={code}
                                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium flex items-center gap-1"
                                        >
                                            {code}
                                            <button
                                                onClick={() => toggleStandard(code)}
                                                className="hover:text-blue-900 dark:hover:text-blue-100"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || formData.standards.length === 0}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
                    >
                        {generating ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Generating Standards-Aligned Lesson...
                            </>
                        ) : (
                            <>
                                <BookOpen size={20} />
                                Generate Standards-Aligned Lesson
                            </>
                        )}
                    </button>

                    {/* Result */}
                    {result && (
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Generated Lesson Plan</h3>
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

export default StandardsAlignedGenerator;
