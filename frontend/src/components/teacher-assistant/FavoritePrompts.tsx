import { useState, useEffect } from 'react';
import { Star, Plus, Trash2, Loader2, BookOpen, ClipboardList, Mail, MessageSquare, Sparkles } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface FavoritePrompt {
    id: string;
    title: string;
    prompt: string;
    category?: string;
    icon?: string;
    usageCount: number;
}

interface FavoritePromptsProps {
    onSelectPrompt: (prompt: string) => void;
}

const FavoritePrompts = ({ onSelectPrompt }: FavoritePromptsProps) => {
    const [prompts, setPrompts] = useState<FavoritePrompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newPrompt, setNewPrompt] = useState({ title: '', prompt: '', category: 'general' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPrompts();
    }, []);

    const fetchPrompts = async () => {
        try {
            const response = await api.get('/teacher-assistant/favorite-prompts');
            setPrompts(response.data);
        } catch (error) {
            console.error('Failed to fetch favorite prompts:', error);
        } finally {
            setLoading(false);
        }
    };

    const savePrompt = async () => {
        if (!newPrompt.title || !newPrompt.prompt) {
            toast.error('Please fill in all fields');
            return;
        }

        setSaving(true);
        try {
            await api.post('/teacher-assistant/favorite-prompts', newPrompt);
            toast.success('Prompt saved!');
            setShowAddModal(false);
            setNewPrompt({ title: '', prompt: '', category: 'general' });
            fetchPrompts();
        } catch (error) {
            toast.error('Failed to save prompt');
        } finally {
            setSaving(false);
        }
    };

    const deletePrompt = async (id: string) => {
        if (!confirm('Delete this favorite prompt?')) return;
        try {
            await api.delete(`/teacher-assistant/favorite-prompts/${id}`);
            setPrompts(prompts.filter(p => p.id !== id));
            toast.success('Prompt deleted');
        } catch (error) {
            toast.error('Failed to delete prompt');
        }
    };

    const getCategoryIcon = (category?: string) => {
        switch (category) {
            case 'lesson-plan': return BookOpen;
            case 'quiz': return ClipboardList;
            case 'email': return Mail;
            case 'chat': return MessageSquare;
            default: return Sparkles;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-blue-600" size={24} />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Star size={16} className="text-yellow-500" />
                    Favorite Prompts
                </h3>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="text-xs flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                    <Plus size={14} />
                    Add
                </button>
            </div>

            {prompts.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 dark:bg-slate-800 rounded-xl">
                    <Star size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No favorite prompts yet</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Add your first prompt
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {prompts.map((prompt) => {
                        const Icon = getCategoryIcon(prompt.category);
                        return (
                            <div
                                key={prompt.id}
                                className="group flex items-start gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                onClick={() => onSelectPrompt(prompt.prompt)}
                            >
                                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                    <Icon size={16} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                        {prompt.title}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {prompt.prompt}
                                    </p>
                                    {prompt.usageCount > 0 && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            Used {prompt.usageCount} times
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deletePrompt(prompt.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            Add Favorite Prompt
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={newPrompt.title}
                                    onChange={(e) => setNewPrompt({ ...newPrompt, title: e.target.value })}
                                    placeholder="e.g., Quick lesson plan"
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Prompt
                                </label>
                                <textarea
                                    value={newPrompt.prompt}
                                    onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                                    placeholder="e.g., Create a 45-minute lesson plan on..."
                                    rows={4}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Category
                                </label>
                                <select
                                    value={newPrompt.category}
                                    onChange={(e) => setNewPrompt({ ...newPrompt, category: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                >
                                    <option value="general">General</option>
                                    <option value="lesson-plan">Lesson Plan</option>
                                    <option value="quiz">Quiz</option>
                                    <option value="email">Email</option>
                                    <option value="chat">Chat</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={savePrompt}
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Prompt'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FavoritePrompts;
