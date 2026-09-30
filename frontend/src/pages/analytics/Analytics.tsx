import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  HeartPulse,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import analyticsService, {
  type AnalyticsDashboard,
  type AttendanceAnalytics,
  type AttendanceAnalyticsUnavailable,
  type RevenueAnalytics,
  type SchoolHealth,
} from '../../services/analyticsService';
import {
  AttendancePanel,
  HealthPanel,
  OverviewPanel,
  RevenuePanel,
} from './AnalyticsPanels';

type AnalyticsTab = 'overview' | 'revenue' | 'attendance' | 'health';
type AnalyticsRole = 'SUPER_ADMIN' | 'BRANCH_MANAGER' | 'BURSAR' | 'TEACHER';
type PeriodDays = 30 | 90 | 180;

interface TabDefinition {
  id: AnalyticsTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  roles: AnalyticsRole[];
}

interface DatasetState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  updatedAt: string | null;
  periodDays?: PeriodDays;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'overview',
    label: 'School overview',
    shortLabel: 'Overview',
    description: 'A single view of enrollment, collections, attendance, academics, and risk.',
    icon: BarChart3,
    roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR'],
  },
  {
    id: 'revenue',
    label: 'Revenue',
    shortLabel: 'Revenue',
    description: 'Review collection momentum, payment volume, and the payment-method mix.',
    icon: WalletCards,
    roles: ['SUPER_ADMIN', 'BURSAR'],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    shortLabel: 'Attendance',
    description: 'Monitor daily trends, open alerts, and class-level attendance performance.',
    icon: Users,
    roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER'],
  },
  {
    id: 'health',
    label: 'School health',
    shortLabel: 'Health',
    description: 'Track operational health and the signals that need leadership attention.',
    icon: HeartPulse,
    roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'],
  },
];

const PERIOD_OPTIONS: { value: PeriodDays; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
];

const createDatasetState = <T,>(): DatasetState<T> => ({
  data: null,
  loading: false,
  error: null,
  notice: null,
  updatedAt: null,
});

const beginLoading = <T,>(state: DatasetState<T>): DatasetState<T> => ({
  ...state,
  loading: true,
  error: null,
  notice: state.data ? state.notice : null,
});

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const response = 'response' in error
      ? (error as { response?: { data?: { error?: string; message?: string } } }).response
      : undefined;
    const apiMessage = response?.data?.error ?? response?.data?.message;
    if (apiMessage) return apiMessage;
  }

  return error instanceof Error && error.message ? error.message : fallback;
};

const isAttendanceUnavailable = (
  value: AttendanceAnalytics | AttendanceAnalyticsUnavailable,
): value is AttendanceAnalyticsUnavailable => 'message' in value;

const getRevenueRange = (periodDays: PeriodDays) => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - periodDays + 1);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    groupBy: periodDays <= 30 ? 'day' : periodDays <= 90 ? 'week' : 'month',
  };
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return 'Waiting for data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';

  return `Updated ${new Intl.DateTimeFormat('en-ZM', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`;
};

const AnalyticsSkeleton = () => (
  <div className="space-y-5" aria-label="Loading analytics" role="status">
    <span className="sr-only">Loading analytics</span>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[0, 1, 2, 3].map(item => (
        <div key={item} className="h-36 animate-pulse rounded-[18px] border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <div className="h-9 w-9 rounded-xl bg-gray-200 dark:bg-slate-700" />
          <div className="mt-5 h-6 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
          <div className="mt-2 h-3 w-4/5 rounded bg-gray-100 dark:bg-slate-700/70" />
        </div>
      ))}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.75fr)]">
      <div className="h-96 animate-pulse rounded-[20px] border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800" />
      <div className="h-96 animate-pulse rounded-[20px] border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800" />
    </div>
  </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="grid min-h-[420px] place-items-center rounded-[20px] border border-red-200 bg-white px-6 py-12 text-center dark:border-red-900/70 dark:bg-slate-800">
    <div className="max-w-md">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
        <RotateCcw className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-gray-950 dark:text-white">This analytics view could not load</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-800"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  </div>
);

const EmptyState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="grid min-h-[420px] place-items-center rounded-[20px] border border-gray-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800">
    <div className="max-w-md">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-primary dark:bg-blue-950/40 dark:text-blue-300">
        <CalendarDays className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-gray-950 dark:text-white">No reporting period is active</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 dark:focus:ring-offset-slate-800"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Check again
      </button>
    </div>
  </div>
);

const StaleDataNotice = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
    <p>Showing the last available data. {message}</p>
    <button type="button" onClick={onRetry} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white/70 px-3 text-xs font-semibold transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-800 dark:bg-amber-950/40 dark:hover:bg-amber-950">
      <RefreshCw className="size-3.5" aria-hidden="true" />
      Retry
    </button>
  </div>
);

const Analytics = () => {
  const { user } = useAuth();
  const role = (user?.role ?? '') as AnalyticsRole;
  const availableTabs = useMemo(
    () => TAB_DEFINITIONS.filter(tab => tab.roles.includes(role)),
    [role],
  );
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(() => (
    TAB_DEFINITIONS.find(tab => tab.roles.includes(role))?.id ?? 'overview'
  ));
  const [periodDays, setPeriodDays] = useState<PeriodDays>(90);
  const [dashboard, setDashboard] = useState<DatasetState<AnalyticsDashboard>>(createDatasetState);
  const [revenue, setRevenue] = useState<DatasetState<RevenueAnalytics>>(createDatasetState);
  const [attendance, setAttendance] = useState<DatasetState<AttendanceAnalytics>>(createDatasetState);
  const [health, setHealth] = useState<DatasetState<SchoolHealth>>(createDatasetState);

  const canLoadHealth = role === 'SUPER_ADMIN' || role === 'BRANCH_MANAGER';

  useEffect(() => {
    if (!availableTabs.some(tab => tab.id === activeTab) && availableTabs[0]) {
      setActiveTab(availableTabs[0].id);
    }
  }, [activeTab, availableTabs]);

  const fetchDashboard = useCallback(async () => {
    setDashboard(previous => beginLoading(previous));
    try {
      const data = await analyticsService.getDashboard(periodDays);
      setDashboard({
        data,
        loading: false,
        error: null,
        notice: null,
        updatedAt: data.generatedAt || new Date().toISOString(),
        periodDays,
      });
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load the school overview.');
      setDashboard(previous => ({ ...previous, loading: false, error: message }));
      return false;
    }
  }, [periodDays]);

  const fetchRevenue = useCallback(async () => {
    setRevenue(previous => beginLoading(previous));
    try {
      const data = await analyticsService.getRevenue(getRevenueRange(periodDays));
      setRevenue({
        data,
        loading: false,
        error: null,
        notice: null,
        updatedAt: new Date().toISOString(),
        periodDays,
      });
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load revenue analytics.');
      setRevenue(previous => ({ ...previous, loading: false, error: message }));
      return false;
    }
  }, [periodDays]);

  const fetchAttendance = useCallback(async () => {
    setAttendance(previous => beginLoading(previous));
    try {
      const data = await analyticsService.getAttendance();
      if (isAttendanceUnavailable(data)) {
        setAttendance({
          data: null,
          loading: false,
          error: null,
          notice: data.message,
          updatedAt: new Date().toISOString(),
        });
        return true;
      }

      setAttendance({
        data,
        loading: false,
        error: null,
        notice: null,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load attendance analytics.');
      setAttendance(previous => ({ ...previous, loading: false, error: message }));
      return false;
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    setHealth(previous => beginLoading(previous));
    try {
      const data = await analyticsService.getSchoolHealth();
      setHealth({
        data,
        loading: false,
        error: null,
        notice: null,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to load school health analytics.');
      setHealth(previous => ({ ...previous, loading: false, error: message }));
      return false;
    }
  }, []);

  const loadTab = useCallback(async (tab: AnalyticsTab, announce = false) => {
    let succeeded = false;

    if (tab === 'overview') {
      const [overviewLoaded] = await Promise.all([
        fetchDashboard(),
        canLoadHealth ? fetchHealth() : Promise.resolve(false),
      ]);
      succeeded = overviewLoaded;
    } else if (tab === 'revenue') {
      succeeded = await fetchRevenue();
    } else if (tab === 'attendance') {
      succeeded = await fetchAttendance();
    } else if (tab === 'health') {
      succeeded = await fetchHealth();
    }

    if (announce) {
      if (succeeded) toast.success('Analytics refreshed');
      else toast.error('Could not refresh this analytics view');
    }
  }, [canLoadHealth, fetchAttendance, fetchDashboard, fetchHealth, fetchRevenue]);

  useEffect(() => {
    if (availableTabs.some(tab => tab.id === activeTab)) {
      void loadTab(activeTab);
    }
  }, [activeTab, availableTabs, loadTab]);

  const activeDefinition = availableTabs.find(tab => tab.id === activeTab) ?? availableTabs[0];
  const activeState: DatasetState<unknown> = activeTab === 'overview'
    ? dashboard
    : activeTab === 'revenue'
      ? revenue
      : activeTab === 'attendance'
        ? attendance
        : health;
  const showPeriodSelector = activeTab === 'overview' || activeTab === 'revenue';

  const renderPanel = () => {
    if (!activeDefinition) {
      return <ErrorState message="Your role does not have an analytics view configured." onRetry={() => window.location.reload()} />;
    }

    if (activeState.loading && !activeState.data) return <AnalyticsSkeleton />;
    if (activeState.error && !activeState.data) {
      return <ErrorState message={activeState.error} onRetry={() => void loadTab(activeTab, true)} />;
    }
    if (activeState.notice && !activeState.data) {
      return <EmptyState message={activeState.notice} onRetry={() => void loadTab(activeTab, true)} />;
    }
    if (!activeState.data) return <AnalyticsSkeleton />;

    const staleNotice = activeState.error
      ? <StaleDataNotice message={activeState.error} onRetry={() => void loadTab(activeTab, true)} />
      : null;

    if (activeTab === 'overview' && dashboard.data) {
      return (
        <div className="space-y-4">
          {staleNotice}
          {canLoadHealth && health.error && !health.data && (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300">
              The overview is available, but supplementary school-health metrics could not be refreshed.
            </div>
          )}
          <OverviewPanel dashboard={dashboard.data} health={health.data} periodDays={dashboard.periodDays ?? periodDays} />
        </div>
      );
    }

    if (activeTab === 'revenue' && revenue.data) {
      return (
        <div className="space-y-4">
          {staleNotice}
          <RevenuePanel revenue={revenue.data} periodDays={revenue.periodDays ?? periodDays} />
        </div>
      );
    }

    if (activeTab === 'attendance' && attendance.data) {
      return <div className="space-y-4">{staleNotice}<AttendancePanel attendance={attendance.data} /></div>;
    }

    if (activeTab === 'health' && health.data) {
      return <div className="space-y-4">{staleNotice}<HealthPanel health={health.data} /></div>;
    }

    return <AnalyticsSkeleton />;
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 xl:p-8">
      <section className="relative isolate overflow-hidden rounded-[24px] bg-gradient-to-br from-primary via-primary to-[#003366] px-5 py-6 text-white shadow-[0_22px_60px_-36px_rgba(0,51,102,0.7)] sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border border-white/10 bg-white/5" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 right-28 size-56 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
              <TrendingUp className="size-4 text-accent" aria-hidden="true" />
              School intelligence
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Analytics & performance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50/85 sm:text-[15px]">
              Turn live school data into focused decisions across learning, attendance, finance, and operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-100">Data status</p>
              <p className="mt-0.5 text-xs font-semibold text-white" aria-live="polite">
                {activeState.loading && activeState.data ? 'Updating data…' : formatUpdatedAt(activeState.updatedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadTab(activeTab, true)}
              disabled={activeState.loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-primary shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={`size-4 ${activeState.loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
              {activeState.loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-gray-200 bg-white p-2 shadow-[0_8px_32px_-24px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-1" role="tablist" aria-label="Analytics sections">
              {availableTabs.map(tab => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`analytics-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`analytics-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                      selected
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-slate-700 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden={true} />
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {showPeriodSelector && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-2 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 dark:border-slate-700">
              <span className="whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400">Reporting period</span>
              <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-slate-900/60" aria-label="Reporting period">
                {PERIOD_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={periodDays === option.value}
                    onClick={() => setPeriodDays(option.value)}
                    className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary ${
                      periodDays === option.value
                        ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-blue-300'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {activeDefinition && (
        <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-950 dark:text-white">{activeDefinition.label}</h2>
            <p className="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">{activeDefinition.description}</p>
          </div>
          {activeState.loading && activeState.data && (
            <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary sm:mt-0 dark:text-blue-300" role="status">
              <RefreshCw className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
              Updating
            </span>
          )}
        </div>
      )}

      <section
        id={`analytics-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`analytics-tab-${activeTab}`}
        aria-busy={activeState.loading}
        className="min-w-0"
      >
        {renderPanel()}
      </section>
    </main>
  );
};

export default Analytics;
