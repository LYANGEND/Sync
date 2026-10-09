import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { FileText, AlertCircle, CheckCircle, Printer, FileSpreadsheet, Mail, Loader2, X } from 'lucide-react';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { reportCardService, StudentReport } from '../../services/reportCardService';
import api from '../../utils/api';
import StudentReportCard from '../../components/academics/StudentReportCard';
import ClassBroadsheet from '../../components/academics/ClassBroadsheet';
import aiIntelligenceService, { ParentLetterResponse } from '../../services/aiIntelligenceService';
import { useAuth } from '../../context/AuthContext';
import ReportLifecyclePanel from '../../components/academics/ReportLifecyclePanel';

interface Class { id: string; name: string }
interface Student { id: string; firstName: string; lastName: string }
interface Term {
  id: string;
  name: string;
  startDate: string;
  academicYear?: { name: string } | null;
  isActive?: boolean;
  status?: 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
}
type ReportMode = 'student' | 'class';
type OperationKind = 'student' | 'class' | 'print' | 'excel' | 'csv' | 'letter' | 'save' | 'refresh';
interface Operation { key: string; kind: OperationKind }
interface Lookup<T> { items: T[]; loading: boolean; error: string | null; retry: () => void }

// The shared DesignSystem reference is not present. Use the existing primary
// theme token and the surrounding academic modules' white/slate surfaces.
const controlStyle = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800 dark:disabled:text-slate-400';
const secondaryStyle = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors motion-reduce:transition-none hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
const hintStyle = 'mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300';
const operationLabels: Record<OperationKind, string> = {
  student: 'Loading or generating student report…', class: 'Preparing class results…', print: 'Preparing class reports for print…',
  excel: 'Preparing Excel export…', csv: 'Preparing CSV export…', letter: 'Writing parent letter…', save: 'Saving remarks…', refresh: 'Refreshing report…',
};
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const termLabel = (term: Term) => `${term.name} · ${term.academicYear?.name || new Date(term.startDate).getFullYear()}`;

const friendlyError = (error: unknown, subject: string): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return `Sign in again to ${subject}.`;
    if (status === 403) return `You do not have permission to ${subject}. Ask your school administrator for access.`;
    if (!error.response) return `Could not connect to ${subject}. Check your connection and try again.`;
    if (status && status >= 500) return `The server could not ${subject}. Try again shortly; if this continues, contact your administrator.`;
    const message = error.response?.data?.error || error.response?.data?.message;
    if (typeof message === 'string') return message;
  }
  return `Could not ${subject}. Please try again.`;
};
const isClass = (item: any): item is Class => Boolean(item && typeof item.id === 'string' && item.id && typeof item.name === 'string');
const isStudent = (item: any): item is Student => Boolean(item && typeof item.id === 'string' && item.id && typeof item.firstName === 'string' && typeof item.lastName === 'string');
const isTerm = (item: any): item is Term => Boolean(item && typeof item.id === 'string' && item.id && typeof item.name === 'string'
  && typeof item.startDate === 'string' && Number.isFinite(Date.parse(item.startDate))
  && (item.status === undefined || ['DRAFT', 'ACTIVE', 'CLOSING', 'CLOSED'].includes(item.status))
  && (item.academicYear == null || typeof item.academicYear.name === 'string'));

// Independent errors/retries, scoped data, and abort/alive checks prevent older
// responses (including StrictMode/unmount responses) replacing a newer lookup.
function useReportLookup<T extends { id: string }>(path: string | null, termId: string, validate: (item: any) => item is T, subject: string): Lookup<T> {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([path, termId, attempt]);
  const [state, setState] = useState<{ key: string; items: T[]; loading: boolean; error: string | null }>({ key: '', items: [], loading: false, error: null });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let alive = true;
    setState({ key, items: [], loading: true, error: null });
    void api.get(path, { signal: controller.signal, params: termId ? { academicTermId: termId } : undefined })
      .then(response => {
        if (!alive) return;
        const items: unknown = response.data;
        if (!Array.isArray(items) || !items.every(validate) || new Set(items.map(item => item.id)).size !== items.length) {
          setState({ key, items: [], loading: false, error: `The server returned an unexpected list. Retry to ${subject}; if this continues, contact your administrator.` });
          return;
        }
        setState({ key, items, loading: false, error: null });
      })
      .catch(error => {
        if (alive && !axios.isCancel(error)) setState({ key, items: [], loading: false, error: friendlyError(error, subject) });
      });
    return () => { alive = false; controller.abort(); };
  }, [key, path, termId, validate, subject]);
  return {
    items: path && state.key === key ? state.items : [],
    loading: Boolean(path && (state.key !== key || state.loading)),
    error: path && state.key === key ? state.error : null,
    retry: () => setAttempt(value => value + 1),
  };
}

const ReportCards: React.FC = () => {
  const { user } = useAuth();
  const canManageReports = user?.role === 'SUPER_ADMIN' || user?.role === 'TEACHER';
  const [searchParams, setSearchParams] = useSearchParams();
  const termLookup = useReportLookup<Term>('/academic-terms', '', isTerm, 'load academic terms');
  const terms = termLookup.items;
  const requestedTerm = searchParams.get('reportTerm');
  const requestedClass = searchParams.get('reportClass');
  const requestedStudent = searchParams.get('reportStudent');
  const requestedMode = searchParams.get('reportMode');
  const mode: ReportMode = requestedMode === 'class' ? 'class' : 'student';
  const duplicateParams = ['reportTerm', 'reportClass', 'reportStudent', 'reportMode'].some(key => searchParams.getAll(key).length > 1);
  const modeInvalid = requestedMode !== null && requestedMode !== 'student' && requestedMode !== 'class';
  // Status is authoritative. No first/nearest fallback or replacement of an
  // explicit URL term, including an explicitly empty one.
  const activeTerms = terms.filter(term => term.status === 'ACTIVE');
  const selectedTerm = requestedTerm === null ? (activeTerms.length === 1 ? activeTerms[0].id : '') : requestedTerm;
  const term = !duplicateParams ? terms.find(item => item.id === selectedTerm) : undefined;
  const classLookup = useReportLookup<Class>(term && !termLookup.loading && !termLookup.error ? '/classes' : null, term?.id || '', isClass, 'load classes for this term');
  const classes = classLookup.items;
  const selectedClass = requestedClass || '';
  const classOption = classes.find(item => item.id === selectedClass);
  const studentLookup = useReportLookup<Student>(mode === 'student' && !modeInvalid && classOption && !classLookup.loading && !classLookup.error
    ? `/classes/${encodeURIComponent(classOption.id)}/students` : null, term?.id || '', isStudent, 'load students for this class');
  const students = studentLookup.items;
  const selectedStudent = requestedStudent || '';
  const student = students.find(item => item.id === selectedStudent);
  const [studentSearch, setStudentSearch] = useState('');
  const normalizedSearch = studentSearch.trim().toLowerCase();
  const matchesSearch = (item: Student) => `${item.firstName} ${item.lastName}`.toLowerCase().includes(normalizedSearch);
  // Searching must not leave a selected ID without a visible option.
  const visibleStudents = students.filter(item => item.id === selectedStudent || matchesSearch(item));
  const matchingStudents = students.filter(matchesSearch);
  const lookupLoading = termLookup.loading || classLookup.loading || (mode === 'student' && studentLookup.loading);
  const lookupError = termLookup.error || classLookup.error || (mode === 'student' ? studentLookup.error : null);

  let selectionError: string | null = null;
  if (duplicateParams) selectionError = 'This link has duplicate report selections. Choose a term below to reset the report selection.';
  else if (modeInvalid) selectionError = 'This link has an unknown report mode. Choose Student report or Class results below.';
  else if (!termLookup.loading && !termLookup.error && requestedTerm !== null && !term) selectionError = 'The term in this link is unavailable. Choose an academic term below; no replacement has been selected.';
  else if (!termLookup.loading && !termLookup.error && !term && (requestedClass !== null || requestedStudent !== null)) selectionError = 'Choose a valid academic term before using the class or student in this link.';
  else if (term && !classLookup.loading && !classLookup.error && requestedClass !== null && !classOption) selectionError = 'The class in this link does not belong to the selected term or is unavailable to you. Choose a class below.';
  else if (term && !classLookup.loading && !classLookup.error && !classOption && requestedStudent !== null) selectionError = 'Choose a class before using the student in this link.';
  else if (mode === 'class' && requestedStudent !== null) selectionError = 'This class-results link includes a student selection. Choose Class results below to clear it, or choose Student report.';
  else if (mode === 'student' && classOption && !studentLookup.loading && !studentLookup.error && requestedStudent !== null && !student) selectionError = 'The student in this link is not in this term and class or is unavailable to you. Choose a student below.';
  const validClassSelection = Boolean(term && classOption && !lookupLoading && !lookupError && !selectionError);
  const validSelection = validClassSelection && (mode === 'class' || Boolean(student));
  const mayGenerate = canManageReports && (term?.status === 'ACTIVE' || term?.status === 'CLOSING');

  // Disabled controls cannot stop browser Back. Guard every awaited operation
  // before any follow-up request, export, print, or state update.
  const contextKey = JSON.stringify([selectedTerm, requestedTerm, requestedClass, requestedStudent, requestedMode, duplicateParams, user?.id, user?.role]);
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const mountedRef = useRef(false);
  const operationRef = useRef<Operation | null>(null);
  const pendingRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const letterOpenerRef = useRef<HTMLElement | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const busy = operation?.key === contextKey;
  const [resultKey, setResultKey] = useState('');
  const [report, setReport] = useState<StudentReport | null>(null);
  const currentReport = resultKey === contextKey && validSelection && mode === 'student' ? report : null;
  const [classReports, setClassReports] = useState<StudentReport[]>([]);
  const [printingAll, setPrintingAll] = useState(false);
  const [showBroadsheet, setShowBroadsheet] = useState(false);
  const [teacherRemark, setTeacherRemark] = useState('');
  const [principalRemark, setPrincipalRemark] = useState('');
  const [parentLetter, setParentLetter] = useState<ParentLetterResponse | null>(null);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [notice, setNotice] = useState<{ key: string; error?: string; success?: string } | null>(null);
  const error = notice?.key === contextKey ? notice.error : null;
  const success = notice?.key === contextKey ? notice.success : null;
  const reportRef = useRef<HTMLDivElement>(null);
  const letterDialogRef = useRef<HTMLDialogElement>(null);
  const exportDetailsRef = useRef<HTMLDetailsElement>(null);
  const savingRemarks = busy && operation?.kind === 'save';
  const generatingLetter = busy && operation?.kind === 'letter';
  const actionsDisabled = busy || !validSelection;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; operationRef.current = null; };
  }, []);

  useEffect(() => {
    setReport(null);
    setClassReports([]);
    setParentLetter(null);
    setShowLetterModal(false);
    setShowBroadsheet(false);
    setPrintingAll(false);
    setTeacherRemark('');
    setPrincipalRemark('');
    setStudentSearch('');
    setNotice(null);
    setOperation(null);
    operationRef.current = null;
    pendingRefreshRef.current = null;
    if (exportDetailsRef.current) exportDetailsRef.current.open = false;
  }, [contextKey]);

  useEffect(() => {
    if (currentReport) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Instant also overrides the app's global CSS smooth scrolling.
      reportRef.current?.scrollIntoView({ behavior: reducedMotion ? 'instant' as ScrollBehavior : 'smooth', block: 'start' });
      setTeacherRemark(currentReport.classTeacherRemark || '');
      setPrincipalRemark(currentReport.principalRemark || '');
    }
  }, [currentReport]);

  useEffect(() => {
    const dialog = letterDialogRef.current;
    if (!showLetterModal || !parentLetter || resultKey !== contextKey || !dialog) return;
    try {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('[aria-label="Close parent letter"]')?.focus();
    } catch {
      setShowLetterModal(false);
      setNotice({ key: contextKey, error: 'The letter preview could not open. Use a browser with native dialog support and try again.' });
      return;
    }
    return () => {
      dialog.close();
      if (letterOpenerRef.current?.isConnected) letterOpenerRef.current.focus();
    };
  }, [showLetterModal, parentLetter, resultKey, contextKey]);

  const updateSelection = (values: Partial<Record<'reportTerm' | 'reportClass' | 'reportStudent' | 'reportMode', string | null>>) => {
    if (busy) return;
    // Only user changes write history. Restore/refresh only loads lookups.
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (!next.has('reportTerm') && term) next.set('reportTerm', term.id);
      Object.entries(values).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
      return next;
    });
  };
  const beginOperation = (kind: OperationKind) => {
    if (contextRef.current !== contextKey || operationRef.current?.key === contextKey || !validSelection) return null;
    const token: Operation = { key: contextKey, kind };
    operationRef.current = token;
    setOperation(token);
    setNotice(null);
    return token;
  };
  const isCurrent = (token: Operation) => mountedRef.current && contextRef.current === token.key && operationRef.current === token;
  const finishOperation = (token: Operation) => {
    if (!isCurrent(token)) return;
    operationRef.current = null;
    setOperation(null);
    const pendingRefresh = pendingRefreshRef.current;
    pendingRefreshRef.current = null;
    if (pendingRefresh) void pendingRefresh();
  };
  const showOperationError = (token: Operation, err: unknown, subject: string) => {
    if (isCurrent(token)) setNotice({ key: token.key, error: friendlyError(err, subject) });
  };

  useEffect(() => {
    if (!printingAll || resultKey !== contextKey || !validClassSelection) return;
    const token = operationRef.current;
    if (!token || token.kind !== 'print') return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (!isCurrent(token)) return;
        try { window.print(); }
        catch (err) { showOperationError(token, err, 'print class reports'); }
        finally { if (isCurrent(token)) { setPrintingAll(false); finishOperation(token); } }
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [printingAll, resultKey, contextKey, validClassSelection]);

  const handleSaveRemarks = async () => {
    if (!currentReport || !mayGenerate || currentReport.status !== 'DRAFT') return;
    const token = beginOperation('save');
    if (!token) return;
    try {
      await reportCardService.updateReportRemarks(currentReport.studentId, currentReport.termId, {
        classTeacherRemark: teacherRemark,
        ...(user?.role === 'SUPER_ADMIN' ? { principalRemark } : {}),
      });
      if (!isCurrent(token)) return;
      setNotice({ key: token.key, success: 'Remarks updated successfully.' });
      setReport(prev => prev ? { ...prev, classTeacherRemark: teacherRemark, ...(user?.role === 'SUPER_ADMIN' ? { principalRemark } : {}) } : null);
    } catch (err) { showOperationError(token, err, 'save remarks'); }
    finally { finishOperation(token); }
  };

  const validateStudentReport = (data: StudentReport) => {
    if (!data || data.studentId !== selectedStudent || data.termId !== selectedTerm || !Array.isArray(data.results)
      || !['DRAFT', 'FINALIZED', 'PUBLISHED'].includes(data.status)) throw new Error('Unexpected report context');
  };
  const handleGenerateReport = async () => {
    if (mode !== 'student' || !student || !term) return;
    const token = beginOperation('student');
    if (!token) return;
    setReport(null);
    setParentLetter(null);
    setShowLetterModal(false);
    try {
      let generated = false;
      let data: StudentReport | null = null;
      try { data = await reportCardService.getStudentReport(student.id, term.id); }
      catch (err) { if (!axios.isAxiosError(err) || err.response?.status !== 404) throw err; }
      if (!isCurrent(token)) return;
      if (data) validateStudentReport(data);
      if (mayGenerate && (!data || data.status === 'DRAFT')) {
        data = await reportCardService.generateStudentReport(student.id, term.id);
        generated = true;
      }
      if (!isCurrent(token)) return;
      if (!data) {
        setNotice({ key: token.key, error: term.status === 'CLOSED'
          ? 'No existing report is available for this student in the closed term. Missing reports cannot be generated here; contact your administrator.'
          : 'No existing report is available for this student. A teacher or administrator can generate it when the term is active or closing.' });
        return;
      }
      validateStudentReport(data);
      setResultKey(token.key);
      setReport(data);
      setNotice({ key: token.key, success: generated ? 'Report generated successfully.' : 'Report loaded successfully.' });
    } catch (err) { showOperationError(token, err, 'load or generate the student report'); }
    finally { finishOperation(token); }
  };

  const refreshSelectedReport = async () => {
    if (contextRef.current !== contextKey || !term || !validClassSelection) return;
    // Lifecycle work belongs to the existing panel. If its callback arrives
    // during a page operation, reload afterward rather than losing the update.
    if (operationRef.current?.key === contextKey) {
      pendingRefreshRef.current = refreshSelectedReport;
      return;
    }
    if (mode === 'student' && !student) return;
    const token = beginOperation('refresh');
    if (!token) return;
    try {
      if (mode === 'class') {
        const reports = await loadClassReports(token, false);
        if (isCurrent(token) && !reports) {
          setClassReports([]);
          setShowBroadsheet(false);
        }
        return;
      }
      if (!student) return;
      const data = await reportCardService.getStudentReport(student.id, term.id);
      if (!isCurrent(token)) return;
      validateStudentReport(data);
      setResultKey(token.key);
      setReport(data);
      setParentLetter(null);
    } catch (err) {
      if (isCurrent(token)) {
        setReport(null);
        setClassReports([]);
        setShowBroadsheet(false);
      }
      showOperationError(token, err, 'refresh reports');
    } finally { finishOperation(token); }
  };

  const loadClassReports = async (token: Operation, allowGeneration = true) => {
    let reports = await reportCardService.getClassReports(selectedClass, selectedTerm);
    if (!isCurrent(token)) return null;
    const validateReports = (items: StudentReport[]) => {
      if (!Array.isArray(items) || !items.every(item => item && item.termId === selectedTerm && Array.isArray(item.results)
        && ['DRAFT', 'FINALIZED', 'PUBLISHED'].includes(item.status))) throw new Error('Unexpected class report list');
    };
    validateReports(reports);
    // Keep the existing all-draft guard, including empty writable classes.
    // Never regenerate a class containing a finalized/published report.
    if (allowGeneration && mayGenerate && reports.every(item => item.status === 'DRAFT')) {
      await reportCardService.generateClassReports(selectedClass, selectedTerm);
      if (!isCurrent(token)) return null;
      reports = await reportCardService.getClassReports(selectedClass, selectedTerm);
      if (!isCurrent(token)) return null;
      validateReports(reports);
    }
    if (reports.length === 0) {
      setNotice({ key: token.key, error: term?.status === 'CLOSED'
        ? 'No existing class reports are available in this closed term. Missing drafts cannot be generated here; contact your administrator.'
        : 'No class reports are available. Check this term’s enrollments and report setup with your administrator.' });
      return null;
    }
    setResultKey(token.key);
    setClassReports(reports);
    return reports;
  };

  const handleExport = async (type: 'PRINT' | 'EXCEL' | 'CSV') => {
    if (mode !== 'class' || !validClassSelection || !term || !classOption) return;
    const token = beginOperation(type === 'PRINT' ? 'print' : type === 'EXCEL' ? 'excel' : 'csv');
    if (!token) return;
    let printStarted = false;
    try {
      const reports = await loadClassReports(token);
      if (!reports || !isCurrent(token)) return;
      if (type === 'PRINT') {
        setShowBroadsheet(false);
        printStarted = true;
        setPrintingAll(true);
      } else if (type === 'EXCEL') {
        exportToExcel(reports, classOption.name, termLabel(term));
        setNotice({ key: token.key, success: 'Excel exported successfully.' });
      } else {
        exportToCSV(reports, classOption.name, termLabel(term));
        setNotice({ key: token.key, success: 'CSV exported successfully.' });
      }
    } catch (err) { showOperationError(token, err, 'export class reports'); }
    finally {
      if (isCurrent(token) && exportDetailsRef.current) exportDetailsRef.current.open = false;
      if (!printStarted) finishOperation(token);
    }
  };

  const handleGenerateParentLetter = async () => {
    if (!currentReport || !canManageReports || !student || !term) return;
    letterOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = beginOperation('letter');
    if (!token) return;
    try {
      const letter = await aiIntelligenceService.generateParentLetter(student.id, term.id);
      if (!isCurrent(token)) return;
      setParentLetter(letter);
      setShowLetterModal(true);
    } catch (err) { showOperationError(token, err, 'write the parent letter'); }
    finally { finishOperation(token); }
  };

  const handleViewBroadsheet = async () => {
    if (mode !== 'class' || !validClassSelection) return;
    const token = beginOperation('class');
    if (!token) return;
    setShowBroadsheet(false);
    try {
      const reports = await loadClassReports(token);
      if (!reports || !isCurrent(token)) return;
      setShowBroadsheet(true);
      setReport(null);
    } catch (err) { showOperationError(token, err, 'load the class results sheet'); }
    finally { finishOperation(token); }
  };

  const helper = busy && operation ? operationLabels[operation.kind]
    : lookupLoading ? 'Loading the available selections. Please wait before viewing a report.'
    : lookupError ? 'Retry the failed lookup below before viewing reports. Other selections have been kept.'
    : selectionError ? 'Correct the selection in this link using the controls above. Reports are not generated automatically.'
    : !term ? 'Start by choosing an academic term.'
    : !classOption ? 'Choose a class in this term to continue.'
    : mode === 'student' && !student ? 'Search by name, then choose a student to view their report.'
    : term.status === 'CLOSED' ? 'This term is closed. Only existing reports can be viewed, printed or exported; missing drafts will not be generated.'
    : !mayGenerate ? 'View existing reports. Generation is available to teachers and administrators only while a term is active or closing.'
    : mode === 'class' ? 'View the class results sheet, or use class print/export options. Draft reports may be generated; released reports are kept unchanged.'
    : 'Generate or view this student’s report. Finalized and published reports are loaded without regenerating them.';

  const lookupFeedback = (lookup: { error: string | null; retry: () => void }, label: string, id: string) => lookup.error ? (
    <div id={id} role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <p>{lookup.error}</p>
      <button type="button" onClick={lookup.retry} disabled={busy} className={`${secondaryStyle} mt-2`}>Retry {label}</button>
    </div>
  ) : null;

  const printParentLetter = () => {
    if (!parentLetter) return;
    const win = window.open('', '_blank');
    if (win) {
      const safeLetterHtml = DOMPurify.sanitize(parentLetter.letterHtml || `<p style="white-space:pre-wrap">${escapeHtml(parentLetter.letterPlainText)}</p>`);
      win.document.write(`<html><head><title>Parent Letter — ${escapeHtml(parentLetter.studentName)}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;line-height:1.7;font-size:16px;}</style></head><body>${safeLetterHtml}</body></html>`);
      win.document.close();
      win.print();
    }
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 text-slate-900 dark:text-slate-100">
      <header className="mb-5 print:hidden">
        <h2 className="text-2xl font-bold">Report Cards</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose a term and class, then view a student report or the class results sheet.</p>
      </header>

      <section aria-labelledby="report-selection-heading" className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 md:p-5 print:hidden">
        <h3 id="report-selection-heading" className="mb-4 font-semibold">Choose a report</h3>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label htmlFor="report-term" className="text-sm font-semibold">Academic term</label>
              {term && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">{term.status || 'Status unavailable'}</span>}
            </div>
            <select id="report-term" value={term?.id || ''} disabled={busy || termLookup.loading || Boolean(termLookup.error)}
              aria-invalid={Boolean(requestedTerm !== null && !term && !termLookup.loading && !termLookup.error)}
              aria-describedby={`report-term-hint${termLookup.error ? ' report-term-error' : ''}${selectionError ? ' report-selection-error' : ''}`}
              onChange={event => updateSelection({ reportTerm: event.target.value, reportClass: null, reportStudent: null, reportMode: mode })}
              className={`${controlStyle} cursor-pointer`}>
              <option value="">{termLookup.loading ? 'Loading academic terms…' : 'Select academic term'}</option>
              {terms.map(item => <option key={item.id} value={item.id}>{termLabel(item)}</option>)}
            </select>
            <p id="report-term-hint" className={hintStyle}>{termLookup.loading ? 'Loading academic terms…' : termLookup.error ? 'Academic terms could not be loaded.'
              : terms.length === 0 ? 'No academic terms are available. Ask your administrator to check term setup.'
              : term ? `Selected: ${termLabel(term)}. Classes and reports belong to this term.` : 'Choose the term and year you need. Only a valid active term is selected by default.'}</p>
            {lookupFeedback(termLookup, 'academic terms', 'report-term-error')}
          </div>
          <div>
            <label htmlFor="report-class" className="mb-2 block text-sm font-semibold">Class</label>
            <select id="report-class" value={classOption?.id || ''} disabled={busy || !term || classLookup.loading || Boolean(classLookup.error)}
              aria-invalid={Boolean(term && requestedClass !== null && !classOption && !classLookup.loading && !classLookup.error)}
              aria-describedby={`report-class-hint${classLookup.error ? ' report-class-error' : ''}${selectionError ? ' report-selection-error' : ''}`}
              onChange={event => updateSelection({ reportClass: event.target.value || null, reportStudent: null })}
              className={`${controlStyle} cursor-pointer`}>
              <option value="">{classLookup.loading ? 'Loading classes…' : 'Select class'}</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <p id="report-class-hint" className={hintStyle}>{!term ? 'Choose a valid academic term first.' : classLookup.loading ? 'Loading classes for this term…'
              : classLookup.error ? 'Classes for this term could not be loaded.' : classes.length === 0 ? 'No classes are available in this term. Ask your administrator to check class setup or access.'
              : 'Only classes available to you in the selected term are listed.'}</p>
            {lookupFeedback(classLookup, 'classes', 'report-class-error')}
          </div>
        </div>

        <fieldset disabled={busy} aria-describedby="report-action-hint" className="mt-5">
          <legend className="mb-2 text-sm font-semibold">Report type</legend>
          <div className="flex flex-wrap gap-2">
            {(['student', 'class'] as const).map(option => (
              <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-primary ${mode === option && !modeInvalid
                ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'} ${busy ? 'cursor-not-allowed opacity-60' : ''}`}>
                <input type="radio" name="report-mode" value={option} checked={mode === option && !modeInvalid}
                  onChange={() => updateSelection({ reportMode: option, reportStudent: null })}
                  onClick={() => { if (mode === option && requestedStudent !== null && option === 'class') updateSelection({ reportMode: option, reportStudent: null }); }}
                  className="h-4 w-4 accent-[var(--primary-color)]" />
                {option === 'student' ? 'Student report' : 'Class results'}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'student' && (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="report-student-search" className="mb-2 block text-sm font-semibold">Search student names</label>
              <input id="report-student-search" type="search" value={studentSearch} placeholder="Type a first or last name"
                disabled={busy || !classOption || studentLookup.loading || Boolean(studentLookup.error) || modeInvalid}
                onChange={event => setStudentSearch(event.target.value)} aria-describedby="report-search-hint"
                className={controlStyle} />
              <p id="report-search-hint" className={hintStyle}>{!classOption ? 'Choose a class first.' : studentLookup.loading ? 'Loading students…'
                : studentLookup.error ? 'Retry the student lookup to search names.' : normalizedSearch && matchingStudents.length === 0 ? 'No names match. Clear or change your search; any selected student is kept.'
                : 'Search narrows the list; choose a student from the selector.'}</p>
            </div>
            <div>
              <label htmlFor="report-student" className="mb-2 block text-sm font-semibold">Student</label>
              <select id="report-student" value={student?.id || ''} disabled={busy || !classOption || studentLookup.loading || Boolean(studentLookup.error) || modeInvalid}
                aria-invalid={Boolean(classOption && requestedStudent !== null && !student && !studentLookup.loading && !studentLookup.error)}
                aria-describedby={`report-student-hint${studentLookup.error ? ' report-student-error' : ''}${selectionError ? ' report-selection-error' : ''}`}
                onChange={event => updateSelection({ reportStudent: event.target.value || null })} className={`${controlStyle} cursor-pointer`}>
                <option value="">{studentLookup.loading ? 'Loading students…' : 'Select student'}</option>
                {visibleStudents.map(item => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}
              </select>
              <p id="report-student-hint" className={hintStyle}>{!classOption ? 'Choose a class first.' : studentLookup.loading ? 'Loading students in this term and class…'
                : studentLookup.error ? 'Students could not be loaded.' : students.length === 0 ? 'No students are enrolled in this term and class. Ask your administrator to check enrollment or access.'
                : student ? `Selected: ${student.firstName} ${student.lastName}.` : 'Choose the student whose report you want to view.'}</p>
              {lookupFeedback(studentLookup, 'students', 'report-student-error')}
            </div>
          </div>
        )}

        {selectionError && <p id="report-selection-error" role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{selectionError}</p>}

        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
          <p id="report-action-hint" className="mb-3 text-sm leading-6 text-slate-600 dark:text-slate-300" role="status" aria-live="polite">{helper}</p>
          {term?.status === 'CLOSED' && !helper.startsWith('This term is closed') && <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Closed term: existing reports only. Missing drafts cannot be generated.</p>}
          <div className="flex flex-wrap items-start gap-3">
            <button type="button" onClick={mode === 'student' ? handleGenerateReport : handleViewBroadsheet} disabled={actionsDisabled}
              aria-describedby="report-action-hint" className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors motion-reduce:transition-none hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-800 sm:w-auto">
              {busy ? <Loader2 size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : mode === 'student' ? <FileText size={18} aria-hidden="true" /> : <FileSpreadsheet size={18} aria-hidden="true" />}
              {busy && operation ? operationLabels[operation.kind] : mode === 'class' ? 'View Class Results Sheet' : mayGenerate ? 'Generate / View Student Report' : 'View Student Report'}
            </button>
            {mode === 'class' && (
              <details ref={exportDetailsRef} className="w-full rounded-xl border border-slate-300 dark:border-slate-600 sm:w-auto">
                <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-slate-200">Class print / export options</summary>
                <div className="flex flex-wrap gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
                  <button type="button" onClick={() => void handleExport('PRINT')} disabled={actionsDisabled} aria-describedby="report-action-hint" className={secondaryStyle}><Printer size={17} aria-hidden="true" />Print class reports / PDF</button>
                  <button type="button" onClick={() => void handleExport('EXCEL')} disabled={actionsDisabled} aria-describedby="report-action-hint" className={secondaryStyle}><FileSpreadsheet size={17} aria-hidden="true" />Export Excel</button>
                  <button type="button" onClick={() => void handleExport('CSV')} disabled={actionsDisabled} aria-describedby="report-action-hint" className={secondaryStyle}><FileText size={17} aria-hidden="true" />Export CSV</button>
                </div>
              </details>
            )}
            {canManageReports && currentReport && (
              <div>
                <button type="button" onClick={handleGenerateParentLetter} disabled={actionsDisabled} aria-describedby="report-letter-hint report-action-hint" className={secondaryStyle}>
                  {generatingLetter ? <Loader2 size={17} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Mail size={17} aria-hidden="true" />}
                  {generatingLetter ? 'Writing parent letter…' : 'AI Parent Letter'}
                </button>
                <p id="report-letter-hint" className={hintStyle}>Optional guardian letter. Review before sending.</p>
              </div>
            )}
          </div>
        </div>
        {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertCircle size={20} aria-hidden="true" className="shrink-0" /><p>{error}</p></div>}
        {success && <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle size={20} aria-hidden="true" className="shrink-0" /><p>{success}</p></div>}
      </section>

      {busy && operation && (operation.kind === 'student' || operation.kind === 'class' || operation.kind === 'refresh') && (
        <div role="status" aria-label={operationLabels[operation.kind]} className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 print:hidden">
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{operationLabels[operation.kind]}</p>
          <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse"><div className="h-5 w-1/3 rounded bg-slate-100 dark:bg-slate-700" /><div className="h-20 rounded bg-slate-100 dark:bg-slate-700" /><div className="h-5 w-2/3 rounded bg-slate-100 dark:bg-slate-700" /></div>
        </div>
      )}

      {validClassSelection && term && classOption && (
        <fieldset disabled={busy || Boolean(lookupError) || lookupLoading} aria-busy={busy} className="min-w-0 print:hidden">
          <ReportLifecyclePanel key={`${term.id}:${classOption.id}`} classId={classOption.id} termId={term.id} termStatus={term.status}
            report={currentReport} canManage={Boolean(canManageReports)} isSuperAdmin={user?.role === 'SUPER_ADMIN'} onChanged={refreshSelectedReport} />
        </fieldset>
      )}

      {currentReport && !printingAll && (
        <fieldset disabled={busy || lookupLoading || Boolean(lookupError)} className="min-w-0">
          <div id="printable-report" ref={reportRef}>
            <StudentReportCard report={currentReport} editable={Boolean(mayGenerate && currentReport.status === 'DRAFT')}
              teacherRemark={teacherRemark} principalRemark={principalRemark} onTeacherRemarkChange={setTeacherRemark} onPrincipalRemarkChange={setPrincipalRemark}
              onSaveRemarks={handleSaveRemarks} saving={savingRemarks} principalRemarkEditable={user?.role === 'SUPER_ADMIN'} />
          </div>
        </fieldset>
      )}
      {showBroadsheet && resultKey === contextKey && validSelection && mode === 'class' && !printingAll && (
        <fieldset disabled={busy} className="min-w-0">
          <ClassBroadsheet reports={classReports} onClose={() => setShowBroadsheet(false)} />
        </fieldset>
      )}
      {!busy && !currentReport && !(showBroadsheet && resultKey === contextKey) && !printingAll && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-600 dark:bg-slate-900 print:hidden">
          <p className="font-semibold">{mode === 'student' ? 'Your student report will appear here' : 'Your class results sheet will appear here'}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">{validSelection ? 'The selection is ready. Use the view button above to load the report; selecting a name or opening a link does not generate reports.' : 'Choose the term, class and report type above. For an individual report, also choose a student.'}</p>
        </div>
      )}
      {printingAll && resultKey === contextKey && classReports.length > 0 && (
        <div className="print-only">
          {classReports.map(item => <div key={item.id} style={{ pageBreakAfter: 'always' }} className="pb-8"><StudentReportCard report={item} editable={false} showPrintAction={false} /></div>)}
        </div>
      )}

      {showLetterModal && parentLetter && resultKey === contextKey && (
        <dialog ref={letterDialogRef} aria-labelledby="parent-letter-title" aria-describedby="parent-letter-review"
          onCancel={event => { event.preventDefault(); setShowLetterModal(false); }} onClose={() => setShowLetterModal(false)}
          className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
            <div className="min-w-0"><h3 id="parent-letter-title" className="font-semibold">AI Parent Letter</h3><p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{parentLetter.studentName} · {parentLetter.termName}</p></div>
            <div className="flex gap-2"><button type="button" onClick={printParentLetter} className={secondaryStyle}><Printer size={17} aria-hidden="true" />Print</button>
              <button type="button" autoFocus onClick={() => setShowLetterModal(false)} aria-label="Close parent letter" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-600 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary dark:text-slate-300"><X size={20} aria-hidden="true" /></button></div>
          </div>
          <div className="p-5 md:p-8"><div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parentLetter.letterHtml || `<p style="white-space:pre-wrap">${escapeHtml(parentLetter.letterPlainText)}</p>`) }} /></div>
          <p id="parent-letter-review" className="border-t border-slate-200 p-4 text-center text-xs leading-5 text-slate-600 dark:border-slate-700 dark:text-slate-300">Generated by AI · Review before sending · Generated {new Date(parentLetter.generatedAt).toLocaleString()}</p>
        </dialog>
      )}
    </div>
  );
};

export default ReportCards;
