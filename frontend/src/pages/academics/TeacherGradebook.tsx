import React, { useState, useEffect, useRef } from 'react';
import { Save, Filter, AlertCircle, Check, RotateCcw, Search, X } from 'lucide-react';
import api from '../../utils/api';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useAppDialog } from '../../components/ui/AppDialogProvider';

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

interface ClassOption {
    id: string;
    name: string;
    gradeLevel?: number;
    subjects?: Array<{ id: string; name: string; code?: string }>;
}

interface SubjectOption {
    id: string;
    name: string;
    code?: string;
}

interface GradebookData {
    students: Student[];
    assessments: Assessment[];
    results: any[]; // List of assessment results
}

const TeacherGradebook = () => {
    const { user } = useAuth();
    const { confirm } = useAppDialog();
    const [searchParams] = useSearchParams();
    const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER';
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [terms, setTerms] = useState<any[]>([]);

    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedTermId, setSelectedTermId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const [showFilters, setShowFilters] = useState(false);
    const [draftClassId, setDraftClassId] = useState('');
    const [draftSubjectId, setDraftSubjectId] = useState('');
    const [draftTermId, setDraftTermId] = useState('');
    const [draftSearchQuery, setDraftSearchQuery] = useState('');

    const [data, setData] = useState<GradebookData | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const selectedClass = classes.find((item) => item.id === selectedClassId);
    const availableSubjects = selectedClassId
        ? (selectedClass?.subjects?.length ? selectedClass.subjects : subjects)
        : subjects;
    const draftClass = classes.find((item) => item.id === draftClassId);
    const draftAvailableSubjects = draftClassId
        ? (draftClass?.subjects?.length ? draftClass.subjects : subjects)
        : subjects;
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filteredStudents = (data?.students || []).filter((student) => {
        if (!normalizedSearch) return true;
        const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
        return fullName.includes(normalizedSearch)
            || student.admissionNumber.toLowerCase().includes(normalizedSearch);
    });

    // Local edits: { [assessmentId_studentId]: score }
    const [edits, setEdits] = useState<Record<string, number>>({});
    const editCount = Object.keys(edits).length;
    const activeFilterCount = [selectedClassId, selectedSubjectId, selectedTermId, searchQuery].filter(Boolean).length;

    // Keyboard navigation
    const tableRef = useRef<HTMLTableElement>(null);
    const filterSearchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedClassId && selectedSubjectId && selectedTermId) {
            fetchGradebook();
        }
    }, [selectedClassId, selectedSubjectId, selectedTermId]);

    useEffect(() => {
        if (!selectedClassId) {
            return;
        }

        if (availableSubjects.length === 0) {
            setSelectedSubjectId('');
            return;
        }

        const subjectStillValid = availableSubjects.some((subject) => subject.id === selectedSubjectId);
        if (!subjectStillValid) {
            setSelectedSubjectId(availableSubjects[0].id);
        }
    }, [selectedClassId, selectedSubjectId, availableSubjects]);

    useEffect(() => {
        if (!showFilters) return undefined;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowFilters(false);
        };

        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleEscape);
        requestAnimationFrame(() => filterSearchInputRef.current?.focus());

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleEscape);
            previouslyFocused?.focus();
        };
    }, [showFilters]);

    useEffect(() => {
        if (!canEdit || editCount === 0) return undefined;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [canEdit, editCount]);

    const fetchInitialData = async () => {
        try {
            setLoadError(null);
            const [subjectRes, termRes] = await Promise.all([
                api.get('/subjects'),
                api.get('/academic-terms')
            ]);
            const activeTerm = termRes.data.find((t: any) => t.isActive) || termRes.data[0];
            const classRes = activeTerm
                ? await api.get('/classes', { params: { academicTermId: activeTerm.id } })
                : { data: [] };
            setClasses(classRes.data);
            setSubjects(subjectRes.data);
            setTerms(termRes.data);

            if (activeTerm) setSelectedTermId(activeTerm.id);
            const firstClass = classRes.data.find((c: ClassOption) => c.id === searchParams.get('classId')) || classRes.data[0];
            if (firstClass) setSelectedClassId(firstClass.id);
            const firstClassSubjects: SubjectOption[] = firstClass?.subjects || [];
            const requestedSubject = firstClassSubjects.find((s) => s.id === searchParams.get('subjectId'));
            if (requestedSubject) setSelectedSubjectId(requestedSubject.id);
            else if (firstClassSubjects.length > 0) setSelectedSubjectId(firstClassSubjects[0].id);
            else if (subjectRes.data.length > 0) setSelectedSubjectId(subjectRes.data[0].id);
            else if (subjectRes.data.length > 0) setSelectedSubjectId(subjectRes.data[0].id);

        } catch (error) {
            console.error('Initial data fetch error:', error);
            setLoadError('Gradebook options could not be loaded. Try refreshing the page.');
            toast.error('Failed to load filters');
        }
    };

    const handleDraftTermChange = async (termId: string) => {
        setDraftTermId(termId);
        setDraftClassId('');
        setDraftSubjectId('');
        if (!termId) {
            setClasses([]);
            return;
        }
        try {
            const response = await api.get('/classes', { params: { academicTermId: termId } });
            setClasses(response.data);
            const firstClass = response.data[0];
            setDraftClassId(firstClass?.id || '');
            setDraftSubjectId(firstClass?.subjects?.[0]?.id || subjects[0]?.id || '');
        } catch (error) {
            console.error('Failed to load gradebook classes for term', error);
            setClasses([]);
        }
    };

    const fetchGradebook = async () => {
        setLoading(true);
        setLoadError(null);
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
            setData(null);
            setLoadError('The selected gradebook could not be loaded. Check your access or try again.');
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
        if (!canEdit) return;
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

            await api.post('/assessments/results/bulk', {
                updates: Object.entries(updatesByAssessment).map(([assessmentId, results]) => ({
                    assessmentId,
                    results,
                })),
            });
            toast.success('Grades saved successfully');
            fetchGradebook(); // Refresh to clear edits and sync

        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save grades');
        } finally {
            setSaving(false);
        }
    };

    const openFilters = () => {
        setDraftClassId(selectedClassId);
        setDraftSubjectId(selectedSubjectId);
        setDraftTermId(selectedTermId);
        setDraftSearchQuery(searchQuery);
        setShowFilters(true);
    };

    const handleDraftClassChange = (classId: string) => {
        const nextClass = classes.find((item) => item.id === classId);
        const nextSubjects = nextClass?.subjects?.length ? nextClass.subjects : subjects;
        setDraftClassId(classId);
        setDraftSubjectId((currentSubjectId) =>
            nextSubjects.some((subject) => subject.id === currentSubjectId)
                ? currentSubjectId
                : nextSubjects[0]?.id || ''
        );
    };

    const resetDraftFilters = () => {
        const defaultClassId = classes[0]?.id || '';
        const defaultClass = classes.find((item) => item.id === defaultClassId);
        const defaultSubjects = defaultClass?.subjects?.length ? defaultClass.subjects : subjects;
        const activeTerm = terms.find((term: any) => term.isActive);

        setDraftSearchQuery('');
        setDraftClassId(defaultClassId);
        setDraftSubjectId(defaultSubjects[0]?.id || '');
        setDraftTermId(activeTerm?.id || terms[0]?.id || '');
    };

    const applyFilters = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!draftClassId || !draftSubjectId || !draftTermId) {
            toast.error('Select a term, class, and subject');
            return;
        }

        const registerChanged = draftClassId !== selectedClassId
            || draftSubjectId !== selectedSubjectId
            || draftTermId !== selectedTermId;
        if (canEdit && registerChanged && editCount > 0) {
            const discard = await confirm({
                title: 'Discard unsaved grade changes?',
                message: `${editCount} unsaved grade change${editCount === 1 ? '' : 's'} will be lost when a different gradebook is loaded.`,
                confirmText: 'Discard changes',
            });
            if (!discard) return;
        }

        setSelectedClassId(draftClassId);
        setSelectedSubjectId(draftSubjectId);
        setSelectedTermId(draftTermId);
        setSearchQuery(draftSearchQuery.trim());
        setShowFilters(false);
    };

    const handleDiscardChanges = async () => {
        if (editCount === 0) return;
        const discard = await confirm({
            title: 'Discard grade changes?',
            message: `Discard ${editCount} unsaved grade change${editCount === 1 ? '' : 's'}?`,
            confirmText: 'Discard changes',
        });
        if (discard) setEdits({});
    };

    // Keyboard navigation between cells (Arrow keys)
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
        const totalRows = filteredStudents.length;
        const totalCols = data?.assessments.length || 0;

        let nextRow = rowIdx;
        let nextCol = colIdx;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            nextRow = Math.min(rowIdx + 1, totalRows - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nextRow = Math.max(rowIdx - 1, 0);
        } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
            if (e.key === 'Tab') e.preventDefault();
            nextCol = colIdx + 1;
            if (nextCol >= totalCols) {
                nextCol = 0;
                nextRow = Math.min(rowIdx + 1, totalRows - 1);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            nextCol = colIdx - 1;
            if (nextCol < 0) {
                nextCol = totalCols - 1;
                nextRow = Math.max(rowIdx - 1, 0);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            nextRow = Math.min(rowIdx + 1, totalRows - 1);
        }

        if (nextRow !== rowIdx || nextCol !== colIdx) {
            // Focus next input
            setTimeout(() => {
                const nextInput = document.querySelector(
                    `input[data-row="${nextRow}"][data-col="${nextCol}"]`
                ) as HTMLInputElement;
                nextInput?.focus();
                nextInput?.select();
            }, 10);
        }
    };

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-[1600px] mx-auto">
            <div className="mb-6 flex justify-end">
                <button
                    type="button"
                    onClick={openFilters}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${activeFilterCount > 0
                        ? 'border-[#1E40AF] bg-blue-50 text-[#1E40AF] dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-[#1E40AF] hover:bg-surface-hover-accent hover:text-[#1E40AF] dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200'
                    }`}
                    aria-haspopup="dialog"
                    aria-expanded={showFilters}
                >
                    <Filter size={18} aria-hidden="true" />
                    Filter
                    {activeFilterCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1E40AF] px-1 text-[10px] text-white">{activeFilterCount}</span>}
                </button>
            </div>

            {!canEdit && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200" role="status">
                    You have read-only access to this gradebook.
                </div>
            )}

            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col min-h-[500px] transition-all duration-200">
                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#64748B] dark:text-gray-400">
                        <div className="w-12 h-12 border-3 border-[#1E40AF] border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="font-medium">Loading gradebook...</p>
                    </div>
                ) : loadError ? (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center" role="alert">
                        <AlertCircle size={48} className="mb-4 text-red-400" aria-hidden="true" />
                        <p className="font-semibold text-red-700 dark:text-red-300">Unable to load gradebook</p>
                        <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{loadError}</p>
                        <button type="button" onClick={fetchGradebook} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">Try again</button>
                    </div>
                ) : !data || data.students.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#64748B] dark:text-gray-400 p-8">
                        <AlertCircle size={48} className="text-gray-300 dark:text-gray-600 mb-4 transition-transform duration-150 hover:scale-110" />
                        <p className="font-medium">No students or data found for this selection.</p>
                        <p className="text-sm mt-2">Try selecting a different class or term</p>
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-[#64748B] dark:text-gray-400">
                        <Search size={44} className="mb-4 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                        <p className="font-semibold text-gray-800 dark:text-gray-100">No matching students</p>
                        <p className="mt-1 max-w-sm text-sm">No student matches “{searchQuery}”. Open Filter to change or clear the search.</p>
                        <button type="button" onClick={() => setSearchQuery('')} className="mt-4 min-h-10 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-surface-hover dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200">Clear search</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto flex-1">
                        <table ref={tableRef} className="w-full text-left border-collapse">
                            <caption className="sr-only">Assessment scores for students in the selected class, subject, and term</caption>
                            <thead className="bg-gradient-to-r from-[#F8FAFC] to-gray-50 dark:from-slate-700 dark:to-slate-700 z-10 sticky top-0 border-b-2 border-[#1E40AF]">
                                <tr>
                                    <th scope="col" className="sticky left-0 bg-gradient-to-r from-[#F8FAFC] to-gray-50 dark:from-slate-700 dark:to-slate-700 px-4 py-4 border-b-2 border-[#1E40AF] font-semibold text-xs text-[#475569] dark:text-gray-300 uppercase tracking-wider w-12 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">#</th>
                                    <th scope="col" className="sticky left-12 bg-gradient-to-r from-[#F8FAFC] to-gray-50 dark:from-slate-700 dark:to-slate-700 px-4 py-4 border-b-2 border-[#1E40AF] font-semibold text-xs text-[#475569] dark:text-gray-300 uppercase tracking-wider min-w-[200px] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student</th>

                                    {data.assessments.map(assessment => (
                                        <th scope="col" key={assessment.id} className="px-4 py-4 border-b-2 border-[#1E40AF] min-w-[120px] text-center">
                                            <div className="text-xs font-bold text-[#1E3A8A] dark:text-white">{assessment.title}</div>
                                            <div className="text-[10px] text-[#64748B] dark:text-gray-400 font-normal mt-1">
                                                Max: {assessment.totalMarks} • Weight: {assessment.weight}%
                                            </div>
                                        </th>
                                    ))}

                                    <th scope="col" className="px-4 py-4 border-b-2 border-[#1E40AF] text-center font-semibold text-xs text-[#475569] dark:text-gray-300 uppercase tracking-wider min-w-[100px] bg-[#1E40AF]/10 dark:bg-blue-900/30">Average</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                                {filteredStudents.map((student, rowIdx) => {
                                    // Calculate quick average based on available results + edits
                                    // This is 'simple' client side calc for display
                                    let totalObtained = 0;

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
                                        <tr key={student.id} className="hover:bg-surface-hover transition-all duration-150 group">
                                            <td className="sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-surface-hover px-4 py-3 text-sm text-[#64748B] dark:text-gray-400 border-r border-gray-100 dark:border-slate-700 z-10 transition-colors duration-150">{rowIdx + 1}</td>
                                            <td className="sticky left-12 bg-white dark:bg-slate-800 group-hover:bg-surface-hover px-4 py-3 border-r border-gray-100 dark:border-slate-700 z-10 transition-colors duration-150">
                                                <div className="text-sm font-semibold text-[#1E3A8A] dark:text-white">{student.firstName} {student.lastName}</div>
                                                <div className="text-xs text-[#94A3B8] dark:text-gray-400 font-mono">{student.admissionNumber}</div>
                                            </td>

                                            {data.assessments.map((assessment, colIdx) => {
                                                const isEdited = `${assessment.id}_${student.id}` in edits;
                                                const score = getScore(student.id, assessment.id);
                                                const percentage = score !== '' && score !== 0 ? ((Number(score) / assessment.totalMarks) * 100).toFixed(1) : '';

                                                return (
                                                    <td key={assessment.id} className="p-0 border-r border-gray-100 dark:border-slate-700 relative group/cell">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={assessment.totalMarks}
                                                            step="0.5"
                                                            value={score}
                                                            data-row={rowIdx}
                                                            data-col={colIdx}
                                                            onChange={(e) => handleScoreChange(student.id, assessment.id, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                                                            disabled={!canEdit}
                                                            className={`w-full h-full min-h-[56px] px-2 text-center text-sm font-medium outline-none
                                                                focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-inset focus-visible:bg-[#1E40AF]/5 dark:focus-visible:bg-blue-900/30
                                                                transition-all duration-100 dark:text-white
                                                                ${isEdited
                                                                    ? 'bg-[#FEF3C7] dark:bg-amber-900/30 text-[#92400E] dark:text-amber-300 font-bold ring-2 ring-[#F59E0B] ring-inset'
                                                                    : 'bg-transparent hover:bg-surface-hover'
                                                                }
                                                            `}
                                                            placeholder="-"
                                                            aria-label={`Score for ${student.firstName} ${student.lastName} in ${assessment.title}`}
                                                        />
                                                        {percentage && (
                                                            <div className="absolute bottom-1 right-1 text-[9px] text-[#64748B] dark:text-gray-500 font-medium opacity-0 group-hover/cell:opacity-100 transition-opacity duration-150 pointer-events-none">
                                                                {percentage}%
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            <td className="px-4 py-3 text-center text-sm font-bold text-[#1E3A8A] dark:text-gray-300 bg-[#1E40AF]/5 dark:bg-blue-900/20 transition-colors duration-150">
                                                {totalObtained > 0 ? `${totalObtained.toFixed(1)}%` : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showFilters && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setShowFilters(false);
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="gradebook-filter-title"
                        className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1E40AF] dark:text-blue-300">Gradebook view</p>
                                <h2 id="gradebook-filter-title" className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Search and filter</h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose the register to load and optionally find a student.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowFilters(false)}
                                className="grid size-10 shrink-0 place-items-center rounded-xl text-gray-500 transition-colors hover:bg-surface-hover hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:text-gray-400 dark:hover:text-white"
                                aria-label="Close filters"
                            >
                                <X size={19} aria-hidden="true" />
                            </button>
                        </div>

                        <form onSubmit={applyFilters}>
                            <div className="space-y-5 p-5 sm:p-6">
                                <div>
                                    <label htmlFor="gradebook-student-search" className="mb-1.5 block text-sm font-bold text-gray-800 dark:text-gray-200">Search students</label>
                                    <div className="relative">
                                        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                        <input
                                            ref={filterSearchInputRef}
                                            id="gradebook-student-search"
                                            type="search"
                                            value={draftSearchQuery}
                                            onChange={(event) => setDraftSearchQuery(event.target.value)}
                                            placeholder="Name or admission number"
                                            className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-11 pr-4 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label htmlFor="gradebook-term-filter" className="mb-1.5 block text-sm font-bold text-gray-800 dark:text-gray-200">Academic term</label>
                                        <select
                                            id="gradebook-term-filter"
                                            value={draftTermId}
                                            onChange={(event) => handleDraftTermChange(event.target.value)}
                                            className="h-12 w-full cursor-pointer rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                                        >
                                            {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="gradebook-class-filter" className="mb-1.5 block text-sm font-bold text-gray-800 dark:text-gray-200">Class</label>
                                        <select
                                            id="gradebook-class-filter"
                                            value={draftClassId}
                                            onChange={(event) => handleDraftClassChange(event.target.value)}
                                            className="h-12 w-full cursor-pointer rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                                        >
                                            {classes.map((classOption) => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="gradebook-subject-filter" className="mb-1.5 block text-sm font-bold text-gray-800 dark:text-gray-200">Subject</label>
                                    <select
                                        id="gradebook-subject-filter"
                                        value={draftSubjectId}
                                        onChange={(event) => setDraftSubjectId(event.target.value)}
                                        className="h-12 w-full cursor-pointer rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                                    >
                                        {draftAvailableSubjects.map((subject) => (
                                            <option key={subject.id} value={subject.id}>{subject.name}{subject.code ? ` (${subject.code})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    type="button"
                                    onClick={resetDraftFilters}
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-gray-600 transition-colors hover:bg-surface-hover hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:text-gray-300 dark:hover:text-white"
                                >
                                    <RotateCcw size={16} aria-hidden="true" /> Reset
                                </button>
                                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                    <button type="button" onClick={() => setShowFilters(false)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] dark:border-slate-600 dark:bg-slate-800 dark:text-gray-200">Cancel</button>
                                    <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
                                        <Check size={17} aria-hidden="true" /> Apply Filters
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {canEdit && <div className="fixed bottom-6 right-6 z-30 flex flex-wrap justify-end gap-2">
                {editCount > 0 && (
                    <button
                        type="button"
                        onClick={handleDiscardChanges}
                        disabled={saving}
                        className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 shadow-lg transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    >
                        <RotateCcw size={18} aria-hidden="true" />
                        Discard
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving || loading || editCount === 0}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full shadow-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium transform active:scale-95"
                >
                    {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={20} />}
                    {saving ? 'Saving...' : `Save ${editCount > 0 ? `(${editCount})` : ''} Changes`}
                </button>
            </div>}

        </div>
    );
};

export default TeacherGradebook;
