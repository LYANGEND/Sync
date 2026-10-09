import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  History,
  Layers3,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { useAppDialog } from '../ui/AppDialogProvider';
import {
  AcademicTermOption,
  getRolloverErrorMessage,
  ROLLOVER_COPY_CATEGORIES,
  RolloverCopyCategory,
  RolloverIssue,
  RolloverPlanCategory,
  TermRolloverDetail,
  TermRolloverPlan,
  TermRolloverStatus,
  TermRolloverSummary,
  TermRolloverType,
  TermRolloverValidation,
  termRolloverService,
  YearEndMappingPlan,
} from '../../services/termRolloverService';

const ALL_COPY_CATEGORIES = ROLLOVER_COPY_CATEGORIES.map(category => category.id);
const CATEGORY_LABELS: Record<RolloverPlanCategory, string> = {
  CLASS_COHORTS: 'Class cohorts',
  CLASS_OFFERINGS: 'Class offerings',
  SUBJECT_LINKS: 'Subject links',
  TEACHER_ASSIGNMENTS: 'Teacher assignments',
  FEE_TEMPLATES: 'Fee templates',
  CLASS_FEE_ASSIGNMENTS: 'Class fee assignments',
  TIMETABLE: 'Timetable periods',
  LESSON_PLANS: 'Lesson plans',
};
const PLAN_CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as RolloverPlanCategory[];

const statusTone: Record<TermRolloverStatus, string> = {
  DRAFT: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  PREPARING: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  PREPARED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  READY: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
  EXECUTING: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
  CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
};

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}).format(new Date(value));

const formatDateTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const humanize = (value: string) => value
  .toLowerCase()
  .split('_')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const StatusBadge = ({ status }: { status: TermRolloverStatus }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide ${statusTone[status]}`}>
    {humanize(status)}
  </span>
);

const IssueList = ({ issues, emptyMessage }: { issues: RolloverIssue[]; emptyMessage: string }) => {
  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {issues.map((issue, index) => {
        const blocker = issue.severity === 'BLOCKER';
        return (
          <div
            key={`${issue.code}-${issue.entityId || index}`}
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${blocker
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}
          >
            {blocker
              ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <div>
              <p className="font-bold">{humanize(issue.code)}</p>
              <p className="mt-0.5 leading-6">{issue.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const WorkflowSteps = ({ detail, plan, validation }: {
  detail: TermRolloverDetail;
  plan: TermRolloverPlan | null;
  validation: TermRolloverValidation | null;
}) => {
  const prepared = ['PREPARED', 'READY', 'EXECUTING', 'COMPLETED'].includes(detail.status);
  const steps = [
    { label: 'Configure', complete: true },
    { label: 'Dry run', complete: Boolean(plan) || prepared },
    { label: 'Prepare', complete: prepared },
    { label: 'Validate', complete: Boolean(validation?.valid) },
  ];

  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Preparation workflow">
      {steps.map((step, index) => (
        <li key={step.label} className="flex min-w-0 items-center gap-2">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold ${step.complete
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}>
            {step.complete ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
          </span>
          <span className={`truncate text-xs font-bold ${step.complete ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            {step.label}
          </span>
          {index < steps.length - 1 && <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
};

const TermRolloverPreparationPanel = () => {
  const { confirm, notify } = useAppDialog();
  const [terms, setTerms] = useState<AcademicTermOption[]>([]);
  const [rollovers, setRollovers] = useState<TermRolloverSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TermRolloverDetail | null>(null);
  const [plan, setPlan] = useState<TermRolloverPlan | null>(null);
  const [validation, setValidation] = useState<TermRolloverValidation | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<RolloverCopyCategory[]>(ALL_COPY_CATEGORIES);
  const [mappingDrafts, setMappingDrafts] = useState<YearEndMappingPlan[]>([]);
  const [configDirty, setConfigDirty] = useState(false);
  const [sourceTermId, setSourceTermId] = useState('');
  const [targetTermId, setTargetTermId] = useState('');
  const [transitionType, setTransitionType] = useState<TermRolloverType>('WITHIN_YEAR');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditView, setAuditView] = useState<'tasks' | 'events'>('tasks');

  const syncDetailConfiguration = (nextDetail: TermRolloverDetail) => {
    const categories = nextDetail.configuration?.copyCategories;
    setSelectedCategories(Array.isArray(categories) ? categories : ALL_COPY_CATEGORIES);
    setConfigDirty(false);
  };

  const loadDetail = async (id: string, resetTransient = true) => {
    const nextDetail = await termRolloverService.get(id);
    setDetail(nextDetail);
    syncDetailConfiguration(nextDetail);
    if (resetTransient) {
      setPlan(null);
      setValidation(null);
      setMappingDrafts([]);
    }
    return nextDetail;
  };

  const refreshIndexes = async () => {
    const [nextTerms, nextRollovers] = await Promise.all([
      termRolloverService.getTerms(),
      termRolloverService.list(),
    ]);
    setTerms(nextTerms);
    setRollovers(nextRollovers);
    return nextRollovers;
  };

  const refreshSelected = async (id: string, resetTransient = false) => {
    await Promise.all([refreshIndexes(), loadDetail(id, resetTransient)]);
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        setLoading(true);
        const [nextTerms, nextRollovers] = await Promise.all([
          termRolloverService.getTerms(),
          termRolloverService.list(),
        ]);
        if (!active) return;
        setTerms(nextTerms);
        setRollovers(nextRollovers);
        const initialId = nextRollovers[0]?.id ?? null;
        setSelectedId(initialId);
        if (initialId) {
          const nextDetail = await termRolloverService.get(initialId);
          if (!active) return;
          setDetail(nextDetail);
          syncDetailConfiguration(nextDetail);
        }
      } catch (requestError) {
        if (active) setError(getRolloverErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  const sourceTerms = useMemo(() => terms.filter(term => (
    term.status === 'ACTIVE' || term.status === 'CLOSING'
  )), [terms]);

  const targetTerms = useMemo(() => {
    const source = terms.find(term => term.id === sourceTermId);
    if (!source) return terms.filter(term => term.status === 'DRAFT');
    return terms.filter(term => {
      if (term.status !== 'DRAFT' || term.id === source.id || new Date(term.startDate) <= new Date(source.endDate)) return false;
      if (transitionType === 'WITHIN_YEAR') {
        return Boolean(source.academicYearId)
          && term.academicYearId === source.academicYearId
          && term.sequence === (source.sequence ?? 0) + 1;
      }
      return Boolean(source.academicYearId)
        && Boolean(term.academicYearId)
        && term.academicYearId !== source.academicYearId
        && term.sequence === 1;
    });
  }, [sourceTermId, terms, transitionType]);

  const selectedSource = terms.find(term => term.id === sourceTermId);
  const selectedTarget = terms.find(term => term.id === targetTermId);
  const isPrepared = Boolean(detail && ['PREPARED', 'READY', 'EXECUTING', 'COMPLETED'].includes(detail.status));
  const busy = action !== null;

  const selectRollover = async (id: string) => {
    if (id === selectedId && detail) return;
    try {
      setSelectedId(id);
      setAction('loading-detail');
      setError(null);
      await loadDetail(id);
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  const createRollover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sourceTermId || !targetTermId) return;
    try {
      setAction('create');
      setError(null);
      const result = await termRolloverService.create({
        sourceTermId,
        targetTermId,
        transitionType,
        idempotencyKey: `term-preparation:${sourceTermId}:${targetTermId}`,
        configuration: { copyCategories: ALL_COPY_CATEGORIES, yearEndMappings: [] },
      });
      const id = result.rollover.id;
      setSelectedId(id);
      await refreshSelected(id, true);
      notify(result.reused ? 'Existing preparation opened.' : 'Preparation draft created.', 'success');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  const toggleCategory = (category: RolloverCopyCategory) => {
    if (!detail || detail.status !== 'DRAFT') return;
    setSelectedCategories(current => current.includes(category)
      ? current.filter(item => item !== category)
      : [...current, category]);
    setConfigDirty(true);
  };

  const updateMapping = (sourceCohortId: string, patch: Partial<YearEndMappingPlan>) => {
    setMappingDrafts(current => current.map(mapping => (
      mapping.sourceCohortId === sourceCohortId ? { ...mapping, ...patch } : mapping
    )));
    setConfigDirty(true);
  };

  const saveConfiguration = async () => {
    if (!detail) return;
    try {
      setAction('save-config');
      setError(null);
      await termRolloverService.updateConfiguration(detail.id, {
        copyCategories: selectedCategories,
        yearEndMappings: mappingDrafts.map(mapping => ({
          sourceCohortId: mapping.sourceCohortId,
          targetName: mapping.targetName.trim(),
          targetGradeLevel: mapping.targetGradeLevel,
          skip: mapping.skip,
        })),
        expectedVersion: detail.version,
      });
      await refreshSelected(detail.id, true);
      notify('Preparation configuration saved. Run a new dry run.', 'success');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
      await refreshSelected(detail.id, true).catch(() => undefined);
    } finally {
      setAction(null);
    }
  };

  const runDryRun = async () => {
    if (!detail) return;
    try {
      setAction('dry-run');
      setError(null);
      const nextPlan = await termRolloverService.dryRun(detail.id);
      setPlan(nextPlan);
      setMappingDrafts(nextPlan.yearEndMappings);
      setSelectedCategories(nextPlan.configuration.copyCategories);
      setConfigDirty(false);
      setValidation(null);
      await refreshSelected(detail.id, false);
      setPlan(nextPlan);
      setMappingDrafts(nextPlan.yearEndMappings);
      notify('Dry run complete. No records were changed.', nextPlan.canPrepare ? 'success' : 'warning');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  const prepareTarget = async () => {
    if (!detail || !plan) return;
    const accepted = await confirm({
      title: isPrepared ? 'Re-check prepared setup?' : 'Prepare target setup?',
      message: `This copies only editable setup into ${detail.targetTerm.name}. It will not place pupils, create invoices, move balances, copy attendance or results, activate the term, or execute a rollover.`,
      confirmText: isPrepared ? 'Re-check setup' : 'Prepare setup',
    });
    if (!accepted) return;

    try {
      setAction('prepare');
      setError(null);
      const result = await termRolloverService.prepare(detail.id, plan.inputHash);
      const nextValidation = await termRolloverService.validate(detail.id);
      setValidation(nextValidation);
      await refreshSelected(detail.id, false);
      setPlan(null);
      setMappingDrafts([]);
      notify(result.reused ? 'Prepared setup was reused without duplication.' : 'Target setup prepared successfully.', 'success');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
      await refreshSelected(detail.id, false).catch(() => undefined);
    } finally {
      setAction(null);
    }
  };

  const validatePreparation = async () => {
    if (!detail) return;
    try {
      setAction('validate');
      setError(null);
      const nextValidation = await termRolloverService.validate(detail.id);
      setValidation(nextValidation);
      await refreshSelected(detail.id, false);
      setValidation(nextValidation);
      notify(nextValidation.valid ? 'Prepared setup is valid.' : 'Validation found blockers.', nextValidation.valid ? 'success' : 'warning');
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
    }
  };

  const refreshAll = async () => {
    try {
      setAction('refresh');
      setError(null);
      const nextRollovers = await refreshIndexes();
      const id = selectedId && nextRollovers.some(item => item.id === selectedId)
        ? selectedId
        : nextRollovers[0]?.id;
      setSelectedId(id ?? null);
      if (id) await loadDetail(id, true);
      else setDetail(null);
    } catch (requestError) {
      setError(getRolloverErrorMessage(requestError));
    } finally {
      setAction(null);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[420px] place-items-center p-6" aria-live="polite">
        <div className="text-center text-slate-500 dark:text-slate-400">
          <Loader2 className="mx-auto h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold">Loading term preparation workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 md:p-6 md:pb-6">
      <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/70 dark:border-indigo-950 dark:bg-indigo-950/20">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="flex max-w-3xl items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-sm">
              <Layers3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Phase 7 · Setup only</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Prepare the next term safely</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Copy editable academic setup into a draft target term with a deterministic dry run and an auditable, idempotent preparation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-bold text-primary transition-colors hover:bg-surface-hover-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900"
          >
            <RefreshCw className={`h-4 w-4 ${action === 'refresh' ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
            Refresh state
          </button>
        </div>
        <div className="grid gap-px border-t border-indigo-100 bg-indigo-100 sm:grid-cols-3 dark:border-indigo-950 dark:bg-indigo-950">
          {[
            ['Copied', 'Classes, subjects, teachers, fee templates, timetable, lesson plans'],
            ['Never copied', 'Pupils, balances, invoices, payments, attendance, results'],
            ['Deferred', 'Placement, finance carryover, approval, execution, activation'],
          ].map(([label, description]) => (
            <div key={label} className="bg-white/80 px-5 py-4 dark:bg-slate-900/80">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-slate-800 dark:text-slate-200">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="flex-1 font-medium leading-6">{error}</p>
          <button type="button" onClick={() => setError(null)} className="min-h-10 rounded-lg px-3 font-bold hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:hover:bg-rose-900/40">Dismiss</button>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,2fr)]">
        <aside className="space-y-5 xl:sticky xl:top-5">
          <form onSubmit={createRollover} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">New preparation</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Choose an adjacent term pair.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="rollover-type" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Transition</label>
                <select
                  id="rollover-type"
                  value={transitionType}
                  onChange={(event) => {
                    setTransitionType(event.target.value as TermRolloverType);
                    setTargetTermId('');
                  }}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-slate-800"
                >
                  <option value="WITHIN_YEAR">Within academic year</option>
                  <option value="YEAR_END">Year end</option>
                </select>
              </div>
              <div>
                <label htmlFor="source-term" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Source term</label>
                <select
                  id="source-term"
                  required
                  value={sourceTermId}
                  onChange={(event) => {
                    setSourceTermId(event.target.value);
                    setTargetTermId('');
                  }}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:ring-slate-800"
                >
                  <option value="">Select active or closing term</option>
                  {sourceTerms.map(term => <option key={term.id} value={term.id}>{term.name} · {humanize(term.status)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="target-term" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Draft target</label>
                <select
                  id="target-term"
                  required
                  value={targetTermId}
                  onChange={(event) => setTargetTermId(event.target.value)}
                  disabled={!sourceTermId}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800 dark:focus:ring-slate-800"
                >
                  <option value="">Select adjacent draft term</option>
                  {targetTerms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
                </select>
                {sourceTermId && targetTerms.length === 0 && (
                  <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">No adjacent draft term matches this transition.</p>
                )}
              </div>
            </div>

            {selectedSource && selectedTarget && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <span className="truncate">{selectedSource.name}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedTarget.name}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !sourceTermId || !targetTermId}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {action === 'create' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Layers3 className="h-4 w-4" aria-hidden="true" />}
              Create preparation draft
            </button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="existing-preparations-title">
            <div className="flex items-center justify-between px-2 pb-3 pt-1">
              <h3 id="existing-preparations-title" className="text-sm font-bold text-slate-950 dark:text-white">Preparation history</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{rollovers.length}</span>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {rollovers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No preparation drafts yet.
                </div>
              ) : rollovers.map(rollover => (
                <button
                  key={rollover.id}
                  type="button"
                  onClick={() => void selectRollover(rollover.id)}
                  aria-pressed={selectedId === rollover.id}
                  className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedId === rollover.id
                    ? 'border-primary bg-blue-50 dark:bg-slate-800'
                    : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-surface-hover dark:bg-slate-800/70 dark:hover:border-slate-700'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{rollover.sourceTerm.name}</p>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="truncate">{rollover.targetTerm.name}</span>
                      </div>
                    </div>
                    <StatusBadge status={rollover.status} />
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Updated {formatDateTime(rollover.updatedAt)}</p>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="min-w-0">
          {!detail ? (
            <div className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="max-w-sm">
                <Layers3 className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">Select or create a preparation</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">A preparation draft is the safe workspace for configuration, dry run, setup copy, and validation.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5" aria-live="polite">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={detail.status} />
                      <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">{humanize(detail.transitionType)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Source</p>
                        <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{detail.sourceTerm.name}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(detail.sourceTerm.startDate)} – {formatDate(detail.sourceTerm.endDate)}</p>
                      </div>
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><ArrowRight className="h-5 w-5" aria-hidden="true" /></div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Draft target</p>
                        <h3 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{detail.targetTerm.name}</h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(detail.targetTerm.startDate)} – {formatDate(detail.targetTerm.endDate)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-800/70">
                    <p className="font-bold uppercase tracking-wide text-slate-400">Version {detail.version}</p>
                    <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{detail.tasks.length} tasks · {detail.events.length} events</p>
                  </div>
                </div>
                <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <WorkflowSteps detail={detail} plan={plan} validation={validation} />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6" aria-labelledby="copy-configuration-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary dark:bg-slate-800"><Settings2 className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <h3 id="copy-configuration-title" className="font-bold text-slate-950 dark:text-white">Editable setup scope</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Classes and cohorts are always planned. Choose the additional editable setup to copy.</p>
                    </div>
                  </div>
                  {configDirty && <span className="self-start rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Unsaved changes</span>}
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {ROLLOVER_COPY_CATEGORIES.map(category => {
                    const checked = selectedCategories.includes(category.id);
                    return (
                      <label
                        key={category.id}
                        className={`flex min-h-[92px] cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked
                          ? 'border-primary bg-blue-50 dark:bg-slate-800'
                          : 'border-slate-200 bg-white hover:bg-surface-hover dark:border-slate-700 dark:bg-slate-950'} ${detail.status !== 'DRAFT' ? 'cursor-not-allowed opacity-75' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={detail.status !== 'DRAFT'}
                          onChange={() => toggleCategory(category.id)}
                          className="mt-0.5 h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span>
                          <span className="block text-sm font-bold text-slate-900 dark:text-white">{category.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{category.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {detail.status === 'DRAFT' && (
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void saveConfiguration()}
                      disabled={busy || !configDirty}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary bg-white px-4 text-sm font-bold text-primary transition-colors hover:bg-surface-hover-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950"
                    >
                      {action === 'save-config' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                      Save configuration
                    </button>
                  </div>
                )}
              </section>

              {detail.transitionType === 'YEAR_END' && mappingDrafts.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="cohort-mapping-title">
                  <div className="p-5 md:p-6">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"><ArrowRight className="h-5 w-5" aria-hidden="true" /></div>
                      <div>
                        <h3 id="cohort-mapping-title" className="font-bold text-slate-950 dark:text-white">Year-end cohort successors</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Review generated successor names and grades. Saving changes requires a new dry run.</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <caption className="sr-only">Year-end cohort successor mappings</caption>
                      <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th scope="col" className="px-5 py-3">Source cohort</th>
                          <th scope="col" className="px-5 py-3">Current grade</th>
                          <th scope="col" className="px-5 py-3">Successor name</th>
                          <th scope="col" className="px-5 py-3">Next grade</th>
                          <th scope="col" className="px-5 py-3">Skip</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {mappingDrafts.map(mapping => (
                          <tr key={mapping.sourceCohortId} className="hover:bg-surface-hover">
                            <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">{mapping.sourceName}</td>
                            <td className="px-5 py-4 text-slate-600 dark:text-slate-300">Grade {mapping.sourceGradeLevel}</td>
                            <td className="px-5 py-3">
                              <input
                                type="text"
                                value={mapping.targetName}
                                disabled={detail.status !== 'DRAFT' || mapping.skip}
                                onChange={(event) => updateMapping(mapping.sourceCohortId, { targetName: event.target.value })}
                                aria-label={`Successor name for ${mapping.sourceName}`}
                                className="h-11 w-full min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                              />
                            </td>
                            <td className="px-5 py-3">
                              <input
                                type="number"
                                min={0}
                                max={12}
                                value={mapping.targetGradeLevel}
                                disabled={detail.status !== 'DRAFT' || mapping.skip}
                                onChange={(event) => updateMapping(mapping.sourceCohortId, { targetGradeLevel: Number(event.target.value) })}
                                aria-label={`Successor grade for ${mapping.sourceName}`}
                                className="h-11 w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800"
                              />
                            </td>
                            <td className="px-5 py-3">
                              <input
                                type="checkbox"
                                checked={mapping.skip}
                                disabled={detail.status !== 'DRAFT'}
                                onChange={(event) => updateMapping(mapping.sourceCohortId, { skip: event.target.checked })}
                                aria-label={`Skip successor for ${mapping.sourceName}`}
                                className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.status === 'DRAFT' && configDirty && (
                    <div className="flex justify-end border-t border-slate-100 p-4 dark:border-slate-800">
                      <button type="button" onClick={() => void saveConfiguration()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                        <Save className="h-4 w-4" aria-hidden="true" /> Save successor mappings
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6" aria-labelledby="dry-run-title">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Play className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <h3 id="dry-run-title" className="font-bold text-slate-950 dark:text-white">Deterministic dry run</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Inspect exact create, reuse, and skip counts. The dry run never writes setup records.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runDryRun()}
                    disabled={busy || configDirty}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {action === 'dry-run' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    {plan ? 'Run again' : 'Run dry run'}
                  </button>
                </div>

                {configDirty && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Save configuration changes before running the dry run.</p>}

                {plan ? (
                  <div className="mt-6 space-y-5">
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                      <table className="w-full min-w-[620px] text-left text-sm">
                        <caption className="sr-only">Dry-run setup copy counts</caption>
                        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          <tr><th scope="col" className="px-4 py-3">Setup category</th><th scope="col" className="px-4 py-3 text-right">Planned</th><th scope="col" className="px-4 py-3 text-right">Create</th><th scope="col" className="px-4 py-3 text-right">Reuse</th><th scope="col" className="px-4 py-3 text-right">Skip</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {PLAN_CATEGORY_ORDER.map(category => {
                            const count = plan.counts[category];
                            return (
                              <tr key={category} className="text-slate-700 dark:text-slate-200">
                                <th scope="row" className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{CATEGORY_LABELS[category]}</th>
                                <td className="px-4 py-3 text-right font-mono">{count.planned}</td>
                                <td className="px-4 py-3 text-right font-mono text-blue-700 dark:text-blue-300">{count.create}</td>
                                <td className="px-4 py-3 text-right font-mono text-emerald-700 dark:text-emerald-300">{count.reuse}</td>
                                <td className="px-4 py-3 text-right font-mono text-slate-500">{count.skip}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Input fingerprint</p><p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{plan.inputHash}</p></div>
                      <div className={`rounded-xl p-4 ${plan.operationalActivity.total === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-rose-50 dark:bg-rose-950/30'}`}><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Target operational activity</p><p className={`mt-2 text-2xl font-bold ${plan.operationalActivity.total === 0 ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}`}>{plan.operationalActivity.total}</p></div>
                    </div>
                    <IssueList issues={plan.issues} emptyMessage="No dry-run blockers or warnings were found." />
                  </div>
                ) : (
                  <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                    <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Run the dry run to generate a preparation fingerprint and exact setup counts.</p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm dark:border-slate-700 md:p-6" aria-labelledby="prepare-title">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex max-w-2xl items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-300"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                      <h3 id="prepare-title" className="font-bold">Atomic, idempotent setup preparation</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">Preparation uses the reviewed dry-run fingerprint. Concurrent or repeated requests reuse stable target records instead of duplicating them.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void prepareTarget()}
                    disabled={busy || !plan || !plan.canPrepare || configDirty}
                    className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {action === 'prepare' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                    {isPrepared ? 'Re-check preparation' : 'Prepare target setup'}
                  </button>
                </div>
                {!plan && <p className="mt-4 text-xs font-semibold text-slate-400">A current dry run is required before preparation.</p>}
              </section>

              {(isPrepared || validation) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6" aria-labelledby="validation-title">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><FileCheck2 className="h-5 w-5" aria-hidden="true" /></div>
                      <div>
                        <h3 id="validation-title" className="font-bold text-slate-950 dark:text-white">Prepared-state validation</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Detect source drift, preserved manual target edits, and prohibited operational activity.</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => void validatePreparation()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-60 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950/30">
                      {action === 'validate' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                      Validate prepared state
                    </button>
                  </div>

                  {validation ? (
                    <div className="mt-6 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-4">
                        {[
                          ['Verdict', validation.valid ? 'Valid' : 'Blocked', validation.valid],
                          ['Source setup', validation.sourceChanged ? 'Changed' : 'Stable', !validation.sourceChanged],
                          ['Manual edits', validation.manualChangesDetected ? 'Preserved' : 'None', true],
                          ['Activity records', String(validation.operationalActivity.total), validation.operationalActivity.total === 0],
                        ].map(([label, value, positive]) => (
                          <div key={String(label)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
                            <p className={`mt-2 text-lg font-bold ${positive ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      <IssueList issues={validation.issues} emptyMessage="Prepared setup is valid and contains no operational activity." />
                    </div>
                  ) : (
                    <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Run validation to inspect the prepared target against its recorded fingerprints.</p>
                  )}
                </section>
              )}

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-labelledby="audit-title">
                <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 md:px-6">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><History className="h-5 w-5" aria-hidden="true" /></div>
                    <div><h3 id="audit-title" className="font-bold text-slate-950 dark:text-white">Preparation audit</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Stable mappings and append-only events</p></div>
                  </div>
                  <div className="inline-flex self-start rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Preparation audit views">
                    {(['tasks', 'events'] as const).map(view => (
                      <button key={view} type="button" role="tab" aria-selected={auditView === view} onClick={() => setAuditView(view)} className={`min-h-10 rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${auditView === view ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>{humanize(view)} ({view === 'tasks' ? detail.tasks.length : detail.events.length})</button>
                    ))}
                  </div>
                </div>

                <div className="max-h-[480px] overflow-auto [scrollbar-width:thin]" role="tabpanel">
                  {auditView === 'tasks' ? (
                    detail.tasks.length === 0 ? <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Tasks appear after setup preparation.</p> : (
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <caption className="sr-only">Preparation tasks and stable source-to-target mappings</caption>
                        <thead className="sticky top-0 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th scope="col" className="px-5 py-3">Category</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3">Source</th><th scope="col" className="px-5 py-3">Target</th><th scope="col" className="px-5 py-3 text-right">Attempts</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {detail.tasks.map(task => (
                            <tr key={task.id} className="hover:bg-surface-hover"><td className="px-5 py-3 font-bold text-slate-900 dark:text-white">{CATEGORY_LABELS[task.category] || humanize(task.category)}</td><td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{humanize(task.status)}</span></td><td className="max-w-[180px] truncate px-5 py-3 font-mono text-xs text-slate-500" title={task.sourceEntityId || undefined}>{task.sourceEntityId || '—'}</td><td className="max-w-[180px] truncate px-5 py-3 font-mono text-xs text-slate-500" title={task.targetEntityId || undefined}>{task.targetEntityId || '—'}</td><td className="px-5 py-3 text-right font-mono">{task.attemptCount}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    detail.events.length === 0 ? <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No audit events recorded.</p> : (
                      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[...detail.events].reverse().map(event => (
                          <li key={event.id} className="flex gap-4 p-5 hover:bg-surface-hover md:px-6">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 font-mono text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{event.sequence}</span>
                            <div className="min-w-0"><p className="font-bold text-slate-900 dark:text-white">{humanize(event.type)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.createdAt)}{event.actorUserId ? ` · Actor ${event.actorUserId.slice(0, 8)}` : ''}</p></div>
                          </li>
                        ))}
                      </ol>
                    )
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default TermRolloverPreparationPanel;
