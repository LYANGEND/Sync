import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ElementType } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Database,
  Download,
  FileArchive,
  FileCheck2,
  FileWarning,
  Fingerprint,
  GraduationCap,
  History,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  Merge,
  RefreshCw,
  School,
  ShieldCheck,
  Upload,
  UserRoundX,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import dataManagementService, {
  type ArchiveImportResult,
  type ArchivePreview,
  type DataManagementOverview,
} from '../../services/dataManagementService';
import './DataManagement.css';

const numberFormatter = new Intl.NumberFormat();

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string, includeTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

function modelLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function detailText(details: Record<string, unknown> | null, key: string): string | null {
  const value = details?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

interface StatCardProps {
  icon: ElementType;
  label: string;
  value: number;
  detail: string;
  tone: 'blue' | 'amber' | 'emerald' | 'slate';
}

const statToneClasses: Record<StatCardProps['tone'], string> = {
  blue: 'data-vault-stat-primary',
  amber: 'data-vault-stat-accent',
  emerald: 'data-vault-stat-success',
  slate: 'data-vault-stat-neutral',
};

function StatCard({ icon: Icon, label, value, detail, tone }: StatCardProps) {
  return (
    <article className="data-vault-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{formatNumber(value)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${statToneClasses[tone]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

function LoadingStatCard() {
  return (
    <div className="h-[126px] animate-pulse rounded-2xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 h-7 w-14 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-3 w-28 rounded bg-slate-100 dark:bg-slate-700/70" />
    </div>
  );
}

const DataManagement = () => {
  const { notify, prompt } = useAppDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRequestRef = useRef(0);
  const [overview, setOverview] = useState<DataManagementOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ArchivePreview | null>(null);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadOverview = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingOverview(true);
    setOverviewError(null);
    try {
      setOverview(await dataManagementService.getOverview());
    } catch (error) {
      setOverviewError(await dataManagementService.errorMessage(error, 'Could not load the school data summary.'));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const stats = useMemo<StatCardProps[]>(() => overview ? [
    { icon: GraduationCap, label: 'Students', value: overview.counts.students, detail: 'Learner records', tone: 'blue' },
    { icon: Users, label: 'Users', value: overview.counts.users, detail: 'School accounts', tone: 'slate' },
    { icon: School, label: 'Classes', value: overview.counts.classes, detail: 'Teaching groups', tone: 'amber' },
    { icon: BookOpen, label: 'Subjects', value: overview.counts.subjects, detail: 'Curriculum areas', tone: 'emerald' },
    { icon: Building2, label: 'Branches', value: overview.counts.branches, detail: 'School locations', tone: 'slate' },
    { icon: CreditCard, label: 'Payments', value: overview.counts.payments, detail: 'Finance records', tone: 'emerald' },
    { icon: ClipboardCheck, label: 'Attendance', value: overview.counts.attendance, detail: 'Register entries', tone: 'blue' },
    { icon: Layers, label: 'Assessments', value: overview.counts.assessments, detail: 'Academic records', tone: 'amber' },
  ] : [], [overview]);

  const reviewArchive = useCallback(async (file: File) => {
    const requestId = ++previewRequestRef.current;
    setIsPreviewing(true);
    setActionError(null);
    setPreview(null);
    try {
      const nextPreview = await dataManagementService.previewArchive(file);
      if (previewRequestRef.current === requestId) setPreview(nextPreview);
    } catch (error) {
      if (previewRequestRef.current === requestId) {
        setActionError(await dataManagementService.errorMessage(error, 'The archive could not be reviewed.'));
      }
    } finally {
      if (previewRequestRef.current === requestId) setIsPreviewing(false);
    }
  }, []);

  const selectArchive = useCallback((file?: File) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const validName = lowerName.endsWith('.sync.json.gz') || lowerName.endsWith('.json.gz') || lowerName.endsWith('.json') || lowerName.endsWith('.gz');
    const maxMb = overview?.archive.maxUploadMb || 50;

    if (!validName) {
      notify('Select a Sync archive ending in .sync.json.gz, .json.gz, .json, or .gz.', 'warning');
      return;
    }
    if (file.size === 0) {
      notify('The selected archive is empty.', 'warning');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      notify(`The selected archive exceeds the ${maxMb} MB limit.`, 'error');
      return;
    }

    setSelectedFile(file);
    setImportResult(null);
    void reviewArchive(file);
  }, [notify, overview?.archive.maxUploadMb, reviewArchive]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectArchive(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectArchive(event.dataTransfer.files?.[0]);
  };

  const clearSelection = () => {
    previewRequestRef.current += 1;
    setSelectedFile(null);
    setPreview(null);
    setImportResult(null);
    setActionError(null);
    setIsPreviewing(false);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setActionError(null);
    try {
      const archive = await dataManagementService.exportArchive();
      const objectUrl = URL.createObjectURL(archive.blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = archive.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      notify(`Archive ready: ${formatNumber(archive.recordCount)} records across ${formatNumber(archive.modelCount)} data groups.`, 'success', 4200);
      void loadOverview(false);
    } catch (error) {
      const message = await dataManagementService.errorMessage(error, 'The school archive could not be exported.');
      setActionError(message);
      notify(message, 'error', 4200);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !preview?.canImport) return;

    const phrase = await prompt({
      title: 'Authorize school data merge',
      message: `Type IMPORT to merge ${formatNumber(preview.totalRecords)} records into ${preview.destinationSchoolName}. The operation runs in one transaction.`,
      placeholder: 'Type IMPORT',
      confirmText: 'Authorize import',
      cancelText: 'Keep reviewing',
    });
    if (phrase !== 'IMPORT') {
      if (phrase !== null) notify('The confirmation phrase must be exactly IMPORT.', 'warning');
      return;
    }

    setIsImporting(true);
    setActionError(null);
    try {
      const result = await dataManagementService.importArchive(selectedFile, preview.checksum);
      setImportResult(result);
      notify(`Import complete: ${formatNumber(result.created)} created and ${formatNumber(result.updated)} updated.`, 'success', 5000);
      void loadOverview(false);
    } catch (error) {
      const message = await dataManagementService.errorMessage(error, 'The import failed. No partial changes were kept.');
      setActionError(message);
      notify(message, 'error', 5000);
    } finally {
      setIsImporting(false);
    }
  };

  const maxPreviewCount = Math.max(1, ...(preview?.topRecordCounts.map(item => item.count) || [1]));

  return (
    <div className="data-vault-page p-4 pb-24 md:p-6 md:pb-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="data-vault-shell">
          <div className="data-vault-intro">
            <div>
              <p className="data-vault-brand-kicker text-xs font-bold uppercase tracking-[0.16em]">School data control</p>
              <h1 className="data-vault-title mt-2 text-3xl text-slate-950 dark:text-white">Data management</h1>
            </div>
            <div className="data-vault-intro-badges">
              <span className="data-vault-badge data-vault-badge-soft">Protected sync</span>
              <span className="data-vault-badge">SHA-256 verified</span>
            </div>
          </div>
        </section>

        {overviewError && (
          <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Data summary unavailable</p>
                <p className="mt-1 text-sm text-rose-700 dark:text-rose-200">{overviewError}</p>
              </div>
            </div>
            <button type="button" onClick={() => void loadOverview()} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-800">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        <section aria-labelledby="record-ledger-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="data-vault-brand-kicker text-xs font-bold uppercase tracking-[0.16em]">Live record ledger</p>
              <h1 id="record-ledger-heading" className="mt-1 text-lg font-bold text-slate-950 dark:text-white">What the vault currently holds</h1>
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loadingOverview}
              aria-label="Refresh school data summary"
              className="data-vault-refresh flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RefreshCw className={`h-4 w-4 ${loadingOverview ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {loadingOverview && !overview
              ? Array.from({ length: 8 }, (_, index) => <LoadingStatCard key={index} />)
              : stats.map(stat => <StatCard key={stat.label} {...stat} />)}
          </div>
        </section>

        {actionError && (
          <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-rose-900 shadow-sm dark:border-rose-900/70 dark:bg-slate-800 dark:text-rose-100">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">The vault stopped this action</p>
              <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{actionError}</p>
            </div>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <section aria-labelledby="export-heading" className="data-vault-card relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            <div className="data-vault-topline absolute inset-x-0 top-0 h-1" />
            <div className="flex items-start justify-between gap-4">
              <div className="data-vault-brand-icon flex h-12 w-12 items-center justify-center rounded-xl border">
                <Archive className="h-6 w-6" aria-hidden="true" />
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">SHA-256 sealed</span>
            </div>
            <p className="data-vault-accent-kicker mt-6 text-xs font-bold uppercase tracking-[0.16em]">Outbound archive</p>
            <h2 id="export-heading" className="data-vault-title mt-2 text-2xl text-slate-950 dark:text-white">Create a school archive</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Package the school&rsquo;s structured records into one compressed file for safekeeping or transfer to another Sync installation.
            </p>

            <div className="mt-6 space-y-3 border-y border-slate-200/80 py-5 dark:border-slate-700">
              {[
                { icon: Database, text: `${overview?.archive.transferableModels || 0} related data groups, exported together` },
                { icon: KeyRound, text: 'Passwords and service-provider secrets excluded' },
                { icon: Fingerprint, text: 'Integrity checksum embedded and verified on import' },
                { icon: FileArchive, text: 'Compact .sync.json.gz portable archive' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || !overview}
              className="data-vault-primary-button mt-6 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
              {isExporting ? 'Sealing archive…' : 'Export school data'}
            </button>
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">The file downloads only after the server finishes sealing it.</p>
          </section>

          <section aria-labelledby="import-heading" className="data-vault-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="data-vault-brand-kicker text-xs font-bold uppercase tracking-[0.16em]">Inbound archive</p>
                <h2 id="import-heading" className="data-vault-title mt-2 text-2xl text-slate-950 dark:text-white">Review before you merge</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Nothing is written during review. The checksum, format, relationships, and manifest are inspected first.</p>
              </div>
              <div className="data-vault-brand-pill flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold">
                <Merge className="h-4 w-4" aria-hidden="true" /> Merge, never replace
              </div>
            </div>

            <input ref={fileInputRef} id="school-archive-file" type="file" accept=".sync.json.gz,.json.gz,.json,.gz,application/gzip,application/json" onChange={handleFileChange} className="sr-only" />

            {!selectedFile ? (
              <div
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
                onDrop={handleDrop}
                className={`data-vault-dropzone mt-6 rounded-2xl border-2 border-dashed px-5 py-9 text-center transition-colors ${isDragging ? 'data-vault-dropzone-active' : 'border-slate-300 bg-slate-50/70 dark:border-slate-600 dark:bg-slate-900/40'}`}
              >
                <div className="data-vault-brand-icon mx-auto flex h-14 w-14 items-center justify-center rounded-xl border shadow-sm">
                  <Upload className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-4 font-bold text-slate-900 dark:text-white">Drop a school archive here</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Up to {overview?.archive.maxUploadMb || 50} MB · compressed JSON</p>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="data-vault-outline-button mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
                  Browse archives
                </button>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 dark:bg-slate-900/50">
                  <div className="data-vault-brand-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border">
                    <FileArchive className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{selectedFile.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <button type="button" onClick={clearSelection} disabled={isImporting} aria-label="Remove selected archive" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-white">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                {isPreviewing && (
                  <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center" aria-live="polite">
                    <Loader2 className="data-vault-brand-kicker h-8 w-8 animate-spin" aria-hidden="true" />
                    <p className="mt-4 font-semibold text-slate-900 dark:text-white">Inspecting archive integrity</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Checking the seal, manifest, and relationships…</p>
                  </div>
                )}

                {!isPreviewing && !preview && (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-300">Review did not complete.</p>
                    <button type="button" onClick={() => void reviewArchive(selectedFile)} className="data-vault-primary-button mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" /> Review again
                    </button>
                  </div>
                )}

                {preview && !isPreviewing && (
                  <div className="p-4 sm:p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-emerald-900 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-100 dark:ring-emerald-900/70">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                        <div><p className="text-xs font-bold uppercase tracking-wider">Integrity</p><p className="text-sm">Checksum verified</p></div>
                      </div>
                      <div className={`flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset ${preview.schemaMatches ? 'data-vault-brand-pill' : 'bg-amber-50 text-amber-900 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-900/70'}`}>
                        {preview.schemaMatches ? <FileCheck2 className="h-5 w-5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />}
                        <div><p className="text-xs font-bold uppercase tracking-wider">Schema</p><p className="text-sm">{preview.schemaMatches ? 'Exact match' : 'Compatibility mode'}</p></div>
                      </div>
                    </div>

                    <div className="data-vault-route-panel mt-4 grid items-center gap-3 rounded-2xl p-4 text-white sm:grid-cols-[1fr_auto_1fr]">
                      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Archive source</p><p className="mt-1 truncate text-sm font-semibold" title={preview.sourceSchoolName}>{preview.sourceSchoolName}</p></div>
                      <ArrowRight className="hidden h-5 w-5 text-orange-200 sm:block" aria-hidden="true" />
                      <div className="min-w-0 sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Merge destination</p><p className="mt-1 truncate text-sm font-semibold" title={preview.destinationSchoolName}>{preview.destinationSchoolName}</p></div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Records', value: preview.totalRecords },
                        { label: 'Data groups', value: preview.modelCount },
                        { label: 'File refs', value: preview.fileReferenceCount },
                      ].map(item => (
                        <div key={item.label} className="rounded-xl border border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          <p className="text-lg font-bold text-slate-950 dark:text-white">{formatNumber(item.value)}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5">
                      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Largest record groups</h3><span className="text-xs text-slate-500 dark:text-slate-400">Created {formatDate(preview.createdAt, false)}</span></div>
                      <div className="space-y-2.5">
                        {preview.topRecordCounts.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">This archive contains no records.</p> : preview.topRecordCounts.map(item => (
                          <div key={item.model} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                            <div className="min-w-0"><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium text-slate-700 dark:text-slate-200">{modelLabel(item.model)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="data-vault-brand-progress h-full rounded-full" style={{ width: `${Math.max(4, (item.count / maxPreviewCount) * 100)}%` }} /></div></div>
                            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatNumber(item.count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="flex items-start gap-2"><Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Archive fingerprint</p><p className="mt-1 break-all font-mono text-[11px] leading-5 text-slate-700 dark:text-slate-300">{preview.checksum}</p></div></div>
                    </div>

                    {preview.warnings.length > 0 && (
                      <div className="mt-4 space-y-2" aria-label="Import warnings">
                        {preview.warnings.map((warning, index) => (
                          <div key={`${warning}-${index}`} className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-900/60">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {importResult ? (
                      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30" aria-live="polite">
                        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Check className="h-5 w-5" aria-hidden="true" /></div><div><h3 className="font-bold text-emerald-950 dark:text-emerald-100">Transactional merge complete</h3><p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">{formatNumber(importResult.created)} created · {formatNumber(importResult.updated)} updated · {formatNumber(importResult.linked)} links restored</p>{importResult.disabledUsers > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-100"><UserRoundX className="h-4 w-4" aria-hidden="true" /> {formatNumber(importResult.disabledUsers)} new user account(s) safely disabled</p>}</div></div>
                        <button type="button" onClick={clearSelection} className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">Choose another archive</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleImport}
                        disabled={isImporting || !preview.canImport}
                        className="data-vault-primary-button mt-5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isImporting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
                        {isImporting ? 'Merging in one transaction…' : 'Authorize and import'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <section aria-labelledby="controls-heading" className="data-vault-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-700 sm:px-7">
            <p className="data-vault-brand-kicker text-xs font-bold uppercase tracking-[0.16em]">Built-in safeguards</p>
            <h2 id="controls-heading" className="data-vault-title mt-2 text-2xl text-slate-950 dark:text-white">Every transfer has guardrails</h2>
          </div>
          <div className="grid divide-y divide-slate-200 dark:divide-slate-700 md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              { icon: ShieldCheck, title: 'School boundary enforced', body: 'Reads and writes are scoped to the signed-in administrator’s school. Platform accounts are excluded.' },
              { icon: Merge, title: 'Atomic relationship merge', body: 'Natural-key matches are updated, new IDs are remapped safely, and every change commits together or rolls back.' },
              { icon: UserRoundX, title: 'Credentials stay private', body: 'Passwords and provider keys are never transferred. New user accounts arrive inactive with an unknown password.' },
            ].map(({ icon: Icon, title, body }) => (
              <article key={title} className="p-6"><div className="data-vault-brand-icon flex h-10 w-10 items-center justify-center rounded-xl border"><Icon className="h-5 w-5" aria-hidden="true" /></div><h3 className="mt-4 font-bold text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p></article>
            ))}
          </div>
        </section>

        <section aria-labelledby="activity-heading" className="data-vault-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="data-vault-accent-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"><History className="h-5 w-5" aria-hidden="true" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Custody log</p><h2 id="activity-heading" className="data-vault-title mt-1 text-2xl text-slate-950 dark:text-white">Recent archive activity</h2></div>
          </div>

          {!overview?.recentActivity.length ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center dark:border-slate-600"><CalendarClock className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">No transfers recorded yet</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Completed exports and imports will appear here.</p></div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {overview.recentActivity.map(entry => {
                  const isExport = entry.action === 'SCHOOL_DATA_EXPORT';
                  const records = detailText(entry.details, isExport ? 'totalRecords' : 'totalProcessed');
                  const filename = detailText(entry.details, 'filename');
                  const sourceSchool = detailText(entry.details, 'sourceSchoolName');
                  return (
                    <div key={entry.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isExport ? 'data-vault-export-activity' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{isExport ? <Download className="h-4 w-4" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}</div>
                      <div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-white">{isExport ? 'School archive exported' : 'School archive imported'}</p><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{filename || (sourceSchool ? `Source: ${sourceSchool}` : 'Verified school data transfer')}{records ? ` · ${formatNumber(Number(records))} records` : ''}</p></div>
                      <div className="text-left sm:text-right"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatDate(entry.createdAt)}</p><p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 sm:justify-end dark:text-emerald-300"><Link2 className="h-3 w-3" aria-hidden="true" /> Audited</p></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DataManagement;
