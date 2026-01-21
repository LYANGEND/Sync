import React, { useState, useEffect } from 'react';
import { Save, Filter, TrendingUp, AlertCircle, Check } from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
}

interface Assessment {
    id: string;
    title: string;
    type: string;
    totalMarks: number;
    weight: number;
    date: string;
}

interface GradebookData {
    students: Student[];
    assessments: Assessment[];
    results: any[]; // List of assessment results
}

const TeacherGradebook = () => {
    const [classes, setClasses] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [terms, setTerms] = useState<any[]>([]);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedTermId, setSelectedTermId] = useState('');

    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Local edits: { [assessmentId_studentId]: score }
    const [edits, setEdits] = useState<Record<string, number>>({});

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedClassId && selectedSubjectId && selectedTermId) {
            fetchGradebook();
        }
    }, [selectedClassId, selectedSubjectId, selectedTermId]);

    const fetchInitialData = async () => {
        try {
            const [classRes, subjectRes, termRes] = await Promise.all([
                api.get('/classes'),
                api.get('/subjects'),
                api.get('/academic-terms')
            ]);
            setClasses(classRes.data);
            setSubjects(subjectRes.data);
            setTerms(termRes.data);

            const activeTerm = termRes.data.find((t: any) => t.isActive);
            if (activeTerm) setSelectedTermId(activeTerm.id);
            if (classRes.data.length > 0) setSelectedClassId(classRes.data[0].id);
            if (subjectRes.data.length > 0) setSelectedSubjectId(subjectRes.data[0].id);

        } catch (error) {
            console.error('Initial data fetch error:', error);
            toast.error('Failed to load filters');
        }
    };

    const fetchGradebook = async () => {
        setLoading(true);
        try {
            const response = await api.get('/assessments/gradebook', {
                params: {
                    classId: selectedClassId,
                    subjectId: selectedSubjectId,
                    termId: selectedTermId
                }
            });
            setData(response.data);
            setEdits({}); // Clear edits on refresh
        } catch (error) {
            console.error('Gradebook fetch error:', error);
            toast.error('Failed to load gradebook');
        } finally {
            setLoading(false);
        }
    };

    const getScore = (studentId: string, assessmentId: string) => {
        // Check local edits first
        const editKey = `${assessmentId}_${studentId}`;
        if (editKey in edits) {
            return edits[editKey];
        }
        // Then db data
        const result = data?.results.find(r => r.studentId === studentId && r.assessmentId === assessmentId);
        return result ? Number(result.score) : '';
    };

    const handleScoreChange = (studentId: string, assessmentId: string, value: string) => {
        const numValue = value === '' ? 0 : parseFloat(value);

        // Validate Max Marks
        const assessment = data?.assessments.find(a => a.id === assessmentId);
        if (assessment && numValue > assessment.totalMarks) {
            toast.error(`Max marks for this assessment is ${assessment.totalMarks}`);
            return;
        }

        setEdits(prev => ({
            ...prev,
            [`${assessmentId}_${studentId}`]: numValue
        }));
    };

    const handleSave = async () => {
        if (Object.keys(edits).length === 0) return;
        setSaving(true);

        try {
            // Group edits by Assessment ID
            const updatesByAssessment: Record<string, any[]> = {};

            Object.entries(edits).forEach(([key, score]) => {
                const [assessmentId, studentId] = key.split('_');
                if (!updatesByAssessment[assessmentId]) {
                    updatesByAssessment[assessmentId] = [];
                }
                updatesByAssessment[assessmentId].push({ studentId, score });
            });

            // Execute sequential updates (to avoid overwhelming server or if backend logic requires distinct calls)
            // Usually parallel is fine but let's be safe.
            const promises = Object.entries(updatesByAssessment).map(([assessmentId, results]) =>
                api.post('/assessments/results', {
                    assessmentId,
                    results
                })
            );

            await Promise.all(promises);
            toast.success('Grades saved successfully');
            fetchGradebook(); // Refresh to clear edits and sync

        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save grades');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <TrendingUp className="text-blue-600" />
                        Teacher Gradebook
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">Manage assessment scores for your classes</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 px-2">
                        <Filter size={16} />
                        <span className="text-sm font-medium">Filters:</span>
                    </div>
                    <select
                        value={selectedTermId}
                        onChange={(e) => setSelectedTermId(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    >
                        {terms.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    >
                        {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                    <select
                        value={selectedSubjectId}
                        onChange={(e) => setSelectedSubjectId(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    >
                        {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-[500px]">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">Loading gradebook...</div>
                ) : !data || data.students.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                        <AlertCircle size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
                        <p>No students or data found for this selection.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-slate-700 z-10 sticky top-0">
                                <tr>
                                    <th className="sticky left-0 bg-gray-50 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600 font-semibold text-xs text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">#</th>
                                    <th className="sticky left-12 bg-gray-50 dark:bg-slate-700 px-4 py-3 border-b border-gray-200 dark:border-slate-600 font-semibold text-xs text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[200px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student</th>

                                    {data.assessments.map(assessment => (
                                        <th key={assessment.id} className="px-4 py-3 border-b border-gray-200 dark:border-slate-600 min-w-[120px] text-center">
                                            <div className="text-xs font-bold text-gray-800 dark:text-white">{assessment.title}</div>
                                            <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                                                Max: {assessment.totalMarks} • {assessment.weight}%
                                            </div>
                                        </th>
                                    ))}

                                    <th className="px-4 py-3 border-b border-gray-200 dark:border-slate-600 text-center font-semibold text-xs text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px] bg-blue-50/50 dark:bg-blue-900/30">Average</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {data.students.map((student, idx) => {
                                    // Calculate quick average based on available results + edits
                                    // This is 'simple' client side calc for display
                                    let totalObtained = 0;
                                    let totalMax = 0;

                                    data.assessments.forEach(ass => {
                                        const s = getScore(student.id, ass.id);
                                        if (s !== '' && s !== 0) {
                                            totalObtained += (Number(s) / ass.totalMarks) * 100 * (ass.weight / 100);
                                            // Simple weighted average logic is tricky without full backend logic.
                                            // Let's just sum Percentage * Weight if defined.
                                            // If weight is not perfectly distributed, this might be off.
                                            // For visual aid only.
                                        }
                                    });

                                    return (
                                        <tr key={student.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/50 transition-colors group">
                                            <td className="sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-gray-50 dark:group-hover:bg-slate-700 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-slate-700 z-10">{idx + 1}</td>
                                            <td className="sticky left-12 bg-white dark:bg-slate-800 group-hover:bg-gray-50 dark:group-hover:bg-slate-700 px-4 py-3 border-r border-gray-100 dark:border-slate-700 z-10">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{student.firstName} {student.lastName}</div>
                                                <div className="text-xs text-gray-400">{student.admissionNumber}</div>
                                            </td>

                                            {data.assessments.map(assessment => (
                                                <td key={assessment.id} className="p-0 border-r border-gray-100 dark:border-slate-700 relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={assessment.totalMarks}
                                                        value={getScore(student.id, assessment.id)}
                                                        onChange={(e) => handleScoreChange(student.id, assessment.id, e.target.value)}
                                                        className={`w-full h-full min-h-[48px] px-2 text-center text-sm outline-none focus:bg-blue-50 dark:focus:bg-blue-900/30 focus:ring-2 focus:ring-blue-500 inset-0 transition-all dark:text-white ${`${assessment.id}_${student.id}` in edits ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300 font-semibold' : 'bg-transparent'
                                                            }`}
                                                        placeholder="-"
                                                    />
                                                </td>
                                            ))}

                                            <td className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-gray-300 bg-blue-50/30 dark:bg-blue-900/20">
                                                {/* Placeholder for calculated Total */}
                                                -
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="fixed bottom-6 right-6 z-30">
                <button
                    onClick={handleSave}
                    disabled={saving || loading || Object.keys(edits).length === 0}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium transform active:scale-95"
                >
                    {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                    {saving ? 'Saving...' : `Save ${Object.keys(edits).length > 0 ? `(${Object.keys(edits).length})` : ''} Changes`}
                </button>
            </div>

        </div>
    );
};

export default TeacherGradebook;
