import { useState, useEffect } from 'react';
import {
  Brain, TrendingUp, AlertTriangle, DollarSign, Calendar,
  Download, CheckCircle,
  ArrowRight, Loader2, Wand2,
  BookOpen, BarChart3, Shield, Star, Activity
} from 'lucide-react';
import aiIntelligenceService, {
  GradeForecastResponse,
  DefaulterPredictionResponse,
  TimetableGenerationResult,
  ExamScheduleAnalysis,
  StudentForecast,
  StudentDefaultRisk,
} from '../../services/aiIntelligenceService';
import api from '../../utils/api';
import toast from 'react-hot-toast';

type Tab = 'grade-forecast' | 'fee-defaulters' | 'timetable' | 'exam-schedule';

const TABS = [
  { id: 'grade-forecast' as Tab, label: 'Grade Forecast', icon: TrendingUp, color: 'blue' },
  { id: 'fee-defaulters' as Tab, label: 'Fee Risk', icon: DollarSign, color: 'orange' },
  { id: 'timetable' as Tab, label: 'AI Timetable', icon: Calendar, color: 'purple' },
  { id: 'exam-schedule' as Tab, label: 'Exam Schedule', icon: BookOpen, color: 'green' },
];

const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const trendIcons: Record<string, JSX.Element> = {
  improving: <TrendingUp className="w-4 h-4 text-green-500" />,
  stable: <Activity className="w-4 h-4 text-blue-500" />,
  declining: <TrendingUp className="w-4 h-4 text-red-500 rotate-180" />,
};

// ─────────────────────────────────────────
// Grade Forecast Tab
// ─────────────────────────────────────────

function GradeForecastTab() {
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GradeForecastResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get('/classes').then(r => setClasses(r.data?.classes || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!classId) return;
    const cls = classes.find((c: any) => c.id === classId);
    setSubjects(cls?.subjects || []);
    setSubjectId('');
  }, [classId, classes]);

  const run = async () => {
    if (!classId) return toast.error('Please select a class');
    setLoading(true);
    try {
      const data = await aiIntelligenceService.getGradeForecast(classId, subjectId || undefined);
      setResult(data);
      toast.success('Grade forecast generated');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          Predict End-of-Term Grades
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          AI analyses current scores, assessment results, and attendance to predict each student's final grade — and flags who needs intervention now.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={classId}
            onChange={e => setClassId(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">Select Class</option>
            {classes.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="flex-1 min-w-[160px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">All Subjects</option>
            {subjects.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading || !classId}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? 'Analysing…' : 'Generate Forecast'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Class Average (Now)', value: result.classAverageCurrent != null ? `${result.classAverageCurrent}%` : 'N/A', color: 'blue' },
              { label: 'Predicted Average', value: `${result.classAveragePredicted}%`, color: 'purple' },
              { label: 'Students At Risk', value: result.atRiskCount, color: 'orange' },
              { label: 'Students Analysed', value: result.students.length, color: 'green' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
                <div className={`text-2xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>{card.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Class insights */}
          {result.classInsights && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Brain className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-300">{result.classInsights}</p>
              </div>
            </div>
          )}

          {/* Student table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-white">Student Forecasts — {result.className}</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {['Student', 'Current Avg', 'Predicted', 'Grade', 'Trend', 'Risk', 'Confidence'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {result.students.map((s: StudentForecast) => (
                    <>
                      <tr
                        key={s.studentId}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => setExpanded(expanded === s.studentId ? null : s.studentId)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.studentName}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.currentAverage != null ? `${s.currentAverage}%` : '—'}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{s.predictedScore}%</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200">{s.predictedGrade}</span>
                        </td>
                        <td className="px-4 py-3">{trendIcons[s.trend] || null}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${riskColors[s.riskLevel]}`}>{s.riskLevel}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize text-gray-500 dark:text-gray-400">{s.confidence}</span>
                        </td>
                      </tr>
                      {expanded === s.studentId && (
                        <tr key={`${s.studentId}-expanded`} className="bg-blue-50/50 dark:bg-blue-900/10">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {s.interventions.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Recommended Interventions</div>
                                  <ul className="space-y-1">
                                    {s.interventions.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-400">
                                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {s.strengths.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Strengths</div>
                                  <ul className="space-y-1">
                                    {s.strengths.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                                        <Star className="w-3 h-3 mt-0.5 flex-shrink-0" /> {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Fee Defaulter Tab
// ─────────────────────────────────────────

function FeeDefaulterTab() {
  const [terms, setTerms] = useState<any[]>([]);
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DefaulterPredictionResponse | null>(null);
  const [riskFilter, setRiskFilter] = useState('ALL');

  useEffect(() => {
    api.get('/terms').then(r => {
      const list = r.data?.terms || r.data || [];
      setTerms(list);
      const active = list.find((t: any) => t.isActive);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true);
    try {
      const data = await aiIntelligenceService.getFeeDefaulters(termId || undefined);
      setResult(data);
      toast.success('Fee risk analysis complete');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const filtered = result?.students.filter(s =>
    riskFilter === 'ALL' || s.riskLevel === riskFilter.toLowerCase()
  ) || [];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-500" />
          Fee Defaulter Risk Prediction
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          AI scores each student's likelihood of defaulting based on payment history, prior terms, and outstanding balances.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={termId}
            onChange={e => setTermId(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">Active Term</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            {loading ? 'Analysing…' : 'Run Prediction'}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Critical Risk', value: result.criticalCount, color: 'red' },
              { label: 'High Risk', value: result.highCount, color: 'orange' },
              { label: 'Medium Risk', value: result.mediumCount, color: 'yellow' },
              { label: 'Low Risk', value: result.lowCount, color: 'green' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
                <div className={`text-2xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>{card.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Brain className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800 dark:text-blue-300">{result.executiveSummary}</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase">Projected Collection</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{result.projectedCollectionRate}%</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Outstanding: K{result.totalOutstanding.toLocaleString()}
              </div>
            </div>
          </div>

          {result.recommendedCampaigns.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recommended Collection Campaigns</div>
              <div className="flex flex-wrap gap-2">
                {result.recommendedCampaigns.map((c, i) => (
                  <span key={i} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs border border-blue-200 dark:border-blue-700">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter + Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
              <h4 className="font-semibold text-gray-900 dark:text-white">Student Risk Profiles</h4>
              <div className="flex gap-2">
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
                  <button
                    key={f}
                    onClick={() => setRiskFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${riskFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {['Student', 'Class', 'Paid', 'Outstanding', 'Risk', 'Priority', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filtered.map((s: StudentDefaultRisk) => (
                    <tr key={s.studentId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{s.studentName}</div>
                        {s.contactDetails.phone && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{s.contactDetails.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.className}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 dark:text-white font-medium">K{s.totalPaid.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{s.paymentCompletionRate}% complete</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">
                        K{s.outstanding.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${riskColors[s.riskLevel]}`}>{s.riskLevel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          s.actionPriority === 'immediate' ? 'bg-red-100 text-red-700' :
                          s.actionPriority === 'this-week' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{s.actionPriority}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-[200px]">{s.recommendedAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// AI Timetable Tab
// ─────────────────────────────────────────

function TimetableTab() {
  const [terms, setTerms] = useState<any[]>([]);
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TimetableGenerationResult | null>(null);
  const [viewClass, setViewClass] = useState('');

  useEffect(() => {
    api.get('/terms').then(r => {
      const list = r.data?.terms || r.data || [];
      setTerms(list);
      const active = list.find((t: any) => t.isActive);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  const generate = async () => {
    if (!termId) return toast.error('Select a term');
    setLoading(true);
    try {
      const data = await aiIntelligenceService.generateTimetable(termId);
      setResult(data);
      const classes = [...new Set(data.periods.map(p => p.className))];
      if (classes.length > 0) setViewClass(classes[0]);
      toast.success(`Generated ${data.totalPeriods} periods for ${data.classesScheduled} classes`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const saveData = await aiIntelligenceService.saveTimetable(result.periods, result.termId, result.termName, false);
      toast.success(`Saved ${saveData.created} timetable periods to database`);
      if (saveData.errors.length > 0) {
        toast.error(`${saveData.errors.length} periods had errors`);
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  const classPeriods = result?.periods.filter(p => p.className === viewClass) || [];
  const classes = result ? [...new Set(result.periods.map(p => p.className))].sort() : [];

  const periodsByDayAndNumber: Record<string, Record<number, any>> = {};
  for (const p of classPeriods) {
    if (!periodsByDayAndNumber[p.dayOfWeek]) periodsByDayAndNumber[p.dayOfWeek] = {};
    periodsByDayAndNumber[p.dayOfWeek][p.periodNumber] = p;
  }

  const allPeriodNumbers = [...new Set(classPeriods.map(p => p.periodNumber))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-500" />
          AI Timetable Generator
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          AI generates a conflict-free weekly timetable respecting teacher assignments, subject hours, and school-day constraints.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={termId}
            onChange={e => setTermId(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading || !termId}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate Timetable'}
          </button>
          {result && (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save to Database'}
            </button>
          )}
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Classes Scheduled', value: result.classesScheduled, color: 'purple' },
              { label: 'Total Periods', value: result.totalPeriods, color: 'blue' },
              { label: 'Conflicts Detected', value: result.conflicts.length, color: result.conflicts.length > 0 ? 'orange' : 'green' },
              { label: 'Term', value: result.termName, color: 'gray' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
                <div className={`text-2xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>{card.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {result.conflicts.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-4">
              <div className="font-semibold text-orange-800 dark:text-orange-300 mb-2 text-sm">Conflicts / Warnings</div>
              <ul className="space-y-1">
                {result.conflicts.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Class selector + grid view */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 flex-wrap">
              <h4 className="font-semibold text-gray-900 dark:text-white">Weekly View</h4>
              <select
                value={viewClass}
                onChange={e => setViewClass(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white"
              >
                {classes.map(cls => <option key={cls} value={cls}>{cls}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Period</th>
                    {DAYS.map(d => (
                      <th key={d} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">{d.charAt(0) + d.slice(1).toLowerCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {allPeriodNumbers.map(pn => (
                    <tr key={pn} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">P{pn}</td>
                      {DAYS.map(day => {
                        const period = periodsByDayAndNumber[day]?.[pn];
                        return (
                          <td key={day} className="px-3 py-2">
                            {period ? (
                              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded p-1.5">
                                <div className="font-semibold text-purple-800 dark:text-purple-300">{period.subjectName}</div>
                                <div className="text-purple-600 dark:text-purple-400 mt-0.5">{period.teacherName}</div>
                                <div className="text-gray-400 mt-0.5">{period.startTime}–{period.endTime}</div>
                              </div>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Exam Schedule Tab
// ─────────────────────────────────────────

function ExamScheduleTab() {
  const [terms, setTerms] = useState<any[]>([]);
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExamScheduleAnalysis | null>(null);

  useEffect(() => {
    api.get('/terms').then(r => {
      const list = r.data?.terms || r.data || [];
      setTerms(list);
      const active = list.find((t: any) => t.isActive);
      if (active) setTermId(active.id);
    }).catch(() => {});
  }, []);

  const run = async () => {
    if (!termId) return toast.error('Select a term');
    setLoading(true);
    try {
      const data = await aiIntelligenceService.analyseExamSchedule(termId);
      setResult(data);
      toast.success('Exam schedule analysed');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const severityColors: Record<string, string> = {
    low: 'bg-yellow-100 text-yellow-700',
    medium: 'bg-orange-100 text-orange-700',
    high: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-500" />
          Smart Exam Schedule Checker
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          AI detects double-bookings, overloaded weeks, and too-close assessments — then suggests an optimised calendar.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={termId}
            onChange={e => setTermId(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}{t.isActive ? ' (Active)' : ''}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={loading || !termId}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {loading ? 'Analysing…' : 'Analyse Schedule'}
          </button>
        </div>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Assessments', value: result.totalAssessments, color: 'blue' },
              { label: 'Conflicts Found', value: result.conflictsFound, color: result.conflictsFound > 0 ? 'red' : 'green' },
              { label: 'Overloaded Weeks', value: result.overloadedWeeks.length, color: result.overloadedWeeks.length > 0 ? 'orange' : 'green' },
              { label: 'Suggestions', value: result.suggestions.length, color: 'purple' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
                <div className={`text-2xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>{card.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {result.executiveSummary && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Brain className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">{result.executiveSummary}</p>
              </div>
            </div>
          )}

          {result.conflicts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" /> Conflicts Detected
                </h4>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {result.conflicts.map((c, i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${severityColors[c.severity]}`}>{c.severity.toUpperCase()}</span>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{c.type.replace('_', ' ')}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{c.description}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Affected: {c.affectedClasses.join(', ')}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{c.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" /> Suggested Fixes
                </h4>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {result.suggestions.map((s, i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="font-medium text-gray-900 dark:text-white flex-1">{s.assessmentTitle}</div>
                      <div className="text-gray-500 dark:text-gray-400 line-through">{s.currentDate}</div>
                      <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="text-green-600 dark:text-green-400 font-medium">{s.suggestedDate}</div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {s.className} — {s.subjectName} · {s.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────

export default function AIIntelligenceHub() {
  const [activeTab, setActiveTab] = useState<Tab>('grade-forecast');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Brain className="w-6 h-6 text-white" />
            </div>
            AI Intelligence Hub
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Predictive analytics, smart scheduling, and AI-powered academic insights
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? `bg-${tab.color}-600 text-white shadow-md`
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'grade-forecast' && <GradeForecastTab />}
      {activeTab === 'fee-defaulters' && <FeeDefaulterTab />}
      {activeTab === 'timetable' && <TimetableTab />}
      {activeTab === 'exam-schedule' && <ExamScheduleTab />}
    </div>
  );
}
