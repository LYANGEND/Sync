import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { useAppDialog } from '../ui/AppDialogProvider';
import {
  getRolloverErrorMessage,
  RolloverEnrollmentIssue,
  RolloverEnrollmentOutcome,
  StudentTransitionAction,
  TermRolloverEnrollmentPlan,
  TermRolloverEnrollmentValidation,
  TermRolloverSummary,
  termRolloverService,
  YearEndTransitionDecisionInput,
} from '../../services/termRolloverService';

type YearEndAction = Exclude<StudentTransitionAction, 'CARRY_FORWARD'>;

interface DecisionDraft {
  action: YearEndAction | '';
  targetClassId: string;
  reason: string;
}

const ACTIONS: Array<{ value: YearEndAction; label: string; description: string }> = [
  { value: 'PROMOTE', label: 'Promote', description: 'Use the prepared next-grade successor.' },
  { value: 'RETAIN', label: 'Retain', description: 'Place in a target-year class at the same grade.' },
  { value: 'GRADUATE', label: 'Graduate', description: 'Record completion; no target enrollment.' },
  { value: 'TRANSFER', label: 'Transfer', description: 'Record transfer out; no target enrollment.' },
  { value: 'WITHDRAW', label: 'Withdraw', description: 'Record withdrawal; no target enrollment.' },
];

const stateStyles: Record<RolloverEnrollmentOutcome['state'], string> = {
  DECISION_REQUIRED: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  READY_TO_STAGE: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200',
  STAGED: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  TERMINAL: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  BLOCKED: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
};

const humanize = (value: string) => value
  .toLowerCase()
  .split('_')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const IssueList = ({ issues }: { issues: RolloverEnrollmentIssue[] }) => {
  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="font-semibold leading-6">No enrollment-staging blockers or warnings were found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((item, index) => {
        const blocker = item.severity === 'BLOCKER';
        return (
          <div
            key={`${item.code}-${item.studentId || item.sourceEnrollmentId || index}`}
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${blocker
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}
          >
            {blocker
              ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <div>
              <p className="font-bold">{humanize(item.code)}</p>
              <p className="mt-0.5 leading-6">{item.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StateBadge = ({ state }: { state: RolloverEnrollmentOutcome['state'] }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${stateStyles[state]}`}>
    {humanize(state)}
  </span>
);

interface TermRolloverEnrollmentPanelProps {
  onNavigate?: (tab: 'terms' | 'term-preparation') => void;
}

const TermRolloverEnrollmentPanel = ({ onNavigate }: TermRolloverEnrollmentPanelProps) => {
  const { confirm, notify } = useAppDialog();
  const [rollovers, setRollovers] = useState<TermRolloverSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [plan, setPlan] = useState<TermRolloverEnrollmentPlan | null>(null);
  const [validation, setValidation] = useState<TermRolloverEnrollmentValidation | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preparedRollovers = useMemo(() => rollovers.filter(rollover => (
    rollover.status === 'PREPARED' && rollover.targetTerm.status === 'DRAFT'
  )), [rollovers]);
  const unpreparedCount = rollovers.length - preparedRollovers.length;

  const hydrateDrafts = (nextPlan: TermRolloverEnrollmentPlan) => {
    const nextDrafts: Record<string, DecisionDraft> = {};
    for (const outcome of nextPlan.outcomes) {
      nextDrafts[outcome.studentId] = {
        action: outcome.decision?.action && outcome.decision.action !== 'CARRY_FORWARD'
          ? outcome.decision.action
          : '',
        targetClassId: outcome.decision?.targetClassId || '',
        reason: outcome.decision?.reason || '',
      };
    }
    setDrafts(nextDrafts);
    setDirty(false);
  };

  const loadPlan = async (rolloverId: string) => {
    const nextPlan = await termRolloverService.getEnrollmentPlan(rolloverId);
    setPlan(nextPlan);
    setValidation(null);
    hydrateDrafts(nextPlan);
    return nextPlan;
  };

  const initialize = async (preferredId?: string) => {
    const nextRollovers = await termRolloverService.list();
    setRollovers(nextRollovers);
    const available = nextRollovers.filter(rollover => (
      rollover.status === 'PREPARED' && rollover.targetTerm.status === 'DRAFT'
    ));
    const nextId = preferredId && available.some(item => item.id === preferredId)
      ? preferredId
      : available[0]?.id || '';
    setSelectedId(nextId);
    if (nextId) await loadPlan(nextId);
    else {
      setPlan(null);
      setDrafts({});
    }
  };

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        setLoading(true);
        const nextRollovers = await termRolloverService.list();
        if (!active) return;
        setRollovers(nextRollovers);
        const available = nextRollovers.filter(rollover => (
          rollover.status === 'PREPARED' && rollover.targetTerm.status === 'DRAFT'
        ));
        const nextId = available[0]?.id || '';
        setSelectedId(nextId);
        if (nextId) {
          const nextPlan = await termRolloverService.getEnrollmentPlan(nextId);
          if (!active) return;
          setPlan(nextPlan);
          hydrateDrafts(nextPlan);
        }
      } catch (requestError) {
        if (active) setError(getRolloverErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void start();
    return () => { active = false; };
  }, []);

  const filteredOutcomes = useMemo(() => {
    if (!plan || !deferredSearch) return plan?.outcomes ?? [];
    return plan.outcomes.filter(outcome => (
      outcome.studentName.toLowerCase().includes(deferredSearch)
      || outcome.admissionNumber.toLowerCase().includes(deferredSearch)
      || outcome.sourceClass.name.toLowerCase().includes(deferredSearch)
    ));
  }, [deferredSearch, plan]);

  const selectedRollover = preparedRollovers.find(rollover => rollover.id === selectedId);
  const busy = action !== null;
  const selectedDecisionCount = Object.values(drafts).filter(draft => draft.action).length;

  const selectRollover = async (rolloverId: string) => {
    if (rolloverId === selectedId) return;
    try {
      setAction('select');
      setError(null);
      setSelectedId(rolloverId);
      await loadPlan(rolloverId);
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  const refresh = async () => {
    try {
      setAction('refresh');
      setError(null);
      await initialize(selectedId);
      notify('Enrollment staging state refreshed.', 'success');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
      setLoading(false);
    }
  };

  const updateDecision = (
    outcome: RolloverEnrollmentOutcome,
    patch: Partial<DecisionDraft>,
  ) => {
    setDrafts(current => {
      const previous = current[outcome.studentId] || { action: '', targetClassId: '', reason: '' };
      const next = { ...previous, ...patch };
      if (patch.action !== undefined) {
        if (patch.action === 'PROMOTE') next.targetClassId = outcome.mappedTargetClassId || '';
        else if (patch.action === 'RETAIN') {
          const retentionOptions = outcome.targetOptions.filter(option => option.actions.includes('RETAIN'));
          const currentStillValid = retentionOptions.some(option => option.id === previous.targetClassId);
          next.targetClassId = currentStillValid
            ? previous.targetClassId
            : retentionOptions.length === 1 ? retentionOptions[0].id : '';
        } else next.targetClassId = '';
      }
      return { ...current, [outcome.studentId]: next };
    });
    setDirty(true);
  };

  const saveDecisions = async () => {
    if (!plan || plan.transitionType !== 'YEAR_END') return;
    const decisions: YearEndTransitionDecisionInput[] = plan.outcomes.flatMap(outcome => {
      const draft = drafts[outcome.studentId];
      if (!draft?.action) return [];
      return [{
        studentId: outcome.studentId,
        action: draft.action,
        targetClassId: draft.action === 'PROMOTE' || draft.action === 'RETAIN'
          ? draft.targetClassId || null
          : null,
        reason: draft.reason.trim() || null,
      }];
    });

    try {
      setAction('save-decisions');
      setError(null);
      const result = await termRolloverService.saveEnrollmentDecisions(
        plan.rolloverId,
        plan.inputHash,
        decisions,
      );
      setPlan(result.plan);
      hydrateDrafts(result.plan);
      notify(
        result.reused ? 'The saved decision set is already current.' : 'Year-end decisions saved.',
        result.plan.summary.missingDecisionCount === 0 ? 'success' : 'warning',
      );
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
      await loadPlan(plan.rolloverId).catch(() => undefined);
    } finally {
      setAction(null);
    }
  };

  const stageOutcomes = async () => {
    if (!plan) return;
    const accepted = await confirm({
      title: plan.staged ? 'Re-check staged outcomes?' : 'Stage target outcomes?',
      message: `This records one audited outcome for each eligible pupil in ${plan.targetTerm.name}. Carry-forward, promotion, and retention create STAGED enrollments only. It does not change current classes, student status, source history, finances, term lifecycle, or activate the target term.`,
      confirmText: plan.staged ? 'Re-check outcomes' : 'Stage outcomes',
    });
    if (!accepted) return;

    try {
      setAction('stage');
      setError(null);
      const result = await termRolloverService.stageEnrollments(plan.rolloverId, plan.inputHash);
      setPlan(result.plan);
      hydrateDrafts(result.plan);
      const nextValidation = await termRolloverService.validateEnrollments(plan.rolloverId);
      setValidation(nextValidation);
      notify(
        result.reused ? 'Existing staged outcomes were reused without duplication.' : 'Enrollment outcomes staged successfully.',
        'success',
      );
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
      await loadPlan(plan.rolloverId).catch(() => undefined);
    } finally {
      setAction(null);
    }
  };

  const validateStaging = async () => {
    if (!plan) return;
    try {
      setAction('validate');
      setError(null);
      const nextValidation = await termRolloverService.validateEnrollments(plan.rolloverId);
      const nextPlan = await termRolloverService.getEnrollmentPlan(plan.rolloverId);
      setValidation(nextValidation);
      setPlan(nextPlan);
      hydrateDrafts(nextPlan);
      notify(nextValidation.valid ? 'Staged outcomes are valid.' : 'Validation found blockers.', nextValidation.valid ? 'success' : 'warning');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[420px] place-items-center" aria-live="polite">
        <div className="text-center text-slate-500 dark:text-slate-400">
          <Loader2 className="mx-auto h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold">Loading enrollment staging…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">Next-term enrollment</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Decide where each pupil goes next term. Nothing changes for pupils until you finish the later rollover steps.
          </p>
        </div>
        {rollovers.length > 0 && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${action === 'refresh' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="flex-1 font-medium leading-6">{error}</p>
          <button type="button" onClick={() => setError(null)} className="min-h-10 rounded-lg px-3 font-bold hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:hover:bg-rose-900/40">Dismiss</button>
        </div>
      )}

      {preparedRollovers.length > 0 && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="rollover-selection-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-2xl">
            <label id="rollover-selection-title" htmlFor="enrollment-rollover" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Term transition</label>
            <select
              id="enrollment-rollover"
              value={selectedId}
              onChange={event => void selectRollover(event.target.value)}
              disabled={busy}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
            >
              {preparedRollovers.map(rollover => (
                <option key={rollover.id} value={rollover.id}>
                  {rollover.sourceTerm.name} → {rollover.targetTerm.name} · {humanize(rollover.transitionType)}
                </option>
              ))}
            </select>
          </div>
          {selectedRollover && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span>{selectedRollover.sourceTerm.name}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              <span>{selectedRollover.targetTerm.name}</span>
            </div>
          )}
        </div>
      </section>
      )}

      {!plan ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-8" aria-labelledby="enrollment-empty-title">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-950/30">
              <ClipboardList className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h3 id="enrollment-empty-title" className="text-lg font-bold text-slate-950 dark:text-white">
                {rollovers.length === 0 ? 'No next term is set up yet' : 'Finish preparing your next term'}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {rollovers.length === 0
                  ? 'You can decide where pupils go next term once the next term exists and its classes are ready.'
                  : `${unpreparedCount} term transition${unpreparedCount === 1 ? ' is' : 's are'} not ready yet. Finish its class and setup preparation, then return here.`}
              </p>
            </div>
          </div>

          <ol className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              { step: 1, title: 'Create the next term', body: 'Add the new term and dates in Terms.', done: rollovers.length > 0 },
              { step: 2, title: 'Prepare its classes', body: 'Match this term’s classes and setup to the new term.', done: preparedRollovers.length > 0 },
              { step: 3, title: 'Place pupils', body: 'Carry pupils forward, or promote, retain, graduate, transfer or withdraw them at year end.', done: false },
            ].map(item => (
              <li key={item.step} className={`rounded-xl border p-4 ${item.done
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'}`}>
                <div className="flex items-center gap-2">
                  {item.done
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" aria-label="Done" />
                    : <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200" aria-hidden="true">{item.step}</span>}
                  <p className="font-bold text-slate-900 dark:text-white">{item.title}</p>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{item.body}</p>
              </li>
            ))}
          </ol>

          {onNavigate && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onNavigate(rollovers.length === 0 ? 'terms' : 'term-preparation')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {rollovers.length === 0 ? 'Go to Terms' : 'Go to Term Preparation'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Enrollment outcome summary">
            {[
              { label: 'Eligible pupils', value: plan.summary.eligibleCount, icon: Users, tone: 'text-primary bg-blue-50 dark:bg-blue-950/30' },
              { label: plan.transitionType === 'YEAR_END' ? 'Decisions recorded' : 'Automatic decisions', value: plan.transitionType === 'YEAR_END' ? plan.summary.decisionCount : plan.summary.eligibleCount, icon: ClipboardList, tone: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-950/30' },
              { label: 'Staged enrollments', value: plan.summary.stagedEnrollmentCount, icon: UserRoundCheck, tone: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30' },
              { label: 'Terminal outcomes', value: plan.summary.terminalOutcomeCount, icon: GraduationCap, tone: 'text-slate-700 bg-slate-100 dark:text-slate-200 dark:bg-slate-800' },
            ].map(item => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
                <div className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}><item.icon className="h-5 w-5" aria-hidden="true" /></div>
                <p className="mt-4 text-2xl font-bold text-slate-950 dark:text-white">{item.value}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{item.label}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="outcome-roster-title">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800 md:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="outcome-roster-title" className="text-lg font-bold text-slate-950 dark:text-white">Outcome roster</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${plan.staged
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{plan.staged ? 'Fingerprint verified' : 'Review in progress'}</span>
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {plan.transitionType === 'WITHIN_YEAR'
                    ? 'Every eligible pupil resolves to the prepared offering for the same logical cohort.'
                    : 'Every eligible pupil needs one explicit decision before staging can proceed.'}
                </p>
              </div>
              <div className="relative w-full lg:w-80">
                <label htmlFor="outcome-search" className="sr-only">Search outcome roster</label>
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  id="outcome-search"
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search pupil, admission, class"
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div className="max-h-[620px] overflow-auto [scrollbar-width:thin]" tabIndex={0} role="region" aria-label="Scrollable enrollment outcome table">
              <table className="w-full min-w-[980px] text-left text-sm">
                <caption className="sr-only">Eligible pupils and staged target outcomes</caption>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="px-5 py-3">Pupil</th>
                    <th scope="col" className="px-5 py-3">Source class</th>
                    <th scope="col" className="px-5 py-3">Decision</th>
                    <th scope="col" className="px-5 py-3">Target class</th>
                    <th scope="col" className="px-5 py-3">Reason / note</th>
                    <th scope="col" className="px-5 py-3">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOutcomes.map(outcome => {
                    const draft = drafts[outcome.studentId] || { action: '', targetClassId: '', reason: '' };
                    const targetOptions = outcome.targetOptions.filter(option => (
                      draft.action === 'PROMOTE'
                        ? option.actions.includes('PROMOTE')
                        : draft.action === 'RETAIN' && option.actions.includes('RETAIN')
                    ));
                    const targetName = outcome.targetOptions.find(option => option.id === outcome.targetClassId)?.name;
                    const canPromote = outcome.targetOptions.some(option => option.actions.includes('PROMOTE'));
                    const canRetain = outcome.targetOptions.some(option => option.actions.includes('RETAIN'));
                    return (
                      <tr key={outcome.studentId} className="align-top hover:bg-surface-hover">
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-900 dark:text-white">{outcome.studentName}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{outcome.admissionNumber}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">{outcome.sourceClass.name}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Grade {outcome.sourceClass.gradeLevel}</p>
                        </td>
                        <td className="px-5 py-3">
                          {plan.transitionType === 'WITHIN_YEAR' ? (
                            <div className="rounded-lg bg-blue-50 px-3 py-2 font-bold text-primary dark:bg-blue-950/30 dark:text-blue-200">Carry forward</div>
                          ) : (
                            <>
                              <label htmlFor={`decision-${outcome.studentId}`} className="sr-only">Decision for {outcome.studentName}</label>
                              <select
                                id={`decision-${outcome.studentId}`}
                                value={draft.action}
                                disabled={plan.staged || busy}
                                onChange={event => updateDecision(outcome, { action: event.target.value as YearEndAction | '' })}
                                className="h-11 w-full min-w-[150px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                              >
                                <option value="">Select outcome</option>
                                {ACTIONS.map(item => (
                                  <option
                                    key={item.value}
                                    value={item.value}
                                    disabled={(item.value === 'PROMOTE' && !canPromote)
                                      || (item.value === 'RETAIN' && !canRetain)}
                                  >
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {plan.transitionType === 'WITHIN_YEAR' ? (
                            <div className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 dark:border-slate-700 dark:text-slate-200">{targetName || 'Target mapping unavailable'}</div>
                          ) : draft.action === 'PROMOTE' || draft.action === 'RETAIN' ? (
                            <>
                              <label htmlFor={`target-${outcome.studentId}`} className="sr-only">Target class for {outcome.studentName}</label>
                              <select
                                id={`target-${outcome.studentId}`}
                                value={draft.targetClassId}
                                disabled={plan.staged || busy || draft.action === 'PROMOTE'}
                                onChange={event => updateDecision(outcome, { targetClassId: event.target.value })}
                                className="h-11 w-full min-w-[170px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                              >
                                <option value="">Select target class</option>
                                {targetOptions.map(option => <option key={option.id} value={option.id}>{option.name} · Grade {option.gradeLevel}</option>)}
                              </select>
                            </>
                          ) : draft.action ? (
                            <span className="inline-flex min-h-11 items-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">No target enrollment</span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          {plan.transitionType === 'YEAR_END' ? (
                            <>
                              <label htmlFor={`reason-${outcome.studentId}`} className="sr-only">Reason or note for {outcome.studentName}</label>
                              <input
                                id={`reason-${outcome.studentId}`}
                                type="text"
                                maxLength={500}
                                value={draft.reason}
                                disabled={plan.staged || busy}
                                onChange={event => updateDecision(outcome, { reason: event.target.value })}
                                placeholder="Optional audit note"
                                className="h-11 w-full min-w-[190px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                              />
                            </>
                          ) : <span className="text-xs text-slate-500">Automatic same-cohort rule</span>}
                        </td>
                        <td className="px-5 py-4"><StateBadge state={outcome.state} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredOutcomes.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No pupils match this search.</div>
              )}
            </div>

            {plan.transitionType === 'YEAR_END' && !plan.staged && (
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 md:px-6">
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{selectedDecisionCount} of {plan.summary.eligibleCount} decisions selected{dirty ? ' · unsaved changes' : ''}</p>
                <button
                  type="button"
                  onClick={() => void saveDecisions()}
                  disabled={busy || !dirty}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-bold text-primary transition-colors hover:bg-surface-hover-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
                >
                  {action === 'save-decisions' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Save decision set
                </button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6" aria-labelledby="staging-readiness-title">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <h3 id="staging-readiness-title" className="font-bold text-slate-950 dark:text-white">Before you save</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Problems marked as blockers must be fixed first. Refresh to re-check pupils, decisions and class matches.</p>
              </div>
            </div>
            <div className="mt-5"><IssueList issues={plan.issues} /></div>
            <div className="mt-5">
              <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Progress</p>
                <p className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                  {plan.staged
                    ? `${plan.summary.completeOutcomeCount} / ${plan.summary.eligibleCount} outcomes staged`
                    : plan.transitionType === 'YEAR_END'
                      ? `${plan.summary.decisionCount} / ${plan.summary.eligibleCount} decisions recorded`
                      : `${plan.summary.eligibleCount} / ${plan.summary.eligibleCount} automatic outcomes ready`}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.summary.excludedCount} non-active source enrollment{plan.summary.excludedCount === 1 ? '' : 's'} excluded</p>
              </div>
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Technical details</summary>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">Reviewed input fingerprint</p>
              <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-700 dark:text-slate-200">{plan.inputHash}</p>
            </details>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm dark:border-slate-700 md:p-6" aria-labelledby="stage-outcomes-title">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-2xl items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-300"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div>
                <div>
                  <h3 id="stage-outcomes-title" className="font-bold">Save next-term placements</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Saves every pupil’s next-term class in one step. It is safe to repeat, and no pupil’s current class changes.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void stageOutcomes()}
                disabled={busy || !plan.canStage || dirty}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action === 'stage' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {plan.staged ? 'Re-check saved placements' : 'Save placements'}
              </button>
            </div>
            {dirty && <p className="mt-4 text-xs font-semibold text-amber-200">Save decision changes before staging.</p>}
          </section>

          {(plan.staged || validation) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6" aria-labelledby="staging-validation-title">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><FileCheck2 className="h-5 w-5" aria-hidden="true" /></div>
                  <div>
                    <h3 id="staging-validation-title" className="font-bold text-slate-950 dark:text-white">Staged-outcome validation</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Verify source, decision, target mapping, and outcome fingerprints without activating placement.</p>
                  </div>
                </div>
                <button type="button" onClick={() => void validateStaging()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950/30">
                  {action === 'validate' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                  Validate outcomes
                </button>
              </div>

              {validation ? (
                <div className="mt-6 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['Verdict', validation.valid ? 'Valid' : 'Blocked', validation.valid],
                      ['Source', validation.sourceChanged ? 'Changed' : 'Stable', !validation.sourceChanged],
                      ['Decisions', validation.decisionsChanged ? 'Changed' : 'Stable', !validation.decisionsChanged],
                      ['Mappings', validation.targetMappingsChanged ? 'Changed' : 'Stable', !validation.targetMappingsChanged],
                      ['Outcomes', validation.outcomesChanged ? 'Changed' : 'Stable', !validation.outcomesChanged],
                    ].map(([label, value, positive]) => (
                      <div key={String(label)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                        <p className={`mt-2 text-lg font-bold ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {validation.staging && (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Staged {formatDateTime(validation.staging.stagedAt)} · {validation.staging.enrollmentCount} target enrollments · {validation.staging.terminalCount} terminal outcomes</p>
                  )}
                  <IssueList issues={validation.issues} />
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Run validation to verify the recorded outcome fingerprint.</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default TermRolloverEnrollmentPanel;
