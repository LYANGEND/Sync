import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, Edit2, Save, X, Search, Upload,
  ChevronRight, ChevronDown, Layers, ListTree, GraduationCap,
  ArrowLeft, Target, Clock, Loader2, AlertCircle, FileText,
  Printer, BarChart3, ClipboardList, PenLine, Sparkles,
} from 'lucide-react';
import api from '../../utils/api';
import syllabusService, {
  SubjectSyllabusOverview, Topic, SubTopic, parseLearningObjectives,
} from '../../services/syllabusService';
import BulkImportModal from '../../components/BulkImportModal';
import LessonPlanner from '../academics/LessonPlanner';
import Assessments from '../academics/Assessments';
import HomeworkManagement from '../academics/HomeworkManagement';
import toast from 'react-hot-toast';
import { useAppDialog } from '../../components/ui/AppDialogProvider';

/* =========================================
   HELPERS
   ========================================= */

function gradeLabel(gl: number): string {
  if (gl <= -1) return `ECE (Age ${gl + 6})`;
  if (gl <= 7) return `Grade ${gl}`;
  return `Form ${gl - 7}`;
}

function gradeBadgeColor(gl: number): string {
  if (gl <= -1) return 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300';
  if (gl <= 4) return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
  if (gl <= 7) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
}

function subjectIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('math')) return '📐';
  if (n.includes('english') || n.includes('language') || n.includes('literature')) return '📝';
  if (n.includes('science') || n.includes('biology') || n.includes('chemistry') || n.includes('physics')) return '🔬';
  if (n.includes('history') || n.includes('social') || n.includes('civic') || n.includes('geography')) return '🌍';
  if (n.includes('computer') || n.includes('ict') || n.includes('tech')) return '💻';
  if (n.includes('art') || n.includes('design') || n.includes('expressive')) return '🎨';
  if (n.includes('music')) return '🎵';
  if (n.includes('physical') || n.includes('sport')) return '⚽';
  if (n.includes('religious') || n.includes('re')) return '📖';
  if (n.includes('french') || n.includes('zambian')) return '🗣️';
  if (n.includes('commerce') || n.includes('business') || n.includes('account')) return '💼';
  if (n.includes('agri') || n.includes('farm')) return '🌾';
  if (n.includes('food') || n.includes('nutrition') || n.includes('hospitality')) return '🍽️';
  if (n.includes('fashion') || n.includes('home eco')) return '🧵';
  if (n.includes('ece') || n.includes('early childhood') || n.includes('creative')) return '🧒';
  return '📚';
}

/* =========================================
   MAIN COMPONENT
   ========================================= */

const Subjects = () => {
  const { confirm } = useAppDialog();
  /* ---- Shared state ---- */
  const [overview, setOverview] = useState<SubjectSyllabusOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [search, setSearch] = useState('');

  /* ---- Subject CRUD ---- */
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<{ id: string; name: string; code: string } | null>(null);
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' });
  const [showImportModal, setShowImportModal] = useState(false);

  /* ---- Drill-down: selected subject ---- */
  const [selectedSubject, setSelectedSubject] = useState<SubjectSyllabusOverview | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'topics' | 'outline' | 'lessons' | 'assessments' | 'homework'>('topics');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  /* ---- Outline view (all grades) ---- */
  const [outlineData, setOutlineData] = useState<{ grade: number; topics: Topic[] }[]>([]);
  const [loadingOutline, setLoadingOutline] = useState(false);

  /* ---- Topic accordion ---- */
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  /* ---- Topic CRUD ---- */
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editTopicDesc, setEditTopicDesc] = useState('');

  /* ---- SubTopic CRUD ---- */
  const [addingSubTopicFor, setAddingSubTopicFor] = useState<string | null>(null);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [newSubObjectives, setNewSubObjectives] = useState('');
  const [newSubDuration, setNewSubDuration] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editSubTitle, setEditSubTitle] = useState('');
  const [editSubDesc, setEditSubDesc] = useState('');
  const [editSubObjectives, setEditSubObjectives] = useState('');
  const [editSubDuration, setEditSubDuration] = useState('');

  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

  /* ========================================
     DATA FETCHING
     ======================================== */

  useEffect(() => { fetchOverview(); }, []);

  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await syllabusService.getOverview();
      setOverview(res.data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchTopics = useCallback(async () => {
    if (!selectedSubject || selectedGrade === null) return;
    setLoadingTopics(true);
    try {
      const res = await syllabusService.getTopics(selectedSubject.id, selectedGrade);
      setTopics(res.data);
    } catch (err) {
      console.error('Failed to fetch topics:', err);
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  }, [selectedSubject, selectedGrade]);

  useEffect(() => {
    if (selectedSubject && selectedGrade !== null && activeView === 'topics') {
      fetchTopics();
    }
  }, [selectedSubject, selectedGrade, fetchTopics, activeView]);

  /* Fetch full outline (all grades for the subject) */
  const fetchOutline = useCallback(async () => {
    if (!selectedSubject) return;
    setLoadingOutline(true);
    try {
      const results: { grade: number; topics: Topic[] }[] = [];
      for (const gl of selectedSubject.gradeLevels) {
        const res = await syllabusService.getTopics(selectedSubject.id, gl);
        results.push({ grade: gl, topics: res.data });
      }
      setOutlineData(results);
    } catch (err) {
      console.error('Failed to fetch outline:', err);
    } finally {
      setLoadingOutline(false);
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (activeView === 'outline' && selectedSubject) {
      fetchOutline();
    }
  }, [activeView, selectedSubject, fetchOutline]);

  /* ========================================
     SUBJECT CRUD
     ======================================== */

  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSubject) {
        await api.put(`/subjects/${editingSubject.id}`, subjectForm);
        toast.success('Subject updated');
      } else {
        await api.post('/subjects', subjectForm);
        toast.success('Subject created');
      }
      fetchOverview();
      setShowSubjectModal(false);
      setSubjectForm({ name: '', code: '' });
      setEditingSubject(null);
    } catch (error) {
      console.error('Failed to save subject', error);
      toast.error('Failed to save subject');
    }
  };

  const handleDeleteSubject = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({
      title: 'Delete subject?',
      message: `Delete "${name}" and all its topics/subtopics?`,
      confirmText: 'Delete subject',
    }))) return;
    try {
      await api.delete(`/subjects/${id}`);
      toast.success('Subject deleted');
      fetchOverview();
    } catch (error) {
      console.error('Failed to delete subject', error);
      toast.error('Cannot delete — subject may have assessments or assignments');
    }
  };

  const openEditSubject = (subject: SubjectSyllabusOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject({ id: subject.id, name: subject.name, code: subject.code });
    setSubjectForm({ name: subject.name, code: subject.code });
    setShowSubjectModal(true);
  };

  const openAddSubject = () => {
    setEditingSubject(null);
    setSubjectForm({ name: '', code: '' });
    setShowSubjectModal(true);
  };

  /* ========================================
     NAVIGATION
     ======================================== */

  const openSubject = (subject: SubjectSyllabusOverview) => {
    setSelectedSubject(subject);
    setSelectedGrade(subject.gradeLevels[0] ?? null);
    setActiveView('topics');
    setExpandedTopics(new Set());
    resetForms();
  };

  const goBack = () => {
    setSelectedSubject(null);
    setSelectedGrade(null);
    setTopics([]);
    setOutlineData([]);
    setExpandedTopics(new Set());
    setActiveView('topics');
    resetForms();
    fetchOverview();
  };

  const resetForms = () => {
    setAddingTopic(false);
    setEditingTopicId(null);
    setAddingSubTopicFor(null);
    setEditingSubId(null);
  };

  /* ========================================
     AI SYLLABUS GENERATION
     ======================================== */

  const handleAIGenerate = async () => {
    if (!selectedSubject || selectedGrade === null) return;
    if (topics.length > 0 && !(await confirm({
      title: 'Generate AI topics?',
      message: `This will add AI-generated topics to ${gradeLabel(selectedGrade)}. Existing topics won't be deleted. Continue?`,
      confirmText: 'Generate topics',
    }))) return;
    setGeneratingAI(true);
    try {
      const res = await syllabusService.generateSyllabus({ subjectId: selectedSubject.id, gradeLevel: selectedGrade });
      toast.success(`AI generated ${res.data.topics?.length || 0} topics for ${selectedSubject.name} ${gradeLabel(selectedGrade)}`);
      fetchTopics();
      fetchOverview();
    } catch (err: any) {
      console.error('AI generation failed:', err);
      toast.error(err?.response?.data?.error || 'AI generation failed. Try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  /* ========================================
     TOPIC / SUBTOPIC CRUD
     ======================================== */

  const toggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const expandAll = () => setExpandedTopics(new Set(topics.map(t => t.id)));
  const collapseAll = () => setExpandedTopics(new Set());

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim() || !selectedSubject || selectedGrade === null) return;
    setSaving(true);
    try {
      await syllabusService.createTopic({
        title: newTopicTitle.trim(),
        description: newTopicDesc.trim() || undefined,
        subjectId: selectedSubject.id,
        gradeLevel: selectedGrade,
        orderIndex: topics.length + 1,
      });
      setAddingTopic(false);
      setNewTopicTitle('');
      setNewTopicDesc('');
      fetchTopics();
    } catch { toast.error('Failed to add topic'); }
    finally { setSaving(false); }
  };

  const handleEditTopic = async (id: string) => {
    if (!editTopicTitle.trim()) return;
    setSaving(true);
    try {
      await syllabusService.updateTopic(id, {
        title: editTopicTitle.trim(),
        description: editTopicDesc.trim(),
      });
      setEditingTopicId(null);
      fetchTopics();
    } catch { toast.error('Failed to update topic'); }
    finally { setSaving(false); }
  };

  const handleDeleteTopic = async (id: string) => {
    if (!(await confirm({
      title: 'Delete topic?',
      message: 'Delete this topic and all its subtopics?',
      confirmText: 'Delete topic',
    }))) return;
    try {
      await syllabusService.deleteTopic(id);
      fetchTopics();
    } catch { toast.error('Failed to delete topic'); }
  };

  const handleAddSubTopic = async (topicId: string) => {
    if (!newSubTitle.trim()) return;
    setSaving(true);
    try {
      const topic = topics.find(t => t.id === topicId);
      await syllabusService.createSubTopic({
        title: newSubTitle.trim(),
        description: newSubDesc.trim() || undefined,
        learningObjectives: newSubObjectives.trim()
          ? newSubObjectives.split('\n').map(l => l.trim()).filter(Boolean)
          : undefined,
        topicId,
        orderIndex: (topic?.subtopics?.length || 0) + 1,
        duration: newSubDuration ? parseInt(newSubDuration) : undefined,
      });
      setAddingSubTopicFor(null);
      setNewSubTitle('');
      setNewSubDesc('');
      setNewSubObjectives('');
      setNewSubDuration('');
      fetchTopics();
    } catch { toast.error('Failed to add subtopic'); }
    finally { setSaving(false); }
  };

  const startEditSub = (st: SubTopic) => {
    setEditingSubId(st.id);
    setEditSubTitle(st.title);
    setEditSubDesc(st.description || '');
    const objectives = parseLearningObjectives(st.learningObjectives);
    setEditSubObjectives(objectives.join('\n'));
    setEditSubDuration(st.duration?.toString() || '');
  };

  const handleEditSubTopic = async (id: string) => {
    if (!editSubTitle.trim()) return;
    setSaving(true);
    try {
      await syllabusService.updateSubTopic(id, {
        title: editSubTitle.trim(),
        description: editSubDesc.trim(),
        learningObjectives: editSubObjectives.trim()
          ? editSubObjectives.split('\n').map(l => l.trim()).filter(Boolean)
          : undefined,
        duration: editSubDuration ? parseInt(editSubDuration) : undefined,
      });
      setEditingSubId(null);
      fetchTopics();
    } catch { toast.error('Failed to update subtopic'); }
    finally { setSaving(false); }
  };

  const handleDeleteSubTopic = async (id: string) => {
    if (!(await confirm({
      title: 'Delete subtopic?',
      message: 'Delete this subtopic?',
      confirmText: 'Delete subtopic',
    }))) return;
    try {
      await syllabusService.deleteSubTopic(id);
      fetchTopics();
    } catch { toast.error('Failed to delete subtopic'); }
  };

  /* ========================================
     FILTERED SUBJECTS
     ======================================== */

  const filtered = overview.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  /* ==========================================
     RENDER — SUBJECT DRILL-DOWN
     ========================================== */

  if (selectedSubject) {
    const gradeStats = selectedSubject.byGrade.find(g => g.gradeLevel === selectedGrade);

    return (
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4 print:p-2">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition">
              <ArrowLeft size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
            <span className="text-2xl">{subjectIcon(selectedSubject.name)}</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedSubject.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedSubject.code} · {selectedSubject.totalTopics} topics · {selectedSubject.totalSubTopics} subtopics
              </p>
            </div>
          </div>
        </div>

        {/* View toggle: Topics | Outline */}
        <div className="flex items-center gap-2 print:hidden">
          <div className="bg-gray-100 dark:bg-slate-700 p-1 rounded-lg flex gap-1">
            <button
              onClick={() => setActiveView('topics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeView === 'topics'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Layers size={15} /> Topics & SubTopics
            </button>
            <button
              onClick={() => setActiveView('outline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeView === 'outline'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <FileText size={15} /> Subject Outline
            </button>
            <button
              onClick={() => setActiveView('lessons')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeView === 'lessons'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <BarChart3 size={15} /> Lesson Planner
            </button>
            <button
              onClick={() => setActiveView('assessments')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeView === 'assessments'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <ClipboardList size={15} /> Assessments
            </button>
            <button
              onClick={() => setActiveView('homework')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeView === 'homework'
                  ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <PenLine size={15} /> Homework
            </button>
          </div>

          {activeView === 'topics' && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleAIGenerate}
                disabled={generatingAI || selectedGrade === null}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition shadow-sm"
              >
                {generatingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generatingAI ? 'Generating...' : 'AI Generate Syllabus'}
              </button>
              <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition">Expand All</button>
              <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition">Collapse All</button>
            </div>
          )}
          {activeView === 'outline' && (
            <button
              onClick={() => window.print()}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
            >
              <Printer size={14} /> Print Outline
            </button>
          )}
        </div>

        {/* ========== TOPICS VIEW ========== */}
        {activeView === 'topics' && (
          <>
            {/* Grade tabs */}
            <div className="flex gap-1.5 flex-wrap print:hidden">
              {selectedSubject.gradeLevels.map(gl => {
                const gs = selectedSubject.byGrade.find(g => g.gradeLevel === gl);
                const active = selectedGrade === gl;
                return (
                  <button
                    key={gl}
                    onClick={() => { setSelectedGrade(gl); setExpandedTopics(new Set()); resetForms(); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {gradeLabel(gl)}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'
                    }`}>
                      {gs?.topicCount || 0}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Stats bar */}
            {gradeStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Layers size={16} className="text-blue-500" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">{gradeStats.topicCount} Topics</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <ListTree size={16} className="text-indigo-500" />
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{gradeStats.subtopicCount} SubTopics</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg hidden sm:flex">
                  <GraduationCap size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{gradeLabel(gradeStats.gradeLevel)}</span>
                </div>
              </div>
            )}

            {/* Topic list */}
            {loadingTopics ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
                <Loader2 size={20} className="animate-spin" /> Loading topics...
              </div>
            ) : topics.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No topics defined for {selectedGrade !== null ? gradeLabel(selectedGrade) : 'this grade'} yet.</p>
                <div className="flex items-center gap-3 mt-3 justify-center">
                  <button onClick={() => setAddingTopic(true)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add the first topic</button>
                  <span className="text-gray-300">or</span>
                  <button
                    onClick={handleAIGenerate}
                    disabled={generatingAI}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition"
                  >
                    {generatingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generatingAI ? 'Generating...' : 'AI Generate Syllabus'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {topics.map((topic, idx) => {
                  const isExpanded = expandedTopics.has(topic.id);
                  const subtopics = topic.subtopics || [];
                  const isEditing = editingTopicId === topic.id;

                  return (
                    <div key={topic.id} className="border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden transition-shadow hover:shadow-sm">
                      {/* Topic header */}
                      <div className="flex items-center gap-2 px-4 py-3">
                        <button onClick={() => toggleExpand(topic.id)} className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-6 text-right">{topic.orderIndex || idx + 1}.</span>

                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input autoFocus value={editTopicTitle} onChange={e => setEditTopicTitle(e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyDown={e => e.key === 'Enter' && handleEditTopic(topic.id)} />
                            <button onClick={() => handleEditTopic(topic.id)} disabled={saving} className="p-1 text-green-600 hover:text-green-700"><Save size={16} /></button>
                            <button onClick={() => setEditingTopicId(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                          </div>
                        ) : (
                          <button onClick={() => toggleExpand(topic.id)} className="flex-1 text-left">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{topic.title}</span>
                            {topic.description && <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{topic.description}</span>}
                          </button>
                        )}

                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium">
                          {subtopics.length} sub
                        </span>

                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditingTopicId(topic.id); setEditTopicTitle(topic.title); setEditTopicDesc(topic.description || ''); }}
                              className="p-1 text-gray-400 hover:text-blue-600 transition" title="Edit topic"><Edit2 size={14} /></button>
                            <button onClick={() => handleDeleteTopic(topic.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition" title="Delete topic"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>

                      {/* Expanded subtopics */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                          {subtopics.length === 0 ? (
                            <div className="px-6 py-4 text-center">
                              <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No subtopics yet.</p>
                              <button onClick={() => setAddingSubTopicFor(topic.id)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add subtopic</button>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100 dark:divide-slate-700">
                              {subtopics.map((st, stIdx) => {
                                const objectives = parseLearningObjectives(st.learningObjectives);
                                const isEditingSub = editingSubId === st.id;

                                if (isEditingSub) {
                                  return (
                                    <div key={st.id} className="px-6 py-3 bg-blue-50/50 dark:bg-blue-900/10">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input autoFocus value={editSubTitle} onChange={e => setEditSubTitle(e.target.value)} placeholder="Subtopic title"
                                          className="px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        <input value={editSubDuration} onChange={e => setEditSubDuration(e.target.value)} placeholder="Duration (min)" type="number"
                                          className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                      </div>
                                      <textarea value={editSubDesc} onChange={e => setEditSubDesc(e.target.value)} placeholder="Description (optional)" rows={2}
                                        className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                      <textarea value={editSubObjectives} onChange={e => setEditSubObjectives(e.target.value)} placeholder="Learning objectives (one per line)" rows={3}
                                        className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                      <div className="flex justify-end gap-2 mt-2">
                                        <button onClick={() => setEditingSubId(null)} className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                                        <button onClick={() => handleEditSubTopic(st.id)} disabled={saving} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                          {saving ? 'Saving...' : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={st.id} className="px-6 py-3 hover:bg-white dark:hover:bg-slate-750 transition group/sub">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold flex-shrink-0">
                                        {stIdx + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{st.title}</span>
                                          {st.duration && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                                              <Clock size={10} /> {st.duration}min
                                            </span>
                                          )}
                                        </div>
                                        {st.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{st.description}</p>}
                                        {objectives.length > 0 && (
                                          <div className="mt-1.5 space-y-0.5">
                                            {objectives.map((obj, i) => (
                                              <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                <Target size={10} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                                <span>{obj}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity flex-shrink-0">
                                        <button onClick={() => startEditSub(st)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit subtopic"><Edit2 size={13} /></button>
                                        <button onClick={() => handleDeleteSubTopic(st.id)} className="p-1 text-gray-400 hover:text-red-600" title="Delete subtopic"><Trash2 size={13} /></button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Add subtopic form */}
                          {addingSubTopicFor === topic.id ? (
                            <div className="px-6 py-3 border-t border-gray-100 dark:border-slate-700 bg-green-50/30 dark:bg-green-900/10">
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">New SubTopic</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input autoFocus value={newSubTitle} onChange={e => setNewSubTitle(e.target.value)} placeholder="Subtopic title *"
                                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  onKeyDown={e => e.key === 'Enter' && handleAddSubTopic(topic.id)} />
                                <input value={newSubDuration} onChange={e => setNewSubDuration(e.target.value)} placeholder="Duration (minutes)" type="number"
                                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              </div>
                              <textarea value={newSubDesc} onChange={e => setNewSubDesc(e.target.value)} placeholder="Description (optional)" rows={2}
                                className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <textarea value={newSubObjectives} onChange={e => setNewSubObjectives(e.target.value)} placeholder="Learning objectives (one per line)" rows={3}
                                className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <div className="flex justify-end gap-2 mt-2">
                                <button onClick={() => setAddingSubTopicFor(null)} className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                                <button onClick={() => handleAddSubTopic(topic.id)} disabled={saving || !newSubTitle.trim()}
                                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                  {saving ? 'Adding...' : 'Add SubTopic'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            subtopics.length > 0 && (
                              <div className="px-6 py-2 border-t border-gray-100 dark:border-slate-700">
                                <button onClick={() => setAddingSubTopicFor(topic.id)}
                                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                                  <Plus size={12} /> Add subtopic
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add topic button */}
            {addingTopic ? (
              <div className="border border-dashed border-blue-300 dark:border-blue-600 rounded-xl p-4 bg-blue-50/30 dark:bg-blue-900/10">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Topic</p>
                <input autoFocus value={newTopicTitle} onChange={e => setNewTopicTitle(e.target.value)} placeholder="Topic title *"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  onKeyDown={e => e.key === 'Enter' && handleAddTopic()} />
                <textarea value={newTopicDesc} onChange={e => setNewTopicDesc(e.target.value)} placeholder="Description (optional)" rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setAddingTopic(false)} className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                  <button onClick={handleAddTopic} disabled={saving || !newTopicTitle.trim()} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Adding...' : 'Add Topic'}
                  </button>
                </div>
              </div>
            ) : (
              selectedGrade !== null && (
                <button onClick={() => setAddingTopic(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition flex items-center justify-center gap-2">
                  <Plus size={16} /> Add New Topic
                </button>
              )
            )}
          </>
        )}

        {/* ========== SUBJECT OUTLINE VIEW ========== */}
        {activeView === 'outline' && (
          <div className="space-y-6">
            {/* Print header (only visible in print) */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold">{selectedSubject.name} — Subject Outline</h1>
              <p className="text-sm text-gray-500">{selectedSubject.code} · {selectedSubject.totalTopics} topics · {selectedSubject.totalSubTopics} subtopics</p>
              <hr className="mt-2" />
            </div>

            {loadingOutline ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
                <Loader2 size={20} className="animate-spin" /> Loading subject outline...
              </div>
            ) : outlineData.length === 0 ? (
              <div className="text-center py-12">
                <FileText size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No curriculum data for this subject.</p>
              </div>
            ) : (
              outlineData.map(({ grade, topics: gradeTopics }) => (
                <div key={grade} className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 print:border-gray-300 print:break-inside-avoid">
                  {/* Grade header */}
                  <div className="px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GraduationCap size={18} className="text-blue-600 dark:text-blue-400" />
                      <h3 className="font-bold text-gray-900 dark:text-white">{gradeLabel(grade)}</h3>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {gradeTopics.length} topics · {gradeTopics.reduce((s, t) => s + (t.subtopics?.length || 0), 0)} subtopics
                    </span>
                  </div>

                  {gradeTopics.length === 0 ? (
                    <div className="px-5 py-4 text-center text-sm text-gray-400 dark:text-gray-500 italic">No topics defined for this grade.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-slate-700">
                      {gradeTopics.map((topic, tIdx) => {
                        const subtopics = topic.subtopics || [];
                        return (
                          <div key={topic.id} className="print:break-inside-avoid">
                            <div className="px-5 py-3 flex items-start gap-3">
                              <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold">
                                {tIdx + 1}
                              </span>
                              <div className="flex-1">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{topic.title}</h4>
                                {topic.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{topic.description}</p>}

                                {subtopics.length > 0 && (
                                  <div className="mt-2 ml-1 space-y-1.5">
                                    {subtopics.map((st, stIdx) => {
                                      const objectives = parseLearningObjectives(st.learningObjectives);
                                      return (
                                        <div key={st.id} className="flex items-start gap-2">
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mt-0.5 flex-shrink-0">
                                            {tIdx + 1}.{stIdx + 1}
                                          </span>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-700 dark:text-gray-300">{st.title}</span>
                                              {st.duration && (
                                                <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-400 flex items-center gap-0.5">
                                                  <Clock size={8} /> {st.duration}min
                                                </span>
                                              )}
                                            </div>
                                            {objectives.length > 0 && (
                                              <div className="mt-0.5 space-y-0.5">
                                                {objectives.map((obj, i) => (
                                                  <div key={i} className="flex items-start gap-1 text-[10px] text-gray-400 dark:text-gray-500">
                                                    <Target size={8} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                                                    <span>{obj}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ========== LESSON PLANNER VIEW ========== */}
        {activeView === 'lessons' && (
          <LessonPlanner subjectId={selectedSubject.id} />
        )}

        {/* ========== ASSESSMENTS VIEW ========== */}
        {activeView === 'assessments' && (
          <Assessments subjectId={selectedSubject.id} />
        )}

        {/* ========== HOMEWORK VIEW ========== */}
        {activeView === 'homework' && (
          <HomeworkManagement subjectId={selectedSubject.id} />
        )}
      </div>
    );
  }

  /* ==========================================
     RENDER — SUBJECT OVERVIEW (MAIN VIEW)
     ========================================== */

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Subjects</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage subjects, topics, subtopics & outlines</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition text-sm font-medium">
            <Upload size={16} /> Import
          </button>
          <button onClick={openAddSubject}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium">
            <Plus size={16} /> Add Subject
          </button>
        </div>
      </div>

      {/* Search + global stats */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search subjects..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><BookOpen size={14} className="text-blue-500" /> {overview.length} Subjects</span>
          <span className="flex items-center gap-1"><Layers size={14} className="text-indigo-500" /> {overview.reduce((s, o) => s + o.totalTopics, 0)} Topics</span>
          <span className="flex items-center gap-1"><ListTree size={14} className="text-emerald-500" /> {overview.reduce((s, o) => s + o.totalSubTopics, 0)} SubTopics</span>
        </div>
      </div>

      {/* Subject cards grid */}
      {loadingOverview ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading subjects...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {search ? 'No subjects match your search.' : 'No subjects found. Add one to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(subject => (
            <div
              key={subject.id}
              onClick={() => openSubject(subject)}
              className="relative text-left p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all group cursor-pointer"
            >
              {/* Action buttons (top-right) */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => openEditSubject(subject, e)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition" title="Edit subject">
                  <Edit2 size={14} />
                </button>
                <button onClick={(e) => handleDeleteSubject(subject.id, subject.name, e)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition" title="Delete subject">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Top row */}
              <div className="flex items-start gap-2.5 mb-3 pr-16">
                <span className="text-2xl">{subjectIcon(subject.name)}</span>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {subject.name}
                  </h3>
                  <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{subject.code}</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <Layers size={13} className="text-blue-500" />
                  <span className="font-semibold">{subject.totalTopics}</span> topics
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <ListTree size={13} className="text-indigo-500" />
                  <span className="font-semibold">{subject.totalSubTopics}</span> subtopics
                </div>
              </div>

              {/* Grade badges */}
              <div className="flex flex-wrap gap-1">
                {subject.gradeLevels.map(gl => (
                  <span key={gl} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${gradeBadgeColor(gl)}`}>
                    {gradeLabel(gl)}
                  </span>
                ))}
                {subject.gradeLevels.length === 0 && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">No curriculum data</span>
                )}
              </div>

              {/* Drill-down arrow */}
              <ChevronRight size={18} className="absolute bottom-4 right-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition" />
            </div>
          ))}
        </div>
      )}

      {/* Subject Add/Edit Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold dark:text-white mb-4">{editingSubject ? 'Edit Subject' : 'Add Subject'}</h2>
            <form onSubmit={handleSubjectSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject Name</label>
                <input type="text" required value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  placeholder="e.g. Mathematics" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject Code</label>
                <input type="text" required value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  placeholder="e.g. MATH" />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingSubject ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Subjects"
        apiEndpoint="/api/v1/subjects/bulk"
        templateFields={['name', 'code']}
        onSuccess={fetchOverview}
        instructions={[
          'Upload a CSV file with subject details.',
          'Required columns: name, code.',
          'Code should be a unique identifier (e.g., MATH, ENG, SCI).',
        ]}
      />
    </div>
  );
};

export default Subjects;
