import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Save, User, BookOpen, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { AcademicFilterButton, AcademicFilterDialog } from '../../components/academics/AcademicFilterDialog';

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

const SubjectAllocation = () => {
    const [classes, setClasses] = useState<Class[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [draftClassId, setDraftClassId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
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
        setError(null);
        try {
            const [termsRes, teachersRes] = await Promise.all([
                api.get('/academic-terms'),
                api.get('/users?role=TEACHER'),
            ]);
            const terms = Array.isArray(termsRes.data) ? termsRes.data : [];
            const activeTerm = terms.find((term: any) => term.isActive) || terms[0];
            const classesRes = activeTerm
                ? await api.get('/classes', { params: { academicTermId: activeTerm.id } })
                : { data: [] };
            setClasses(classesRes.data);
            setTeachers(teachersRes.data);
        } catch (error) {
            console.error('Error fetching initial data:', error);
            setError('Classes and teachers could not be loaded.');
        } finally {
            setLoading(false);
        }
    };

    const fetchClassAssignments = async (classId: string) => {
        setLoadingAssignments(true);
        setError(null);
        setSuccess(null);
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
            setAssignments({});
            setError('Teacher assignments could not be loaded for this class.');
        } finally {
            setLoadingAssignments(false);
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
        if (!teacherId || !selectedClassId) {
            setError('Select a teacher before saving the assignment.');
            return;
        }

        setSaving(prev => ({ ...prev, [subjectId]: true }));
        setError(null);
        setSuccess(null);
        try {
            await api.post('/academics/assign', {
                classId: selectedClassId,
                subjectId,
                teacherId
            });
            const subject = selectedClass?.subjects.find(item => item.id === subjectId);
            setSuccess(`${subject?.name || 'Subject'} assignment saved.`);
        } catch (error: any) {
            console.error('Error saving assignment:', error);
            const apiError = error.response?.data?.error || error.response?.data?.message;
            setError(typeof apiError === 'string' ? apiError : 'Failed to save teacher assignment.');
        } finally {
            setSaving(prev => ({ ...prev, [subjectId]: false }));
        }
    };

    const selectedClass = classes.find(c => c.id === selectedClassId);

    const openFilters = () => {
        setDraftClassId(selectedClassId);
        setShowFilters(true);
    };

    const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSelectedClassId(draftClassId);
        setShowFilters(false);
    };

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">Subject Teacher Allocation</h2>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Assign teachers to subjects for each class.</p>
                </div>
                <AcademicFilterButton onClick={openFilters} activeCount={selectedClassId ? 1 : 0} />
            </div>

            <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Selected class</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{selectedClass?.name || 'None'}</span>
            </div>

            {loading && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300" role="status">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Loading classes and teachers…
                </div>
            )}

            {error && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
                    <AlertCircle className="size-5 flex-none" aria-hidden="true" />
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => setError(null)} className="grid size-10 place-items-center rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50" aria-label="Dismiss error">×</button>
                </div>
            )}

            {success && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" role="status">
                    <CheckCircle2 className="size-5 flex-none" aria-hidden="true" />
                    <span className="flex-1">{success}</span>
                    <button type="button" onClick={() => setSuccess(null)} className="grid size-10 place-items-center rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50" aria-label="Dismiss success message">×</button>
                </div>
            )}

            <AcademicFilterDialog
                open={showFilters}
                title="Filter subject allocation"
                description="Choose the class whose subjects and teacher assignments you want to manage."
                onClose={() => setShowFilters(false)}
                onApply={applyFilters}
                onReset={() => setDraftClassId('')}
            >
                <div>
                    <label htmlFor="allocation-class-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Class</label>
                    <select
                        id="allocation-class-filter"
                        data-filter-autofocus="true"
                        value={draftClassId}
                        onChange={(event) => setDraftClassId(event.target.value)}
                        className="h-12 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                    >
                        <option value="">Choose a class</option>
                        {classes.map(classOption => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
                    </select>
                </div>
            </AcademicFilterDialog>

            {selectedClass && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <caption className="sr-only">Teacher assignments for subjects in {selectedClass.name}</caption>
                            <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                                <tr>
                                    <th scope="col" className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Subject Name</th>
                                    <th scope="col" className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Code</th>
                                    <th scope="col" className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Assigned Teacher</th>
                                    <th scope="col" className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {loadingAssignments ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                                            <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading assignments…</span>
                                        </td>
                                    </tr>
                                ) : selectedClass.subjects && selectedClass.subjects.length > 0 ? (
                                    selectedClass.subjects.map((subject) => (
                                        <tr key={subject.id} className="hover:bg-surface-hover">
                                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={16} className="text-blue-500" aria-hidden="true" />
                                                    {subject.name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-sm">{subject.code}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
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
                                                    disabled={saving[subject.id] || !assignments[subject.id]}
                                                    className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60
                          ${saving[subject.id]
                                                            ? 'bg-blue-50 text-blue-400 cursor-not-allowed'
                                                            : 'bg-primary text-white hover:bg-primary-hover shadow-sm'}`}
                                                >
                                                    {saving[subject.id] ? (
                                                        'Saving...'
                                                    ) : (
                                                        <>
                                                            <Save size={14} aria-hidden="true" />
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

            {!loading && !selectedClass && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Choose a class from Filters to manage its subject teachers.
                </div>
            )}
        </div>
    );
};

export default SubjectAllocation;
