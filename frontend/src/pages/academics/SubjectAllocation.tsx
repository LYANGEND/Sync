import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Save, User, BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/ui/DesignSystem';

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
        <div className="ds-page">
            <PageHeader title="Subject Teacher Allocation" description="Assign teachers to subjects for each class." />

            <div className="ds-card ds-field" aria-busy={loading}>
                <label htmlFor="allocation-class" className="ds-label">Select Class</label>
                <select
                    id="allocation-class"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="ds-select md:w-1/3"
                >
                    <option value="">-- Choose a Class --</option>
                    {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                {loading && <p role="status" className="ds-helper">Loading classes and teachers...</p>}
            </div>

            {selectedClass && (
                <div className="ds-surface overflow-hidden">
                    <div className="overflow-x-auto" role="region" aria-label={`Subject teacher allocation for ${selectedClass.name}`} tabIndex={0}>
                        <table className="ds-table">
                            <thead>
                                <tr>
                                    <th scope="col">Subject Name</th>
                                    <th scope="col">Code</th>
                                    <th scope="col">Assigned Teacher</th>
                                    <th scope="col" className="text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedClass.subjects && selectedClass.subjects.length > 0 ? (
                                    selectedClass.subjects.map((subject) => (
                                        <tr key={subject.id}>
                                            <td className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
                                                    {subject.name}
                                                </div>
                                            </td>
                                            <td><span className="ds-badge ds-badge-neutral font-mono">{subject.code}</span></td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <User size={16} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
                                                    <select
                                                        aria-label={`Assigned teacher for ${subject.name} (${subject.code})`}
                                                        value={assignments[subject.id] || ''}
                                                        onChange={(e) => handleAssignmentChange(subject.id, e.target.value)}
                                                        className="ds-select min-w-[200px]"
                                                    >
                                                        <option value="">Select Teacher...</option>
                                                        {teachers.map(t => (
                                                            <option key={t.id} value={t.id}>{t.fullName}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    onClick={() => saveAssignment(subject.id)}
                                                    disabled={saving[subject.id]}
                                                    aria-label={`Save teacher assignment for ${subject.name}`}
                                                    aria-busy={saving[subject.id] || false}
                                                    className="ds-button-primary"
                                                >
                                                    {saving[subject.id] ? (
                                                        'Saving...'
                                                    ) : (
                                                        <>
                                                            <Save size={16} aria-hidden="true" />
                                                            Save
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="text-center text-[var(--text-secondary)]">
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
