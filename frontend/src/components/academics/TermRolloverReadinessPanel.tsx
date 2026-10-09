import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Database, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  getRolloverErrorMessage, RolloverReadinessDTO, RolloverReadinessIssue,
  TermRolloverSummary, termRolloverService,
} from '../../services/termRolloverService';

const surface = 'rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]';
const secondary = 'text-[var(--text-secondary)]';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:bg-[var(--bg-tertiary)] focus-visible:ring-2 focus-visible:ring-primary';
const primaryButton = `${button} border-transparent bg-primary text-white hover:enabled:bg-primary hover:enabled:brightness-110`;
const eligible = (item: TermRolloverSummary) => item.status === 'PREPARED' || item.status === 'READY';
const humanize = (value: string) => value.toLowerCase().replace(/_/g, ' ');

// Never turn server-provided links into external navigation, downloads or executable URLs.
const remediationPath = (path: string): string | null => {
  if (path === '/finance' || path === '/academics/report-cards') return path;
  if (!path.startsWith('/academics?')) return null;
  const params = new URLSearchParams(path.slice('/academics?'.length));
  const tab = params.get('tab');
  if (tab !== 'term-preparation' && tab !== 'enrollment-staging') return null;
  const safe = new URLSearchParams({ tab });
  const id = params.get('rolloverId');
  if (id && /^[a-f0-9-]{36}$/i.test(id)) safe.set('rolloverId', id);
  return `/academics?${safe.toString()}`;
};

const Finding = ({ issue, children, busy }: {
  issue: RolloverReadinessIssue; children?: React.ReactNode; busy: boolean;
}) => {
  const blocker = issue.severity === 'BLOCKER';
  const path = remediationPath(issue.remediationLink);
  return (
    <article className={`${surface} overflow-hidden border-l-4 ${blocker ? 'border-l-rose-500' : 'border-l-amber-500'} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-1 text-xs font-bold ${blocker
          ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>{blocker ? 'Blocker' : 'Warning'}</span>
        <h4 className="min-w-0 break-words text-sm font-semibold capitalize">{humanize(issue.code)}</h4>
      </div>
      <p className="mt-3 break-words text-sm leading-6">{issue.message}</p>
      <details className="mt-3 text-sm">
        <summary className={`min-h-11 cursor-pointer py-3 font-medium ${secondary}`}>Affected records ({issue.affectedRecords.length})</summary>
        <ul className="space-y-2 border-l border-[var(--border-color)] pl-3">
          {issue.affectedRecords.map((record, index) => (
            <li key={`${record.entityType}-${record.entityId}-${index}`}>
              <span className={secondary}>{record.entityType}</span>
              <code className="mt-1 block break-all text-xs">{record.entityId}</code>
            </li>
          ))}
        </ul>
      </details>
      {path && (busy
        ? <span className={`inline-flex min-h-11 items-center text-sm ${secondary}`} aria-disabled="true">Review remediation after this operation</span>
        : <Link to={path} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4">Review remediation <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>)}
      {children}
    </article>
  );
};

type Action = 'refresh' | 'preflight' | 'acknowledge' | 'backup' | 'verify' | 'approve';

const TermRolloverReadinessPanel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const preferredId = useRef(searchParams.get('rolloverId') || '');
  const [rollovers, setRollovers] = useState<TermRolloverSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState<RolloverReadinessDTO | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<{ id: string; fingerprint: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const approveButton = useRef<HTMLButtonElement>(null);
  const selectionControl = useRef<HTMLSelectElement>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const request = ++revision.current;
    void termRolloverService.list().then(items => {
      if (!mounted.current || revision.current !== request) return;
      const available = items.filter(eligible);
      setRollovers(available);
      setSelectedId(available.find(item => item.id === preferredId.current)?.id || available[0]?.id || '');
    }).catch(requestError => {
      if (mounted.current && revision.current === request) setError(getRolloverErrorMessage(requestError));
    }).finally(() => {
      if (mounted.current && revision.current === request) setLoading(false);
    });
    return () => { mounted.current = false; revision.current += 1; };
  }, []);

  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      if (approveButton.current && !approveButton.current.disabled) approveButton.current.focus();
      else selectionControl.current?.focus();
    }
  }, [confirmation]);

  const availableReport = report?.rolloverId === selectedId ? report : null;
  const selected = rollovers.find(item => item.id === selectedId);
  const warnings = availableReport?.issues.filter(issue => issue.severity === 'WARNING') || [];
  const blockers = availableReport?.issues.filter(issue => issue.severity === 'BLOCKER') || [];
  const busy = loading || action !== null || confirmation !== null;
  const current = !!availableReport?.evidence.current;
  const clear = current && availableReport?.summary.blockerCount === 0;
  const acknowledged = current && !!availableReport?.evidence.warningsAcknowledged;
  const verified = current && !!availableReport?.evidence.backupVerified;
  const approved = current && !!availableReport?.evidence.approved;
  const completeReasons = warnings.every(issue => {
    const reason = reasons[issue.id]?.trim() || '';
    return reason.length > 0 && reason.length <= 500;
  });
  const canApprove = !!selected && eligible(selected) && clear && acknowledged && verified
    && !!availableReport?.canApprove && !approved;

  const acceptReport = (next: RolloverReadinessDTO, id: string, request: number) => {
    if (!mounted.current || request !== revision.current) return;
    if (next.rolloverId !== id || !/^[a-f0-9]{64}$/.test(next.fingerprint)) {
      throw new Error('Readiness response did not match the selected rollover. Refresh before continuing.');
    }
    setReport(next);
    // Even unchanged fingerprints require a fresh review after a refresh or rejection.
    setReasons({});
    setRollovers(items => items.map(item => item.id === id
      ? { ...item, status: next.evidence.approved ? 'READY' : 'PREPARED' } : item));
  };

  const refresh = async (id: string, request: number) => {
    const items = (await termRolloverService.list()).filter(eligible);
    if (!mounted.current || request !== revision.current) return;
    setRollovers(items);
    const nextId = items.find(item => item.id === id)?.id || items[0]?.id || '';
    setSelectedId(nextId);
    if (nextId) acceptReport(await termRolloverService.preflight(nextId), nextId, request);
  };

  const run = async (operation: Action) => {
    if (locked.current || loading || (confirmation && operation !== 'approve')) return;
    if (operation !== 'refresh' && !selectedId) return;
    if (operation !== 'refresh' && operation !== 'preflight' && !current) return;
    if (operation === 'acknowledge' && (!warnings.length || !completeReasons || acknowledged)) return;
    if (operation === 'backup' && (!clear || !acknowledged || approved)) return;
    if (operation === 'verify' && (!clear || !acknowledged || !availableReport?.evidence.backupReference)) return;
    if (operation === 'approve' && (!canApprove || confirmation?.id !== selectedId
      || confirmation.fingerprint !== availableReport?.fingerprint)) return;
    locked.current = true;
    const request = ++revision.current;
    const id = selectedId;
    const fingerprint = availableReport?.fingerprint || '';
    setAction(operation);
    setError(null);
    setNotice('');
    try {
      if (operation === 'refresh') {
        setReport(null);
        setReasons({});
        await refresh(id, request);
      } else {
        const next = operation === 'preflight' ? await termRolloverService.preflight(id)
          : operation === 'acknowledge' ? await termRolloverService.acknowledgeWarnings(id, fingerprint,
            warnings.map(issue => ({ warningId: issue.id, reason: reasons[issue.id].trim() })))
          : operation === 'backup' ? await termRolloverService.createBackup(id, fingerprint)
          : operation === 'verify' ? await termRolloverService.verifyBackup(id, fingerprint)
          : await termRolloverService.approveReadiness(id, fingerprint);
        acceptReport(next, id, request);
      }
      if (mounted.current && request === revision.current) setNotice({
        refresh: 'Current preflight and evidence refreshed. Review the findings before continuing.',
        preflight: 'Preflight complete. Review all blockers and warnings.',
        acknowledge: 'All current warnings acknowledged with reasons for this fingerprint.',
        backup: 'Protected external backup created. Reverify it before approval.',
        verify: 'Backup checksum and manifest reverified by the server.',
        approve: 'Rollover approved as READY. No term was activated and no cutover was performed.',
      }[operation]);
    } catch (requestError) {
      if (!mounted.current || request !== revision.current) return;
      // Rejected requests can invalidate server evidence. Never retain approval or retry a mutation.
      setReport(null);
      setReasons({});
      const message = getRolloverErrorMessage(requestError);
      if (operation !== 'refresh') {
        try {
          await refresh(id, request);
          if (mounted.current && request === revision.current) setError(`${message} Current evidence refreshed; review it and explicitly retry if appropriate.`);
        } catch {
          if (mounted.current && request === revision.current) setError(`${message} Refresh failed. Readiness evidence is unavailable; refresh before continuing.`);
        }
      } else setError(`${message} Readiness evidence is unavailable; refresh before continuing.`);
    } finally {
      if (mounted.current && request === revision.current) {
        setAction(null);
        setConfirmation(null);
      }
      locked.current = false;
    }
  };

  const select = (id: string) => {
    if (busy || locked.current) return;
    revision.current += 1;
    setSelectedId(id);
    setReport(null);
    setReasons({});
    setConfirmation(null);
    setError(null);
    setNotice('');
    const next = new URLSearchParams(searchParams);
    if (id) next.set('rolloverId', id); else next.delete('rolloverId');
    setSearchParams(next, { replace: true });
  };

  return (
    <section aria-labelledby="readiness-heading" aria-busy={loading || action !== null}
      className="space-y-5 px-4 py-5 text-[var(--text-primary)] md:px-6">
      <header className={`${surface} relative overflow-hidden p-5 sm:p-7`}>
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className={`mb-2 text-xs font-bold uppercase tracking-[0.2em] ${secondary}`}>Phase 09 / Evidence & approval</p>
            <h2 id="readiness-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">Ready is not active.</h2>
            <p className={`mt-3 text-sm leading-6 ${secondary}`}>Review readiness, record warning reasons, protect a restore backup, then approve the prepared rollover as READY. No activation, cutover or execution is available here.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-semibold"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Super admin · approval only</span>
        </div>
      </header>

      <div className={`${surface} p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="readiness-rollover" className="mb-2 block text-sm font-semibold">Prepared or READY rollover</label>
            <select ref={selectionControl} id="readiness-rollover" value={selectedId} onChange={event => select(event.target.value)} disabled={busy}
              aria-describedby="readiness-selection-hint"
              className="min-h-11 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 disabled:opacity-50">
              <option value="">{loading ? 'Loading rollovers…' : 'Select a rollover'}</option>
              {rollovers.map(item => <option key={item.id} value={item.id}>{item.sourceTerm.name} → {item.targetTerm.name} · {item.transitionType === 'YEAR_END' ? 'Year end' : 'Within year'} · {item.status} · {item.id}</option>)}
            </select>
            <p id="readiness-selection-hint" className={`mt-2 text-xs ${secondary}`}>Only prepared and READY records can be reviewed. Selecting a record does not run preflight.</p>
          </div>
          <button type="button" className={button} disabled={busy} onClick={() => void run('refresh')}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh evidence</button>
          <button type="button" className={primaryButton} disabled={busy || !selectedId} onClick={() => void run('preflight')}>Run preflight</button>
        </div>
        {selected && <p className={`mt-4 break-words text-sm ${secondary}`}>Source: {selected.sourceTerm.name} ({selected.sourceTerm.status}) <span aria-hidden="true">→</span> Target: {selected.targetTerm.name} ({selected.targetTerm.status})</p>}
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
      <div role="status" aria-live="polite" aria-atomic="true" className="text-sm">
        {loading ? 'Loading available rollovers…' : action ? `${humanize(action)} in progress. Please wait; all actions are locked.` : notice}
      </div>

      {!loading && !error && rollovers.length === 0 && <div className={`${surface} p-6`}>
        <h3 className="font-semibold">No prepared rollovers available</h3>
        <p className={`mt-2 text-sm ${secondary}`}>Complete term preparation and enrollment staging before reviewing readiness.</p>
        <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline" to="/academics?tab=term-preparation">Open term preparation</Link>
      </div>}
      {selectedId && !availableReport && !loading && !action && <p className={`text-sm ${secondary}`}>Run preflight to load findings and current evidence. Approval stays disabled until all checks pass.</p>}

      {availableReport && <>
        <ol aria-label="Readiness evidence checklist" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: 'Preflight', detail: `${availableReport.summary.blockerCount} blockers · ${availableReport.summary.warningCount} warnings`, done: clear },
            { title: 'Warning review', detail: acknowledged ? 'Complete for this fingerprint' : 'Reasons required for every warning', done: acknowledged },
            { title: 'Protected backup', detail: verified ? 'Checksum & manifest verified' : 'Create, then reverify externally stored backup', done: verified },
            { title: 'READY approval', detail: approved ? 'Approved · target remains inactive' : 'Explicit confirmation required', done: approved },
          ].map((step, index) => <li key={step.title} className={`${surface} p-4`}>
            <div className="flex items-center justify-between gap-2"><span className={`font-mono text-xs ${secondary}`}>0{index + 1}</span>{step.done && <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-label="Complete" />}</div>
            <h3 className="mt-3 font-semibold">{step.title}</h3><p className={`mt-1 text-xs leading-5 ${secondary}`}>{step.detail}</p>
          </li>)}
        </ol>
        <div className={`${surface} p-4 text-xs sm:p-5`}>
          <p className="font-semibold">Reviewed fingerprint</p><code className="mt-2 block break-all">{availableReport.fingerprint}</code>
          <p className={`mt-2 leading-5 ${secondary}`}>All evidence is bound to this exact state. Changes require a new preflight, reasons and backup; cached approval is not authoritative.</p>
          {!current && <p className="mt-2 font-semibold text-amber-700 dark:text-amber-300">Evidence is stale. Refresh before taking any action.</p>}
        </div>

        <section aria-labelledby="readiness-blockers" className="space-y-3">
          <h3 id="readiness-blockers" className="text-lg font-bold">Blockers <span className={secondary}>/ {blockers.length}</span></h3>
          {blockers.length ? blockers.map(issue => <Finding key={issue.id} issue={issue} busy={busy} />)
            : <p className={`text-sm ${secondary}`}>No blockers found in this preflight.</p>}
        </section>

        <section aria-labelledby="readiness-warnings" className="space-y-3">
          <h3 id="readiness-warnings" className="text-lg font-bold">Warning review <span className={secondary}>/ {warnings.length}</span></h3>
          <p className={`text-sm leading-6 ${secondary}`}>Warnings do not block readiness once acknowledged. Record a specific reason for every warning; none are silently accepted.</p>
          {acknowledged && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{warnings.length ? 'The server confirms complete reason-bearing acknowledgements for this fingerprint.' : 'No warning acknowledgements are required.'}</p>}
          {warnings.map(issue => <Finding key={issue.id} issue={issue} busy={busy}>
            {!acknowledged && <div className="mt-3 border-t border-[var(--border-color)] pt-4">
              <label htmlFor={`warning-reason-${issue.id}`} className="mb-2 block text-sm font-semibold">Acknowledgement reason for {humanize(issue.code)}</label>
              <textarea id={`warning-reason-${issue.id}`} value={reasons[issue.id] || ''} required maxLength={500} rows={3}
                disabled={busy || !current} aria-describedby={`warning-hint-${issue.id}`}
                onChange={event => setReasons(previous => ({ ...previous, [issue.id]: event.target.value }))}
                className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-sm disabled:opacity-50" />
              <p id={`warning-hint-${issue.id}`} className={`mt-1 text-xs ${secondary}`}>Required · explain why proceeding is appropriate · {(reasons[issue.id] || '').length}/500 characters. Do not enter secrets.</p>
            </div>}
          </Finding>)}
          {!!warnings.length && !acknowledged && <button type="button" className={primaryButton}
            disabled={busy || !current || !completeReasons} onClick={() => void run('acknowledge')}>Acknowledge all {warnings.length} warnings</button>}
        </section>

        <section aria-labelledby="readiness-backup" className={`${surface} p-5 sm:p-6`}>
          <div className="flex items-center gap-3"><Database className="h-5 w-5 text-primary" aria-hidden="true" /><h3 id="readiness-backup" className="text-lg font-bold">Protected restore evidence</h3></div>
          <p className={`mt-3 text-sm leading-6 ${secondary}`}>Backup creation and verification happen on the server in protected external storage. This panel never requests backup bytes, credentials or download links. Clear blockers and complete warning review first.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className={secondary}>Backup</dt><dd className="mt-1 font-semibold">{availableReport.evidence.backupReference ? 'Protected artifact recorded (reference withheld)' : 'Not created for this fingerprint'}</dd></div>
            {availableReport.evidence.backupChecksum && <div><dt className={secondary}>SHA-256 checksum</dt><dd className="mt-1 break-all font-mono text-xs">{availableReport.evidence.backupChecksum}</dd></div>}
            <div><dt className={secondary}>Verification</dt><dd className="mt-1">{verified ? `Verified · ${availableReport.evidence.backupVerifiedAt || 'server confirmed'}` : 'Not verified for this fingerprint'}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className={button} disabled={busy || !clear || !acknowledged || approved} onClick={() => void run('backup')}>{availableReport.evidence.backupReference ? 'Replace protected backup' : 'Create protected external backup'}</button>
            <button type="button" className={button} disabled={busy || !clear || !acknowledged || !availableReport.evidence.backupReference} onClick={() => void run('verify')}>Reverify backup</button>
          </div>
        </section>

        <section aria-labelledby="readiness-approval" className={`${surface} p-5 sm:p-6`}>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><h3 id="readiness-approval" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />{approved ? 'Approved as READY' : 'Approve readiness only'}</h3>
              <p id="readiness-approval-hint" className={`mt-2 max-w-xl text-sm leading-6 ${secondary}`}>{approved ? 'Current server evidence confirms approval. The source is not closed and the target is not activated.' : 'Requires zero blockers, complete warning acknowledgements and a verified current backup. Approval does not change term lifecycle states.'}</p></div>
            <button ref={approveButton} type="button" className={primaryButton} aria-describedby="readiness-approval-hint" disabled={busy || !canApprove}
              onClick={() => setConfirmation({ id: selectedId, fingerprint: availableReport.fingerprint })}>Approve as READY</button>
          </div>
        </section>
      </>}

      <dialog ref={dialog} aria-labelledby="readiness-confirm-heading" aria-describedby="readiness-confirm-description"
        aria-busy={action === 'approve'}
        onCancel={event => { event.preventDefault(); if (!locked.current) setConfirmation(null); }}
        className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-[var(--text-primary)] shadow-xl backdrop:bg-black/60">
        <AlertTriangle className="mb-4 h-7 w-7 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h3 id="readiness-confirm-heading" className="text-xl font-bold">Approve this rollover as READY?</h3>
        <p id="readiness-confirm-description" className={`mt-3 text-sm leading-6 ${secondary}`}>{selected?.sourceTerm.name} → {selected?.targetTerm.name}. The server will recheck this fingerprint and the protected backup. This approves readiness only: no activation, source closure, cutover or execution.</p>
        <code className="mt-4 block break-all text-xs">{confirmation?.fingerprint}</code>
        <p role="status" aria-live="polite" className={`mt-3 text-sm ${secondary}`}>{action === 'approve' ? 'Approval checks in progress. Please wait.' : ''}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus className={button} disabled={action !== null} onClick={() => setConfirmation(null)}>Cancel</button>
          <button type="button" className={primaryButton} disabled={action !== null || !canApprove} onClick={() => void run('approve')}>{action === 'approve' ? 'Approving…' : 'Confirm READY approval'}</button>
        </div>
      </dialog>
    </section>
  );
};

export default TermRolloverReadinessPanel;