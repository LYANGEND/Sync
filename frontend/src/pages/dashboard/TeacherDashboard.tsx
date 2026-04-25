import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, Search, Calendar, Activity, BookOpen, Sparkles, Play, Check, Edit3, Target, Loader2, X, Eye, ClipboardCheck, BrainCircuit, ChevronRight } from 'lucide-react';
import { PullToRefresh } from '../../components/mobile';
import api from '../../utils/api';
import { Link } from 'react-router-dom';

// Base props from the existing Dashboard stats
interface TeacherStats {
  stats: {
    totalStudents: number;
    totalClasses: number;
    todayScheduleCount: number;
  };
  myClasses: {
    id: string;
    name: string;
    gradeLevel: number;
    _count: { students: number };
  }[];
  todaySchedule: {
    id: string;
    startTime: string;
    endTime: string;
    class: { name: string };
    subject: { name: string; code: string };
  }[];
  recentAssessments: {
    id: string;
    title: string;
    date: string;
    class: { name: string };
    subject: { name: string };
    _count: { results: number };
  }[];
}

interface TeacherDashboardProps {
  data: TeacherStats;
  user: any;
  onRefresh: () => Promise<void>;
}

// New Intelligence Interfaces
interface LearningObjective {
  id: string;
  masteryScore: number;
  status: 'SECURE' | 'FRAGILE' | 'URGENT';
  student?: { firstName: string, lastName: string };
  subTopic: { title: string, topic: { title: string } };
}

interface StudentQueueItem {
  studentId: string;
  name: string;
  className: string;
  urgentCount: number;
  fragileCount: number;
  weakTopics: string[];
}

interface PendingAction {
  id: string;
  actionType: string;
  title: string;
  description: string;
  draftPayload?: any;
  class?: { name: string };
  status: string;
}

interface LessonActivity {
  type: string;
  title: string;
  description: string;
  durationMinutes: number;
  materials?: string[];
  differentiation?: string;
  _aiGenerated?: boolean;
}

interface AdaptedLesson {
  id: string;
  title: string;
  objective: string;
  activities: LessonActivity[];
  targetStudentIds: string[];
  status: 'DRAFT' | 'READY' | 'DEPLOYED' | 'COMPLETED';
  scheduledDate?: string;
  sourceActionId?: string;
  class: { name: string };
  subTopic: { title: string; topic: { title: string } };
  createdAt: string;
  updatedAt: string;
}

export default function TeacherDashboard({ data, user, onRefresh }: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<'INSIGHTS' | 'PLAN' | 'ASSESS'>(() => {
    const savedTab = localStorage.getItem('teacher-workspace-active-tab');
    return savedTab === 'PLAN' || savedTab === 'ASSESS' ? savedTab : 'INSIGHTS';
  });
  
  // Intelligence State
  const [objectives, setObjectives] = useState<LearningObjective[]>([]);
  const [studentQueue, setStudentQueue] = useState<StudentQueueItem[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [selectedObjective, setSelectedObjective] = useState<LearningObjective | null>(null);

  // Adapt Workspace State
  const [lessons, setLessons] = useState<AdaptedLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [generatingActivities, setGeneratingActivities] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [lessonStatusFilter, setLessonStatusFilter] = useState<'ALL' | 'DRAFT' | 'READY' | 'DEPLOYED' | 'COMPLETED'>('ALL');
  const [lessonSearch, setLessonSearch] = useState('');

  const fetchIntelligence = async () => {
    setLoadingIntelligence(true);
    try {
      const [objRes, queueRes, actionsRes] = await Promise.all([
        api.get('/teaching-hub/learning-objectives'),
        api.get('/teaching-hub/student-queue'),
        api.get('/teaching-hub/pending-actions')
      ]);
      setObjectives(objRes.data.data);
      setStudentQueue(queueRes.data.data);
      setPendingActions(actionsRes.data.data);
    } catch (error) {
      console.error('Error fetching intelligence:', error);
    } finally {
      setLoadingIntelligence(false);
    }
  };

  const fetchLessons = async () => {
    setLoadingLessons(true);
    try {
      const res = await api.get('/adapt-workspace/lessons');
      setLessons(res.data.data);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoadingLessons(false);
    }
  };

  // ── Action Handlers ────────────────────────────────────────────────

  const handleApproveAction = async (actionId: string) => {
    setActionBusy(actionId);
    try {
      await api.post('/teaching-hub/resolve-action', { actionId, status: 'APPROVED' });
      // Immediately create a lesson from the approved action
      await api.post('/adapt-workspace/create-from-action', { actionId });
      await Promise.all([fetchIntelligence(), fetchLessons()]);
      setActiveTab('PLAN'); // Switch to show the new lesson
    } catch (error) {
      console.error('Error approving action:', error);
    } finally {
      setActionBusy(null);
    }
  };

  const handleDismissAction = async (actionId: string) => {
    setActionBusy(actionId);
    try {
      await api.post('/teaching-hub/resolve-action', { actionId, status: 'DISMISSED' });
      await fetchIntelligence();
    } catch (error) {
      console.error('Error dismissing action:', error);
    } finally {
      setActionBusy(null);
    }
  };

  const handleGenerateActivities = async (lessonId: string) => {
    setGeneratingActivities(lessonId);
    try {
      const res = await api.post(`/adapt-workspace/lessons/${lessonId}/generate-activities`, {});
      setLessons(prev => prev.map(l => l.id === lessonId ? res.data.data : l));
    } catch (error) {
      console.error('Error generating activities:', error);
    } finally {
      setGeneratingActivities(null);
    }
  };

  const handleStatusChange = async (lessonId: string, status: string) => {
    try {
      const res = await api.patch(`/adapt-workspace/lessons/${lessonId}/status`, { status });
      setLessons(prev => prev.map(l => l.id === lessonId ? res.data.data : l));
    } catch (error) {
      console.error('Error changing status:', error);
    }
  };

  useEffect(() => {
    fetchIntelligence();
    fetchLessons();
  }, []);

  useEffect(() => {
    localStorage.setItem('teacher-workspace-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!selectedObjective && objectives.length > 0) {
      setSelectedObjective(objectives[0]);
    }
  }, [objectives, selectedObjective]);

  const handleRefresh = async () => {
    await Promise.all([onRefresh(), fetchIntelligence(), fetchLessons()]);
  };

  const stats = data.stats;
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nextLesson = data.todaySchedule.find(period => {
    const [hours, minutes] = period.startTime.split(':').map(Number);
    return (hours * 60 + minutes) >= nowMinutes;
  }) || data.todaySchedule[0];
  const draftLessonsCount = lessons.filter(lesson => lesson.status === 'DRAFT').length;
  const readyLessonsCount = lessons.filter(lesson => lesson.status === 'READY').length;
  const urgentLearnersCount = studentQueue.reduce((sum, student) => sum + student.urgentCount, 0);
  const supportQueueCount = studentQueue.length;
  const totalRecentResults = data.recentAssessments.reduce((sum, assessment) => sum + assessment._count.results, 0);
  const filteredLessons = lessons.filter((lesson) => {
    const matchesStatus = lessonStatusFilter === 'ALL' || lesson.status === lessonStatusFilter;
    const searchText = lessonSearch.trim().toLowerCase();
    const matchesSearch = !searchText || [
      lesson.title,
      lesson.objective,
      lesson.class.name,
      lesson.subTopic.title,
      lesson.subTopic.topic.title,
    ].some(value => value.toLowerCase().includes(searchText));

    return matchesStatus && matchesSearch;
  });

  const getObjectiveActionLabel = (objective: LearningObjective) => {
    if (objective.status === 'URGENT') return 'Immediate reteach recommended';
    if (objective.status === 'FRAGILE') return 'Reinforce in the next lesson';
    return 'Maintain through practice and checks';
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-gray-50/50 dark:bg-slate-900/50">
      <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24">
        
        {/* Header & Quick Context */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Teacher Workspace</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Welcome back, {user?.fullName?.split(' ')[0]}. Here is your instructional intelligence.</p>
          </div>
          
          {/* Quick Stats Base Layer */}
          <div className="flex gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
             <div className="px-3 py-1 flex flex-col items-center border-r border-gray-100 dark:border-slate-700">
               <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Students</span>
               <span className="font-bold text-gray-900 dark:text-white">{stats.totalStudents}</span>
             </div>
             <div className="px-3 py-1 flex flex-col items-center border-r border-gray-100 dark:border-slate-700">
               <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Classes</span>
               <span className="font-bold text-gray-900 dark:text-white">{stats.totalClasses}</span>
             </div>
             <div className="px-3 py-1 flex flex-col items-center">
               <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Today</span>
               <span className="font-bold text-orange-600">{stats.todayScheduleCount}</span>
             </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 md:p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Today’s Teaching Runway</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your next class, preparation blockers, and follow-up items in one place.</p>
              </div>
              {nextLesson && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400">Next Class</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{nextLesson.subject?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{nextLesson.class?.name} • {nextLesson.startTime}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button onClick={() => setActiveTab('INSIGHTS')} className="text-left rounded-xl border border-red-100 dark:border-red-900/30 bg-red-50/70 dark:bg-red-900/10 p-3 hover:bg-red-100/70 dark:hover:bg-red-900/20 transition-colors">
                <p className="text-[10px] uppercase tracking-wide font-bold text-red-600 dark:text-red-400">Urgent Learners</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{urgentLearnersCount}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Across {supportQueueCount} support cases</p>
              </button>
              <button onClick={() => setActiveTab('INSIGHTS')} className="text-left rounded-xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/70 dark:bg-purple-900/10 p-3 hover:bg-purple-100/70 dark:hover:bg-purple-900/20 transition-colors">
                <p className="text-[10px] uppercase tracking-wide font-bold text-purple-600 dark:text-purple-400">AI Drafts</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{pendingActions.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Waiting for review</p>
              </button>
              <button onClick={() => { setActiveTab('PLAN'); setLessonStatusFilter('DRAFT'); }} className="text-left rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/70 dark:bg-amber-900/10 p-3 hover:bg-amber-100/70 dark:hover:bg-amber-900/20 transition-colors">
                <p className="text-[10px] uppercase tracking-wide font-bold text-amber-600 dark:text-amber-400">Draft Lessons</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{draftLessonsCount}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Need review or AI activities</p>
              </button>
              <button onClick={() => setActiveTab('ASSESS')} className="text-left rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/70 dark:bg-blue-900/10 p-3 hover:bg-blue-100/70 dark:hover:bg-blue-900/20 transition-colors">
                <p className="text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400">Assessment Flow</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{data.recentAssessments.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{totalRecentResults} results recorded</p>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Quick Actions</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Jump straight into the most common teacher tasks.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/academics/attendance" className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors">
                <ClipboardCheck size={18} className="text-blue-600 dark:text-blue-400 mb-2" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Mark Attendance</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Open today’s register</p>
              </Link>
              <Link to="/academics/gradebook" className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors">
                <BookOpen size={18} className="text-emerald-600 dark:text-emerald-400 mb-2" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Open Gradebook</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Enter or review scores</p>
              </Link>
              <Link to="/students" className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors">
                <Search size={18} className="text-purple-600 dark:text-purple-400 mb-2" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Find Student</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Open learner profiles</p>
              </Link>
              <button onClick={() => setActiveTab('PLAN')} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors">
                <BrainCircuit size={18} className="text-amber-600 dark:text-amber-400 mb-2" />
                <p className="text-sm font-bold text-gray-900 dark:text-white">Continue Planning</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{readyLessonsCount} ready • {draftLessonsCount} draft</p>
              </button>
            </div>
          </div>
        </div>

        {/* AI Pending Actions — Expandable Review Panel */}
        {pendingActions.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-200 dark:border-purple-800/50 rounded-2xl overflow-hidden">
            <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-xl text-purple-600 dark:text-purple-400 mt-1">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                    AI Action Drafts Ready <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingActions.length}</span>
                  </h3>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">Review, approve & create adapted lessons — or dismiss.</p>
                </div>
              </div>
            </div>
            {/* Inline action cards */}
            <div className="px-4 pb-4 flex flex-col gap-3">
              {pendingActions.map(action => (
                <div key={action.id} className="bg-white dark:bg-slate-800 border border-purple-100 dark:border-purple-900/30 p-4 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">{action.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{action.class?.name} · {action.actionType.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{action.description}</p>
                  {action.draftPayload && (
                    <div className="mb-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                      <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300 mb-1">AI Diagnosis</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300">{action.draftPayload.explanation}</p>
                      {action.draftPayload.reteachSteps && (
                        <div className="mt-2 space-y-1">
                          {action.draftPayload.reteachSteps.map((step: string, i: number) => (
                            <div key={i} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
                              <span className="text-purple-500 font-bold shrink-0">{i + 1}.</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApproveAction(action.id)}
                      disabled={actionBusy === action.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {actionBusy === action.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Approve & Create Lesson
                    </button>
                    <button
                      onClick={() => handleDismissAction(action.id)}
                      disabled={actionBusy === action.id}
                      className="px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition disabled:opacity-50"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workspace Navigation Tabs (Hard-coded to Insights for Phase 1) */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 pb-1">
          <button onClick={() => setActiveTab('INSIGHTS')} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'INSIGHTS' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'}`}>
            Intelligence & Insights
          </button>
          <button onClick={() => setActiveTab('PLAN')} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'PLAN' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'}`}>
            Adapt & Plan
          </button>
          <button onClick={() => setActiveTab('ASSESS')} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'ASSESS' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'}`}>
            Assessments
          </button>
        </div>

        {/* INSIGHTS TAB */}
        {activeTab === 'INSIGHTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: The Signal Heatmap */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Learning Objectives Heatmap</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Calculated across your recent assessments</p>
                  </div>
                  <Search size={18} className="text-gray-400" />
                </div>
                
                <div className="p-0 overflow-x-auto">
                  {loadingIntelligence ? (
                     <div className="p-8 text-center text-gray-400">Analyzing mastery signals...</div>
                  ) : objectives.length === 0 ? (
                     <div className="p-8 text-center text-gray-500">No learning objective data found yet. Run an assessment!</div>
                  ) : (
                     <table className="w-full text-left text-sm">
                       <thead>
                         <tr className="bg-gray-50 dark:bg-slate-900/50">
                           <th className="p-4 font-medium text-gray-500 border-b border-gray-100 dark:border-slate-700">Topic</th>
                           <th className="p-4 font-medium text-gray-500 border-b border-gray-100 dark:border-slate-700 w-1/3">Objective</th>
                           <th className="p-4 font-medium text-gray-500 border-b border-gray-100 dark:border-slate-700">Status</th>
                           <th className="p-4 font-medium text-gray-500 border-b border-gray-100 dark:border-slate-700 text-right">Mastery</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                         {objectives.slice(0, 8).map(obj => (
                           <tr key={obj.id} onClick={() => setSelectedObjective(obj)} className={`hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${selectedObjective?.id === obj.id ? 'bg-blue-50/70 dark:bg-blue-900/10' : ''}`}>
                             <td className="p-4 text-gray-900 dark:text-white font-medium">{obj.subTopic.topic.title}</td>
                             <td className="p-4 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{obj.subTopic.title}</td>
                             <td className="p-4">
                               {obj.status === 'SECURE' ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle size={10}/> Secure</span>
                               : obj.status === 'FRAGILE' ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><AlertCircle size={10}/> Fragile</span>
                               : <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><AlertTriangle size={10}/> Urgent</span>}
                             </td>
                             <td className="p-4 text-right font-bold text-gray-900 dark:text-white">{Number(obj.masteryScore).toFixed(1)}%</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                  )}
                </div>
                {selectedObjective && (
                  <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide font-bold text-blue-600 dark:text-blue-400 mb-1">Signal Drill-In</p>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{selectedObjective.subTopic.topic.title} → {selectedObjective.subTopic.title}</h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                          {selectedObjective.student ? `Most visible with ${selectedObjective.student.firstName} ${selectedObjective.student.lastName}. ` : ''}
                          {getObjectiveActionLabel(selectedObjective)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded ${selectedObjective.status === 'SECURE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : selectedObjective.status === 'FRAGILE' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {selectedObjective.status}
                        </span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{Number(selectedObjective.masteryScore).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-3 bg-gray-50 dark:bg-slate-900/50 text-center border-t border-gray-100 dark:border-slate-700">
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Tap any row to inspect the signal</p>
                </div>
              </div>

               {/* Base Schedule Block so we don't lose existing utility */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                 <div className="p-5 border-b border-gray-100 dark:border-slate-700">
                   <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Calendar size={18} className="text-blue-500" /> Today's Schedule</h2>
                 </div>
                 <div className="divide-y divide-gray-50 dark:divide-slate-700">
                   {data.todaySchedule.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">No classes today.</div>
                   ) : data.todaySchedule.map(period => (
                     <div key={period.id} className="p-4 flex items-center gap-4">
                       <div className="text-center min-w-[60px]">
                         <div className="text-sm font-bold text-gray-900 dark:text-white">{period.startTime}</div>
                         <div className="text-[10px] text-gray-400">{period.endTime}</div>
                       </div>
                       <div className="flex-1">
                         <div className="text-sm font-bold text-blue-900 dark:text-blue-400">{period.subject?.name}</div>
                         <div className="text-xs text-gray-500">{period.class?.name}</div>
                       </div>
                       <Link to="/academics/attendance" className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">Mark Att</Link>
                     </div>
                   ))}
                 </div>
              </div>
            </div>

            {/* RIGHT COLUMN: The Action Queue */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Student Support Queue Panel */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 flex flex-col h-full">
                <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                       Support Queue <span className="bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400 text-xs px-2 py-0.5 rounded-full">{studentQueue.length}</span>
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Students needing immediate reteach/follow-up based on fragile mastery.</p>
                  </div>
                </div>
                
                <div className="p-4 flex-1 overflow-y-auto max-h-[500px] flex flex-col gap-3">
                  {loadingIntelligence ? (
                     <div className="py-8 text-center text-gray-400">Loading queue...</div>
                  ) : studentQueue.length === 0 ? (
                     <div className="py-8 text-center text-green-600">All students are currently on track!</div>
                  ) : studentQueue.map(student => (
                    <div key={student.studentId} className="border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 p-3 rounded-2xl">
                      <div className="flex justify-between items-start mb-2">
                         <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">{student.name}</h4>
                            <span className="text-[10px] text-gray-500">{student.className}</span>
                         </div>
                         <div className="flex gap-1">
                            {Array.from({length: Math.min(3, student.urgentCount)}).map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            ))}
                         </div>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-3 truncate">
                        Weak: {student.weakTopics[0]} {student.weakTopics.length > 1 && `+${student.weakTopics.length - 1} more`}
                      </div>
                       <div className="grid grid-cols-2 gap-2 mt-auto">
                        <Link to={`/students/${student.studentId}`} className="bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-[11px] font-bold py-1.5 rounded-xl hover:bg-gray-50 transition-colors flex justify-center items-center gap-1">
                          <Eye size={12}/> View Student
                        </Link>
                        <Link to="/academics/gradebook" className="bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded-xl hover:bg-blue-700 transition-colors flex justify-center items-center gap-1">
                          <BookOpen size={12}/> Gradebook
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* PLAN TAB — Adapt Workspace */}
        {activeTab === 'PLAN' && (
          <div className="flex flex-col gap-6">

            {/* Status Filter Pills */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex gap-2 flex-wrap">
              {(['ALL', 'DRAFT', 'READY', 'DEPLOYED', 'COMPLETED'] as const).map(s => {
                const count = s === 'ALL' ? lessons.length : lessons.filter(l => l.status === s).length;
                return (
                  <button key={s} onClick={() => setLessonStatusFilter(s)} className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${lessonStatusFilter === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50'}`}>
                    {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} <span className="ml-1 opacity-60">{count}</span>
                  </button>
                );
              })}
              </div>
              <div className="relative w-full lg:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={lessonSearch}
                  onChange={(e) => setLessonSearch(e.target.value)}
                  placeholder="Search lessons, classes, or topics..."
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {loadingLessons ? (
              <div className="py-16 text-center text-gray-400 flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm">Loading adapted lessons...</span>
              </div>
            ) : lessons.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 p-12 text-center">
                <BookOpen size={40} className="mx-auto text-gray-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">No Adapted Lessons Yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  When AI detects misconceptions from assessments, it drafts reteach plans. Approve them from the Intelligence tab to create adapted lessons here.
                </p>
                {pendingActions.length > 0 && (
                  <button onClick={() => setActiveTab('INSIGHTS')} className="mt-4 px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 transition">
                    Review {pendingActions.length} Pending Draft{pendingActions.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
            ) : filteredLessons.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 p-12 text-center">
                <Search size={40} className="mx-auto text-gray-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">No lessons match this filter</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">Try a different status filter or broaden your search terms.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredLessons.map(lesson => {
                  const isExpanded = expandedLessonId === lesson.id;
                  const statusColors: Record<string, string> = {
                    DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                    READY: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    DEPLOYED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    COMPLETED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                  };

                  return (
                    <div key={lesson.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                      {/* Lesson Header */}
                      <div
                        className="p-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors"
                        onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{lesson.title}</h3>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {lesson.subTopic.topic.title} → {lesson.subTopic.title} · {lesson.class.name}
                            </p>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ml-2 ${statusColors[lesson.status]}`}>
                            {lesson.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{lesson.objective}</p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500">
                          <span className="flex items-center gap-1"><Target size={10} /> {lesson.targetStudentIds.length} student{lesson.targetStudentIds.length !== 1 ? 's' : ''}</span>
                          <span className="flex items-center gap-1"><BookOpen size={10} /> {(lesson.activities || []).length} activities</span>
                          {lesson.scheduledDate && <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(lesson.scheduledDate).toLocaleDateString()}</span>}
                        </div>
                      </div>

                      {/* Expanded Activity List */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-slate-700">
                          <div className="p-4 space-y-3">
                            {(lesson.activities || []).length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-4">No activities yet. Use AI to generate some!</p>
                            ) : (lesson.activities || []).map((act, idx) => (
                              <div key={idx} className={`flex gap-3 p-3 rounded-xl ${act._aiGenerated ? 'bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30' : 'bg-gray-50 dark:bg-slate-900/50'}`}>
                                <div className="flex flex-col items-center shrink-0">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${act.type === 'WARM_UP' ? 'bg-orange-100 text-orange-600' : act.type === 'ASSESSMENT' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                    {idx + 1}
                                  </div>
                                  <span className="text-[9px] text-gray-400 mt-0.5">{act.durationMinutes}m</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-900 dark:text-white">{act.title}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{act.type.replace('_', ' ')}</span>
                                    {act._aiGenerated && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 flex items-center gap-0.5"><Sparkles size={8}/> AI</span>}
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{act.description}</p>
                                  {act.materials && act.materials.length > 0 && (
                                    <p className="text-[10px] text-gray-500 mt-1">Materials: {act.materials.join(', ')}</p>
                                  )}
                                  {act.differentiation && (
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1 italic">↳ {act.differentiation}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Action Buttons */}
                          <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex flex-wrap gap-2">
                            {lesson.status === 'DRAFT' && (
                              <>
                                <button
                                  onClick={() => handleGenerateActivities(lesson.id)}
                                  disabled={generatingActivities === lesson.id}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition disabled:opacity-50"
                                >
                                  {generatingActivities === lesson.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                  {generatingActivities === lesson.id ? 'Generating...' : 'AI Generate Activities'}
                                </button>
                                <button
                                  onClick={() => handleStatusChange(lesson.id, 'READY')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition"
                                >
                                  <Check size={12} /> Mark Ready
                                </button>
                              </>
                            )}
                            {lesson.status === 'READY' && (
                              <>
                                <button
                                  onClick={() => handleStatusChange(lesson.id, 'DEPLOYED')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-bold rounded-xl hover:bg-green-700 transition"
                                >
                                  <Play size={12} /> Deploy to Class
                                </button>
                                <button
                                  onClick={() => handleStatusChange(lesson.id, 'DRAFT')}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-xl hover:bg-gray-200 transition"
                                >
                                  <Edit3 size={12} /> Back to Draft
                                </button>
                              </>
                            )}
                            {lesson.status === 'DEPLOYED' && (
                              <button
                                onClick={() => handleStatusChange(lesson.id, 'COMPLETED')}
                                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition"
                              >
                                <CheckCircle size={12} /> Mark Completed
                              </button>
                            )}
                            {lesson.status === 'COMPLETED' && (
                              <span className="flex items-center gap-1.5 px-3 py-2 text-green-600 text-xs font-bold">
                                <CheckCircle size={12} /> Lesson completed
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ASSESS' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500 dark:text-gray-400">Recent Assessments</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{data.recentAssessments.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Latest classroom assessments</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500 dark:text-gray-400">Results Recorded</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{totalRecentResults}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Across your most recent assessments</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-4">
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-500 dark:text-gray-400">Fast Actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/academics/gradebook" className="inline-flex items-center gap-1 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 px-3 py-1.5 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30">
                    <ClipboardCheck size={12} /> Gradebook
                  </Link>
                  <Link to="/academics" className="inline-flex items-center gap-1 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 px-3 py-1.5 text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-900/30">
                    <BookOpen size={12} /> Academics
                  </Link>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
              <div className="p-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Assessment Flow</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Recent assessment activity with quick hand-off into grading workflows.</p>
                </div>
                <Link to="/academics/gradebook" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                  Open Gradebook <ChevronRight size={12} />
                </Link>
              </div>

              <div className="divide-y divide-gray-50 dark:divide-slate-700">
                {data.recentAssessments.length === 0 ? (
                  <div className="p-10 text-center text-gray-500 dark:text-gray-400">No recent assessments yet. Create one from Academics.</div>
                ) : data.recentAssessments.map((assessment) => (
                  <div key={assessment.id} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{assessment.title}</h3>
                        <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{assessment.subject.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{assessment.class.name} • {new Date(assessment.date).toLocaleDateString()} • {assessment._count.results} result{assessment._count.results !== 1 ? 's' : ''} recorded</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to="/academics/gradebook" className="inline-flex items-center gap-1 rounded-xl bg-blue-600 text-white px-3 py-2 text-xs font-bold hover:bg-blue-700 transition-colors">
                        <ClipboardCheck size={12} /> Grade Results
                      </Link>
                      <Link to="/academics" className="inline-flex items-center gap-1 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 px-3 py-2 text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors">
                        <Eye size={12} /> Open Academics
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
      </div>
    </PullToRefresh>
  );
}