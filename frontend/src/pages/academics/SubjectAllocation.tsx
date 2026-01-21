import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Save, User, BookOpen, Check } from 'lucide-react';

interface Class {
    id: string;
    name: string;
    subjects: Subject[];
}

interface Subject {
    id: string;
    name: string;
    code: string;
}

interface Teacher {
    id: string;
    fullName: string;
}

interface Assignment {
    subjectId: string;
    teacherId: string;
}

const SubjectAllocation = () => {
    const [classes, setClasses] = useState<Class[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [assignments, setAssignments] = useState<Record<string, string>>({}); // subjectId -> teacherId
    const [saving, setSaving] = useState<Record<string, boolean>>({}); // subjectId -> isSaving

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedClassId) {
            fetchClassAssignments(selectedClassId);
        } else {
            setAssignments({});
        }
    }, [selectedClassId]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [classesRes, teachersRes] = await Promise.all([
                api.get('/classes'),
                api.get('/users?role=TEACHER'),
            ]);
            setClasses(classesRes.data);
            setTeachers(teachersRes.data);
        } catch (error) {
            console.error('Error fetching initial data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClassAssignments = async (classId: string) => {
        try {
            const response = await api.get(`/academics/class/${classId}`);
            // response.data is array of TeacherSubject objects
            const mapping: Record<string, string> = {};
            response.data.forEach((item: any) => {
                mapping[item.subjectId] = item.teacherId;
            });
            setAssignments(mapping);
        } catch (error) {
            console.error('Error fetching assignments:', error);
        }
    };

    const handleAssignmentChange = (subjectId: string, teacherId: string) => {
        setAssignments(prev => ({
            ...prev,
            [subjectId]: teacherId
        }));
    };

    const saveAssignment = async (subjectId: string) => {
        const teacherId = assignments[subjectId];
        if (!teacherId || !selectedClassId) return;

        setSaving(prev => ({ ...prev, [subjectId]: true }));
        try {
            await api.post('/academics/assign', {
                classId: selectedClassId,
                subjectId,
                teacherId
            });
            // Show temporary success feedback if needed, but the UI state is already updated
        } catch (error) {
            console.error('Error saving assignment:', error);
            alert('Failed to save teacher assignment');
        } finally {
            setSaving(prev => ({ ...prev, [subjectId]: false }));
        }
    };

    const selectedClass = classes.find(c => c.id === selectedClassId);

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Subject Teacher Allocation</h2>
                <p className="text-slate-500 dark:text-slate-400">Assign teachers to subjects for each class.</p>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Class</label>
                <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full md:w-1/3 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 dark:text-white"
                >
                    <option value="">-- Choose a Class --</option>
                    {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {selectedClass && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Subject Name</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Code</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Assigned Teacher</th>
                                    <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {selectedClass.subjects && selectedClass.subjects.length > 0 ? (
                                    selectedClass.subjects.map((subject) => (
                                        <tr key={subject.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={16} className="text-blue-500" />
                                                    {subject.name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-sm">{subject.code}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-slate-400 dark:text-slate-500" />
                                                    <select
                                                        value={assignments[subject.id] || ''}
                                                        onChange={(e) => handleAssignmentChange(subject.id, e.target.value)}
                                                        className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px] bg-white dark:bg-slate-700 dark:text-white"
                                                    >
                                                        <option value="">Select Teacher...</option>
                                                        {teachers.map(t => (
                                                            <option key={t.id} value={t.id}>{t.fullName}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => saveAssignment(subject.id)}
                                                    disabled={saving[subject.id]}
                                                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors
                          ${saving[subject.id]
                                                            ? 'bg-blue-50 text-blue-400 cursor-not-allowed'
                                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'}`}
                                                >
                                                    {saving[subject.id] ? (
                                                        'Saving...'
                                                    ) : (
                                                        <>
                                                            <Save size={14} />
                                                            Save
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                                            No subjects found for this class. Please go to Classes to add subjects.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubjectAllocation;
