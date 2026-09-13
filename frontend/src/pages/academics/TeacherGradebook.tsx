import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Search, Undo2, Users, ClipboardList, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, FormField, Select, StatCard } from '../../components/ui/DesignSystem';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { scoreKey, validateScore, updateScoreEdit, studentProgress, saveScoreEdits, type GradebookAssessment, type GradebookResult, type ScoreEdit } from '../../utils/gradebook';

interface Student { id: string; firstName: string; lastName: string; admissionNumber: string }
interface SubjectOption { id: string; name: string; code?: string }
interface ClassOption { id: string; name: string; subjects?: SubjectOption[] }
interface TermOption { id: string; name: string; isActive: boolean }
interface GradebookData { students: Student[]; assessments: GradebookAssessment[]; results: GradebookResult[] }
export interface GradebookEditState { dirty: boolean; saving: boolean }

const TeacherGradebook = ({ embedded = false, onEditStateChange }: {
  embedded?: boolean; onEditStateChange?: (state: GradebookEditState) => void;
}) => {
  const { user } = useAuth();
  const { confirm } = useAppDialog();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER';
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [selection, setSelection] = useState({ classId: '', subjectId: '', termId: '' });
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(false);
  const [initialRetry, setInitialRetry] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [edits, setEdits] = useState<Record<string, ScoreEdit>>({});
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const savingRef = useRef(false);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const dirtyCount = Object.keys(edits).length;
  const dirty = dirtyCount > 0;
  const filtersLocked = initialLoading || dirty || saving;
  const selectedClass = classes.find(item => item.id === selection.classId);
  const availableSubjects = selectedClass?.subjects?.length ? selectedClass.subjects : subjects;
  const selectedSubject = availableSubjects.find(item => item.id === selection.subjectId);
  const Heading = embedded ? 'h2' : 'h1';

  useEffect(() => {
    const controller = new AbortController();
    setInitialLoading(true);
    setInitialError(false);
    const load = async () => {
      try {
        const [classRes, subjectRes, termRes] = await Promise.all([
          api.get<ClassOption[]>('/classes', { signal: controller.signal }),
          api.get<SubjectOption[]>('/subjects', { signal: controller.signal }),
          api.get<TermOption[]>('/academic-terms', { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        setClasses(classRes.data); setSubjects(subjectRes.data); setTerms(termRes.data);
        const firstClass = classRes.data[0];
        setSelection({
          classId: firstClass?.id || '',
          subjectId: firstClass?.subjects?.[0]?.id || subjectRes.data[0]?.id || '',
          termId: (termRes.data.find(term => term.isActive) || termRes.data[0])?.id || '',
        });
      } catch {
        if (!controller.signal.aborted) setInitialError(true);
      } finally {
        if (!controller.signal.aborted) setInitialLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [initialRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setLoadError(false); setSaveError(''); setEdits({});
    if (!selection.classId || !selection.subjectId || !selection.termId) { setLoading(false); return; }
    setLoading(true);
    const load = async () => {
      try {
        const response = await api.get<GradebookData>('/assessments/gradebook', { params: selection, signal: controller.signal });
        if (!controller.signal.aborted) setData(response.data);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [selection, reload]);

  useEffect(() => { onEditStateChange?.({ dirty, saving }); }, [dirty, saving, onEditStateChange]);
  useEffect(() => () => onEditStateChange?.({ dirty: false, saving: false }), [onEditStateChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const savedScores = useMemo(() => new Map((data?.results || []).map(result =>
    [scoreKey(result.studentId, result.assessmentId), String(result.score)])), [data]);
  const savedScore = (studentId: string, assessmentId: string) => savedScores.get(scoreKey(studentId, assessmentId)) ?? '';
  const getScore = (studentId: string, assessmentId: string) => edits[scoreKey(studentId, assessmentId)]?.value ?? savedScore(studentId, assessmentId);
  const errors = Object.fromEntries(Object.entries(edits).flatMap(([key, edit]) => {
    const assessment = data?.assessments.find(item => item.id === edit.assessmentId);
    const error = validateScore(edit.value, assessment?.totalMarks ?? 0);
    return error ? [[key, error]] : [];
  }));
  const invalidCount = Object.keys(errors).length;
  const progress = new Map((data?.students || []).map(student => [student.id,
    studentProgress(data?.assessments || [], assessmentId => getScore(student.id, assessmentId))]));
  const recorded = [...progress.values()].reduce((total, item) => total + item.recorded, 0);
  const totalCells = (data?.students.length || 0) * (data?.assessments.length || 0);
  const query = search.trim().toLowerCase();
  // Keep incomplete rows visible while entering marks; this filter updates after saving.
  const visibleStudents = (data?.students || []).filter(student =>
    `${student.firstName} ${student.lastName} ${student.admissionNumber}`.toLowerCase().includes(query) &&
    (!missingOnly || data!.assessments.some(assessment => validateScore(savedScore(student.id, assessment.id), assessment.totalMarks))),
  );

  const discardChanges = async () => {
    if (savingRef.current || !await confirm({ title: 'Discard unsaved scores?', message: `Discard ${dirtyCount} unsaved score changes and restore the saved marks?`, confirmText: 'Discard changes', destructive: true })) return;
    setEdits({}); setSaveError('');
  };

  const handleSave = async () => {
    if (!canEdit || !data || !dirty || invalidCount || savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError('');
    const snapshot = edits;
    try {
      const result = await saveScoreEdits(snapshot, data.assessments, (assessmentId, results) =>
        api.post('/assessments/results', { assessmentId, results }));
      const saved = new Set(result.savedKeys);
      setData(current => current ? { ...current,
        results: [...current.results.filter(item => !saved.has(scoreKey(item.studentId, item.assessmentId))),
          ...result.savedKeys.map(key => ({ assessmentId: snapshot[key].assessmentId, studentId: snapshot[key].studentId, score: Number(snapshot[key].value) }))],
      } : current);
      setEdits(current => Object.fromEntries(Object.entries(current).filter(([key]) => !saved.has(key))));
      if (result.failedAssessments) setSaveError(`${result.savedKeys.length} scores saved. Changes for ${result.failedAssessments} assessments could not be saved. Your remaining edits are retained; try Save changes again.`);
      else toast.success(`${result.savedKeys.length} scores saved`);
    } catch {
      setSaveError('Unable to save scores. Your edits are retained. Please try again.');
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };

  return <div className="ds-page">
    <div className="ds-page-header">
      <div><Heading className={embedded ? 'text-xl font-bold tracking-tight' : 'ds-page-title'}>Gradebook</Heading>
        <p className="ds-page-subtitle">Review class progress and enter assessment scores in one place.</p></div>
      <div className="ds-actions">
        {dirty && <Button variant="outline" onClick={discardChanges} disabled={saving}><Undo2 size={16} aria-hidden="true" />Discard changes</Button>}
        {canEdit ? <Button onClick={handleSave} loading={saving} disabled={!dirty || loading || invalidCount > 0}>
          {!saving && <Save size={16} aria-hidden="true" />}Save changes{dirty ? ` (${dirtyCount})` : ''}
        </Button> : <Badge>View only</Badge>}
      </div>
    </div>

    {initialError ? <Alert tone="error"><p>Unable to load gradebook filters.</p><Button variant="outline" className="mt-3" onClick={() => setInitialRetry(value => value + 1)}>Try again</Button></Alert> :
      <div className="ds-card space-y-3">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Academic term" htmlFor="gradebook-term"><Select id="gradebook-term" value={selection.termId} disabled={filtersLocked} onChange={event => setSelection({ ...selection, termId: event.target.value })}>
            {!terms.length && <option value="">{initialLoading ? 'Loading terms...' : 'No terms available'}</option>}
            {terms.map(term => <option key={term.id} value={term.id}>{term.name}{term.isActive ? ' (active)' : ''}</option>)}
          </Select></FormField>
          <FormField label="Class" htmlFor="gradebook-class"><Select id="gradebook-class" value={selection.classId} disabled={filtersLocked} onChange={event => {
            const nextClass = classes.find(item => item.id === event.target.value);
            const nextSubjects = nextClass?.subjects?.length ? nextClass.subjects : subjects;
            setSelection({ ...selection, classId: event.target.value, subjectId: nextSubjects.some(item => item.id === selection.subjectId) ? selection.subjectId : nextSubjects[0]?.id || '' });
          }}>
            {!classes.length && <option value="">{initialLoading ? 'Loading classes...' : 'No classes available'}</option>}
            {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select></FormField>
          <FormField label="Subject" htmlFor="gradebook-subject"><Select id="gradebook-subject" value={selection.subjectId} disabled={filtersLocked} onChange={event => setSelection({ ...selection, subjectId: event.target.value })}>
            {!availableSubjects.length && <option value="">{initialLoading ? 'Loading subjects...' : 'No subjects available'}</option>}
            {availableSubjects.map(item => <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ''}</option>)}
          </Select></FormField>
        </div>
        {dirty && <p className="ds-helper">Save or discard your changes before switching class, subject, or term.</p>}
      </div>}

    {saveError && <Alert tone="error">{saveError}</Alert>}
    {invalidCount > 0 && <Alert tone="error">Correct {invalidCount} highlighted {invalidCount === 1 ? 'score' : 'scores'} before saving. Scores must be between zero and the assessment maximum.</Alert>}

    {data && !loading && <section aria-label="Gradebook summary" className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Students" value={data.students.length} icon={Users} detail={selectedClass?.name} />
      <StatCard label="Assessments" value={data.assessments.length} icon={ClipboardList} detail={selectedSubject?.name} />
      <StatCard label="Scores entered" value={totalCells ? `${Math.round(recorded / totalCells * 100)}%` : '?'} icon={CheckCircle2} tone={totalCells > 0 && recorded === totalCells ? 'success' : 'info'} detail={`${recorded} of ${totalCells} scores${dirty ? ' ? includes unsaved edits' : ''}`} />
    </section>}

    <section className="ds-surface overflow-hidden" aria-label="Assessment scores" aria-busy={loading || initialLoading}>
      {initialLoading || loading ? <div role="status" className="ds-empty flex items-center justify-center gap-3"><Loader2 size={20} className="animate-spin" aria-hidden="true" />Loading gradebook...</div> : loadError ?
        <EmptyState title="Unable to load scores" description="Please retry. No scores from a previous selection are shown." action={<Button variant="outline" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Try again</Button>} /> : !data ?
        <EmptyState title={initialError ? 'Gradebook unavailable' : 'Select a class, subject, and term'} description={initialError ? 'Retry loading the filters above to continue.' : 'All three selections are needed to open the gradebook.'} /> : !data.students.length ?
        <EmptyState title="No students in this class" description="Choose another class or add students through the Students page." /> : !data.assessments.length ?
        <EmptyState title="No assessments for this selection" description="Choose another subject or term. Scores can be entered once an assessment has been created for this class." /> : <>
          <div className="ds-card-header">
            <div className="relative w-full sm:max-w-sm"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="search" className="ds-input pl-10" aria-label="Search students" placeholder="Search name or admission number..." value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" className="ds-choice" checked={missingOnly} onChange={event => setMissingOnly(event.target.checked)} disabled={saving} />Missing saved scores only</label>
          </div>
          {visibleStudents.length === 0 ? <EmptyState title="No matching students" description="Try a different name or clear the missing scores filter." action={<Button variant="outline" onClick={() => { setSearch(''); setMissingOnly(false); }}>Clear search and filter</Button>} /> :
            <div className="gradebook-scroll" role="region" aria-label="Student assessment score matrix" tabIndex={0}>
              <table className="gradebook-table">
                <thead><tr><th scope="col" className="gradebook-student">Student</th>
                  {data.assessments.map(assessment => <th scope="col" key={assessment.id}><span className="block font-semibold text-ink">{assessment.title}</span><span className="mt-1 block text-xs font-normal">Out of {assessment.totalMarks} ? Weight {assessment.weight}%</span></th>)}
                  <th scope="col">Weighted average<span className="mt-1 block text-xs font-normal">Entered scores only</span></th><th scope="col">Completion</th>
                </tr></thead>
                <tbody>{visibleStudents.map((student, rowIndex) => {
                  const studentStats = progress.get(student.id)!;
                  return <tr key={student.id}>
                    <th scope="row" className="gradebook-student"><span className="block break-words font-semibold">{student.firstName} {student.lastName}</span><span className="mt-1 block text-xs font-normal text-muted">{student.admissionNumber}</span></th>
                    {data.assessments.map((assessment, columnIndex) => {
                      const key = scoreKey(student.id, assessment.id);
                      const value = getScore(student.id, assessment.id);
                      const error = errors[key];
                      const errorId = `gradebook-error-${rowIndex}-${columnIndex}`;
                      return <td key={assessment.id} className="gradebook-score-cell">
                        {canEdit ? <><input type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
                          ref={node => { if (node) inputRefs.current.set(key, node); else inputRefs.current.delete(key); }}
                          aria-label={`${student.firstName} ${student.lastName} (${student.admissionNumber}), ${assessment.title}, out of ${assessment.totalMarks}${edits[key] ? ', unsaved' : ''}`}
                          aria-invalid={Boolean(error)} aria-describedby={error ? errorId : 'gradebook-entry-help'}
                          disabled={saving} value={value} placeholder="?" className={`gradebook-score ${edits[key] ? 'gradebook-score-edited' : ''}`}
                          onChange={event => { setSaveError(''); setEdits(current => updateScoreEdit(current, student.id, assessment.id, event.target.value, savedScore(student.id, assessment.id))); }}
                          onKeyDown={event => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            const nextStudent = visibleStudents[rowIndex + (event.shiftKey ? -1 : 1)];
                            if (nextStudent) { const input = inputRefs.current.get(scoreKey(nextStudent.id, assessment.id)); input?.focus(); input?.select(); }
                          }} />
                          {error && <p id={errorId} className="ds-field-error px-2 pb-2 text-xs">{error}</p>}
                        </> : <span className="block px-3 py-4 text-center tabular-nums">{value || '?'}</span>}
                      </td>;
                    })}
                    <td className="text-center font-semibold tabular-nums">{studentStats.average === null ? '?' : `${studentStats.average.toFixed(1)}%`}</td>
                    <td className="text-center"><Badge tone={studentStats.recorded === data.assessments.length ? 'success' : 'neutral'}>{studentStats.recorded} / {data.assessments.length}</Badge></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          <div className="ds-card-header border-b-0 border-t text-sm text-muted">
            <p>Showing {visibleStudents.length} of {data.students.length} students</p>
            <p role="status" aria-live="polite">{saving ? 'Saving scores...' : dirty ? `${dirtyCount} unsaved changes` : 'No unsaved changes'}</p>
          </div>
        </>}
    </section>
    <div className="space-y-1">
      {canEdit && <p id="gradebook-entry-help" className="ds-helper text-xs">Tab moves across scores. Enter moves down; Shift + Enter moves up. Highlighted cells have unsaved changes. Save before leaving this page.</p>}
      <p className="ds-helper text-xs">Weighted averages use entered scores and their assessment weights. Missing scores are excluded; zero is a recorded score. These are progress averages, not final report grades.</p>
    </div>
  </div>;
};

export default TeacherGradebook;
