import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ClassReportReadiness,
  ClosedTermAmendment,
  reportCardService,
  ReportVersion,
  StudentReport,
} from '../../services/reportCardService';
import { useAppDialog } from '../ui/AppDialogProvider';

interface ReportLifecyclePanelProps {
  classId: string;
  termId: string;
  termStatus?: 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
  report: StudentReport | null;
  canManage: boolean;
  isSuperAdmin: boolean;
  onChanged: () => Promise<void> | void;
}

const statusTone: Record<string, string> = {
  DRAFT: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  FINALIZED: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  PUBLISHED: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
};

const amendmentTone: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  APPLIED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

const ReportLifecyclePanel: React.FC<ReportLifecyclePanelProps> = ({
  classId,
  termId,
  termStatus,
  report,
  canManage,
  isSuperAdmin,
  onChanged,
}) => {
  const { confirm } = useAppDialog();
  const [readiness, setReadiness] = useState<ClassReportReadiness | null>(null);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [amendments, setAmendments] = useState<ClosedTermAmendment[]>([]);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [afterValue, setAfterValue] = useState('');
  const [reason, setReason] = useState('');

  const loadReadiness = useCallback(async () => {
    if (!classId || !termId) return;
    setLoadingReadiness(true);
    try {
      setReadiness(await reportCardService.getClassReadiness(classId, termId));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Readiness could not be checked');
    } finally {
      setLoadingReadiness(false);
    }
  }, [classId, termId]);

  const loadVersions = useCallback(async () => {
    if (!report?.id || report.status === 'DRAFT') {
      setVersions([]);
      return;
    }
    try {
      setVersions(await reportCardService.getReportVersions(report.id));
    } catch {
      setVersions([]);
    }
  }, [report?.id, report?.status, report?.currentVersion]);

  const loadAmendments = useCallback(async () => {
    if (!isSuperAdmin || termStatus !== 'CLOSED' || !termId) {
      setAmendments([]);
      return;
    }
    try {
      setAmendments(await reportCardService.getAmendments(termId));
    } catch {
      setAmendments([]);
    }
  }, [isSuperAdmin, termId, termStatus]);

  useEffect(() => {
    setReadiness(null);
    void loadReadiness();
  }, [loadReadiness]);

  useEffect(() => { void loadVersions(); }, [loadVersions]);
  useEffect(() => { void loadAmendments(); }, [loadAmendments]);

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    setWorking(key);
    try {
      await action();
      toast.success(success);
      await Promise.all([loadReadiness(), loadVersions(), loadAmendments()]);
      await onChanged();
      return true;
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'The report lifecycle action failed');
      return false;
    } finally {
      setWorking(null);
    }
  };

  const finalizeClass = async () => {
    if (!await confirm({
      title: 'Finalize every ready report?',
      message: 'This class action is atomic. If one student has a blocker, no report will be finalized. Finalized reports are locked.',
      confirmText: 'Finalize class',
    })) return;
    await runAction(
      'finalize-class',
      () => reportCardService.finalizeClassReports(classId, termId),
      'Class reports finalized',
    );
  };

  const publishClass = async () => {
    if (!await confirm({
      title: 'Publish class reports?',
      message: 'Published reports become visible through verification links and cannot be edited directly.',
      confirmText: 'Publish class',
    })) return;
    await runAction(
      'publish-class',
      () => reportCardService.publishClassReports(classId, termId),
      'Class reports published',
    );
  };

  const finalizeSelected = async () => {
    if (!report) return;
    await runAction(
      'finalize-selected',
      () => reportCardService.finalizeStudentReport(report.studentId, termId),
      'Student report finalized',
    );
  };

  const publishSelected = async () => {
    if (!report) return;
    await runAction(
      'publish-selected',
      () => reportCardService.publishStudentReport(report.studentId, termId),
      'Student report published',
    );
  };

  const targetOptions = useMemo(() => {
    if (!report) return [];
    return [
      { value: 'STUDENT_TERM_REPORT:classTeacherRemark', label: 'Class teacher remark', numeric: false },
      { value: 'STUDENT_TERM_REPORT:principalRemark', label: 'Head teacher remark', numeric: false },
      { value: 'STUDENT_TERM_REPORT:totalAttendance', label: 'Days attended', numeric: true },
      { value: 'STUDENT_TERM_REPORT:totalDays', label: 'Total instructional days', numeric: true },
      ...report.results.flatMap(result => [
        { value: `TERM_RESULT:${result.id}:totalScore`, label: `${result.subjectName} — score`, numeric: true },
        { value: `TERM_RESULT:${result.id}:grade`, label: `${result.subjectName} — grade`, numeric: false },
        { value: `TERM_RESULT:${result.id}:remarks`, label: `${result.subjectName} — remark`, numeric: false },
      ]),
    ];
  }, [report]);
  const selectedTargetOption = targetOptions.find(item => item.value === target);
  const hasAfterValue = afterValue.trim().length > 0;
  const hasValidAfterValue = hasAfterValue
    && (!selectedTargetOption?.numeric || Number.isFinite(Number(afterValue)));

  const requestAmendment = async () => {
    if (!report || !target || !hasValidAfterValue || reason.trim().length < 10) return;
    const [entityType, first, second] = target.split(':');
    const isReport = entityType === 'STUDENT_TERM_REPORT';
    const fieldName = isReport ? first : second;
    const entityId = isReport ? report.id : first;
    const option = targetOptions.find(item => item.value === target);
    const value = option?.numeric ? Number(afterValue) : (afterValue.trim() || null);
    const submitted = await runAction(
      'request-amendment',
      () => reportCardService.requestAmendment({
        termId,
        reason: reason.trim(),
        items: [{
          entityType: entityType as 'TERM_RESULT' | 'STUDENT_TERM_REPORT',
          entityId,
          fieldName,
          afterValue: value,
        }],
      }),
      'Amendment submitted for independent approval',
    );
    if (!submitted) return;
    setTarget('');
    setAfterValue('');
    setReason('');
  };

  if (!classId || !termId) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="report-lifecycle-heading">
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white dark:border-slate-700">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck size={16} aria-hidden="true" /> Controlled release
            </div>
            <h3 id="report-lifecycle-heading" className="text-xl font-semibold">Readiness & report lifecycle</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">Check assessment, grading, placement, and instructional-day evidence before locking official reports.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadReadiness()} disabled={loadingReadiness} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
              <RefreshCw size={17} className={loadingReadiness ? 'animate-spin' : ''} aria-hidden="true" /> Recheck
            </button>
            {canManage && termStatus === 'CLOSING' && (
              <button type="button" onClick={() => void finalizeClass()} disabled={working !== null} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
                {working === 'finalize-class' ? <Loader2 size={17} className="animate-spin" /> : <LockKeyhole size={17} />} Finalize class
              </button>
            )}
            {isSuperAdmin && termStatus === 'CLOSING' && (
              <button type="button" onClick={() => void publishClass()} disabled={working !== null} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
                {working === 'publish-class' ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Publish class
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-5">
        {readiness ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<Users size={18} />} label="Students" value={readiness.counts.students} />
              <Metric icon={<CheckCircle2 size={18} />} label="Ready" value={readiness.counts.ready} tone="emerald" />
              <Metric icon={<AlertTriangle size={18} />} label="Blocked" value={readiness.counts.blocked} tone={readiness.counts.blocked ? 'amber' : 'slate'} />
              <Metric icon={<ClipboardCheck size={18} />} label="Instructional days" value={readiness.counts.instructionalDays} />
            </div>

            <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${readiness.ready ? statusTone.PUBLISHED : statusTone.DRAFT}`}>
              {readiness.ready ? <CheckCircle2 className="mt-0.5 shrink-0" size={20} /> : <AlertTriangle className="mt-0.5 shrink-0" size={20} />}
              <div>
                <p className="font-bold">{readiness.ready ? 'Every report is ready to finalize' : 'Resolve blockers before finalization'}</p>
                <p className="mt-1 text-sm">{readiness.ready ? 'The class passed all evidence checks.' : `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? '' : 's'} found across the class.`}</p>
              </div>
            </div>

            {readiness.students.some(student => !student.ready) && (
              <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                {readiness.students.filter(student => !student.ready).map(student => (
                  <div key={student.studentId} className="border-b border-slate-100 p-4 last:border-0 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{student.studentName}</p>
                        <p className="text-xs text-slate-500">{student.admissionNumber} · {student.reportStatus.replace('_', ' ')}</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">{student.blockers.length} blocker{student.blockers.length === 1 ? '' : 's'}</span>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                      {student.blockers.map((blocker, index) => (
                        <li key={`${blocker.code}-${index}`} className="flex gap-2"><XCircle size={15} className="mt-0.5 shrink-0 text-amber-600" /><span><strong className="font-semibold">{blocker.code.replaceAll('_', ' ')}:</strong> {blocker.message}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-28 items-center justify-center text-sm text-slate-500">
            {loadingReadiness ? <><Loader2 className="mr-2 animate-spin" size={18} /> Checking report evidence…</> : 'Readiness has not been checked.'}
          </div>
        )}

        {report && (
          <div className="mt-6 grid gap-4 border-t border-slate-200 pt-5 dark:border-slate-700 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-bold text-slate-900 dark:text-white">Selected report</h4>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone[report.status]}`}>{report.status}</span>
                <span className="text-xs font-semibold text-slate-500">Version {report.currentVersion}</span>
              </div>
              <p className="mt-2 text-sm text-slate-500">{report.status === 'DRAFT' ? 'Remarks remain editable until finalization.' : 'This report is locked. Any closed-term correction requires an approved amendment and produces a new version.'}</p>
              {termStatus === 'CLOSING' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canManage && report.status === 'DRAFT' && (
                    <button type="button" onClick={() => void finalizeSelected()} disabled={working !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"><LockKeyhole size={15} /> Finalize selected</button>
                  )}
                  {isSuperAdmin && report.status === 'FINALIZED' && (
                    <button type="button" onClick={() => void publishSelected()} disabled={working !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"><Send size={15} /> Publish selected</button>
                  )}
                </div>
              )}
              {versions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {versions.map(version => (
                    <span key={version.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><FileClock size={14} /> v{version.version} · {version.status}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Release rule</p>
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Draft → Finalized → Published</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Finalization and publication are only available while the term is closing. Public verification only recognizes published versions.</p>
            </div>
          </div>
        )}

        {report && report.status !== 'DRAFT' && termStatus === 'CLOSED' && canManage && (
          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
            <div className="mb-4">
              <h4 className="font-bold text-slate-900 dark:text-white">Request a controlled amendment</h4>
              <p className="mt-1 text-sm text-slate-500">Submit one exact field change with a reason. A different administrator must approve it before application.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <div>
                <label htmlFor="amendment-target" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Field</label>
                <select id="amendment-target" value={target} onChange={event => setTarget(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                  <option value="">Select field</option>
                  {targetOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="amendment-value" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Corrected value</label>
                <input id="amendment-value" type={selectedTargetOption?.numeric ? 'number' : 'text'} step={selectedTargetOption?.numeric ? 'any' : undefined} value={afterValue} onChange={event => setAfterValue(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="amendment-reason" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Reason</label>
                <input id="amendment-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Minimum 10 characters" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                <p className="mt-1 text-right text-xs text-slate-500">{reason.trim().length}/10 minimum</p>
              </div>
            </div>
            <button type="button" onClick={() => void requestAmendment()} disabled={!target || !hasValidAfterValue || reason.trim().length < 10 || working !== null} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
              {working === 'request-amendment' ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />} Submit amendment
            </button>
          </div>
        )}

        {isSuperAdmin && amendments.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
            <h4 className="font-bold text-slate-900 dark:text-white">Amendment queue</h4>
            <div className="mt-3 space-y-3">
              {amendments.map(amendment => (
                <article key={amendment.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${amendmentTone[amendment.status]}`}>{amendment.status}</span>
                      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{amendment.reason}</p>
                      <p className="mt-1 text-xs text-slate-500">{amendment.items.length} exact change{amendment.items.length === 1 ? '' : 's'} · {new Date(amendment.requestedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {amendment.status === 'REQUESTED' && <>
                        <button type="button" onClick={() => void runAction(`approve-${amendment.id}`, () => reportCardService.approveAmendment(amendment.id), 'Amendment approved')} disabled={working !== null} className="min-h-10 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50">Approve</button>
                        <button type="button" onClick={() => void runAction(`reject-${amendment.id}`, () => reportCardService.rejectAmendment(amendment.id), 'Amendment rejected')} disabled={working !== null} className="min-h-10 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700 hover:bg-surface-hover-danger disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">Reject</button>
                      </>}
                      {amendment.status === 'APPROVED' && (
                        <button type="button" onClick={() => void runAction(`apply-${amendment.id}`, () => reportCardService.applyAmendment(amendment.id), 'Approved amendment applied as a new report version')} disabled={working !== null} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">Apply version</button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const Metric = ({ icon, label, value, tone = 'slate' }: { icon: React.ReactNode; label: string; value: number; tone?: 'slate' | 'emerald' | 'amber' }) => {
  const styles = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
      : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  return <div className={`rounded-xl border p-4 ${styles}`}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide opacity-70">{icon}{label}</div><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></div>;
};

export default ReportLifecyclePanel;
