import { useState, useEffect } from 'react';
import { X, Loader2, Send, Calendar, BookOpen } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface PublishToHomeworkModalProps {
    conversationId: string;
    quizTitle: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface Class {
    id: string;
    name: string;
    gradeLevel: number;
}

const PublishToHomeworkModal = ({ conversationId, quizTitle, onClose, onSuccess }: PublishToHomeworkModalProps) => {
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [formData, setFormData] = useState({
        classId: '',
        title: quizTitle,
        description: '',
        dueDate: '',
        totalMarks: 100,
    });

    useEffect(() => {
        fetchClasses();
        // Set default due date to 7 days from now
        const defaultDueDate = new Date();
        defaultDueDate.setDate(defaultDueDate.getDate() + 7);
        setFormData(prev => ({
            ...prev,
            dueDate: defaultDueDate.toISOString().slice(0, 16),
        }));
    }, []);

    const fetchClasses = async () => {
        try {
            const response = await api.get('/classes/teacher');
            setClasses(response.data);
        } catch (error) {
            console.error('Failed to fetch classes:', error);
            toast.error('Failed to load classes');
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!formData.classId) {
            toast.error('Please select a class');
            return;
        }
        if (!formData.title) {
            toast.error('Please enter a title');
            return;
        }
        if (!formData.dueDate) {
            toast.error('Please select a due date');
            return;
        }

        setPublishing(true);
        try {
            await api.post(`/teacher-assistant/quiz/${conversationId}/publish-homework`, {
                ...formData,
                dueDate: new Date(formData.dueDate).toISOString(),
            });
            toast.success('Quiz published as homework!');
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to publish homework');
        } finally {
            setPublishing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                            <Send size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Publish as Homework
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Assign this quiz to your students
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="animate-spin text-blue-600" size={32} />
                        </div>
                    ) : (
                        <>
                            {/* Class Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <BookOpen size={16} className="inline mr-1" />
                                    Select Class *
                                </label>
                                <select
                                    value={formData.classId}
                                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                >
                                    <option value="">Choose a class...</option>
                                    {classes.map((cls) => (
                                        <option key={cls.id} value={cls.id}>
                                            {cls.name} (Grade {cls.gradeLevel})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Homework Title *
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Enter homework title"
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Add instructions or notes for students..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white resize-none"
                                />
                            </div>

                            {/* Due Date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Calendar size={16} className="inline mr-1" />
                                    Due Date *
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Total Marks */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Total Marks
                                </label>
                                <input
                                    type="number"
                                    value={formData.totalMarks}
                                    onChange={(e) => setFormData({ ...formData, totalMarks: parseInt(e.target.value) || 0 })}
                                    min="1"
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 px-6 py-4 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={publishing || loading}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
                    >
                        {publishing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Publishing...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                Publish Homework
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PublishToHomeworkModal;
