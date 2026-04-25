import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, ChevronDown, ChevronRight, Plus, Trash2, Edit2, Save, X, Search,
  ArrowLeft, ListTree, GraduationCap, Layers, Target, Clock,
  Loader2, AlertCircle, Sparkles,
} from 'lucide-react';
import syllabusService, {
  import { useAppDialog } from '../ui/AppDialogProvider';
  SubjectSyllabusOverview, Topic, SubTopic, parseLearningObjectives,
} from '../../services/syllabusService';

// ==========================================
// HELPERS
// ==========================================

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

// ==========================================
// MAIN COMPONENT
// ==========================================

const SyllabusDefinition: React.FC = () => {
    const { confirm } = useAppDialog();
  // ---- State ----
  const [overview, setOverview] = useState<SubjectSyllabusOverview[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [search, setSearch] = useState('');

  // Drill-down into a subject
  const [selectedSubject, setSelectedSubject] = useState<SubjectSyllabusOverview | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  // Expanded topics (accordion)
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // CRUD state
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicDesc, setNewTopicDesc] = useState('');
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editTopicTitle, setEditTopicTitle] = useState('');
  const [editTopicDesc, setEditTopicDesc] = useState('');

  // SubTopic CRUD
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

  // ---- Load overview ----
  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const res = await syllabusService.getOverview();
      setOverview(res.data);
    } catch (err) {
      console.error('Failed to fetch syllabus overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  // ---- Load topics when subject + grade selected ----
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
    if (selectedSubject && selectedGrade !== null) {
      fetchTopics();
    }
  }, [selectedSubject, selectedGrade, fetchTopics]);

  // ---- Enter subject ----
  const openSubject = (subject: SubjectSyllabusOverview) => {
    setSelectedSubject(subject);
    setSelectedGrade(subject.gradeLevels[0] ?? null);
    setExpandedTopics(new Set());
    resetForms();
  };

  const goBack = () => {
    setSelectedSubject(null);
    setSelectedGrade(null);
    setTopics([]);
    setExpandedTopics(new Set());
    resetForms();
    fetchOverview();
  };

  const resetForms = () => {
    setAddingTopic(false);
    setEditingTopicId(null);
    setAddingSubTopicFor(null);
    setEditingSubId(null);
  };

  // ---- Toggle accordion ----
  const toggleExpand = (topicId: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const expandAll = () => setExpandedTopics(new Set(topics.map(t => t.id)));
  const collapseAll = () => setExpandedTopics(new Set());

  // ---- Topic CRUD ----
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
    } catch { alert('Failed to add topic'); }
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
    } catch { alert('Failed to update topic'); }
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
    } catch { alert('Failed to delete topic'); }
  };

  // ---- SubTopic CRUD ----
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
    } catch { alert('Failed to add subtopic'); }
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
    } catch { alert('Failed to update subtopic'); }
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
    } catch { alert('Failed to delete subtopic'); }
  };

  // ---- Filtered overview ----
  const filtered = overview.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  // ==========================================================================
  // RENDER — SUBJECT DETAIL VIEW
  // ==========================================================================
  if (selectedSubject) {
    const gradeStats = selectedSubject.byGrade.find(g => g.gradeLevel === selectedGrade);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
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
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Grade-level tabs */}
        <div className="flex gap-1.5 flex-wrap">
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
            <p className="text-gray-500 dark:text-gray-400 text-sm">No topics defined for {gradeLabel(selectedGrade!)} yet.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-md mx-auto">
              Generate a complete syllabus using AI based on the Zambian curriculum, or add topics manually.
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={async () => {
                  if (!selectedSubject || selectedGrade === null) return;
                  setGeneratingAI(true);
                  try {
                    const res = await syllabusService.generateSyllabus({ subjectId: selectedSubject.id, gradeLevel: selectedGrade });
                    setTopics(res.data.topics);
                    alert(`✅ Generated ${res.data.topics.length} topics with subtopics!`);
                  } catch (err: any) {
                    alert(err?.response?.data?.message || 'Failed to generate syllabus. Is AI configured?');
                  } finally {
                    setGeneratingAI(false);
                  }
                }}
                disabled={generatingAI}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 text-sm font-medium shadow-sm disabled:opacity-60 transition"
              >
                {generatingAI ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generatingAI ? 'Generating syllabus...' : '✨ Generate with AI'}
              </button>
              <button
                onClick={() => setAddingTopic(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
              >
                <Plus size={16} /> Add manually
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
                <div
                  key={topic.id}
                  className="border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden transition-shadow hover:shadow-sm"
                >
                  {/* Topic header row */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    {/* Expand/collapse */}
                    <button
                      onClick={() => toggleExpand(topic.id)}
                      className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>

                    {/* Order index */}
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-6 text-right">{topic.orderIndex || idx + 1}.</span>

                    {/* Title / edit mode */}
                    {isEditing ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          autoFocus
                          value={editTopicTitle}
                          onChange={e => setEditTopicTitle(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          onKeyDown={e => e.key === 'Enter' && handleEditTopic(topic.id)}
                        />
                        <button onClick={() => handleEditTopic(topic.id)} disabled={saving} className="p-1 text-green-600 hover:text-green-700">
                          <Save size={16} />
                        </button>
                        <button onClick={() => setEditingTopicId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleExpand(topic.id)}
                        className="flex-1 text-left"
                      >
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{topic.title}</span>
                        {topic.description && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{topic.description}</span>
                        )}
                      </button>
                    )}

                    {/* Subtopic count badge */}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium">
                      {subtopics.length} sub
                    </span>

                    {/* Actions */}
                    {!isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingTopicId(topic.id); setEditTopicTitle(topic.title); setEditTopicDesc(topic.description || ''); }}
                          className="p-1 text-gray-400 hover:text-blue-600 transition" title="Edit topic"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(topic.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition" title="Delete topic"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded subtopics */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
                      {subtopics.length === 0 ? (
                        <div className="px-6 py-4 text-center">
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">No subtopics yet.</p>
                          <button
                            onClick={() => setAddingSubTopicFor(topic.id)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            + Add subtopic
                          </button>
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
                                    <input
                                      autoFocus
                                      value={editSubTitle}
                                      onChange={e => setEditSubTitle(e.target.value)}
                                      placeholder="Subtopic title"
                                      className="px-2 py-1.5 text-sm border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <input
                                      value={editSubDuration}
                                      onChange={e => setEditSubDuration(e.target.value)}
                                      placeholder="Duration (min)"
                                      type="number"
                                      className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <textarea
                                    value={editSubDesc}
                                    onChange={e => setEditSubDesc(e.target.value)}
                                    placeholder="Description (optional)"
                                    rows={2}
                                    className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <textarea
                                    value={editSubObjectives}
                                    onChange={e => setEditSubObjectives(e.target.value)}
                                    placeholder="Learning objectives (one per line)"
                                    rows={3}
                                    className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setEditingSubId(null)} className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                                    <button
                                      onClick={() => handleEditSubTopic(st.id)}
                                      disabled={saving}
                                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                    >
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
                                    {st.description && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{st.description}</p>
                                    )}
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
                                    <button onClick={() => startEditSub(st)} className="p-1 text-gray-400 hover:text-blue-600" title="Edit subtopic">
                                      <Edit2 size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteSubTopic(st.id)} className="p-1 text-gray-400 hover:text-red-600" title="Delete subtopic">
                                      <Trash2 size={13} />
                                    </button>
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
                            <input
                              autoFocus
                              value={newSubTitle}
                              onChange={e => setNewSubTitle(e.target.value)}
                              placeholder="Subtopic title *"
                              className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyDown={e => e.key === 'Enter' && handleAddSubTopic(topic.id)}
                            />
                            <input
                              value={newSubDuration}
                              onChange={e => setNewSubDuration(e.target.value)}
                              placeholder="Duration (minutes)"
                              type="number"
                              className="px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <textarea
                            value={newSubDesc}
                            onChange={e => setNewSubDesc(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                            className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <textarea
                            value={newSubObjectives}
                            onChange={e => setNewSubObjectives(e.target.value)}
                            placeholder="Learning objectives (one per line)"
                            rows={3}
                            className="mt-2 w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button onClick={() => setAddingSubTopicFor(null)} className="text-xs px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
                            <button
                              onClick={() => handleAddSubTopic(topic.id)}
                              disabled={saving || !newSubTitle.trim()}
                              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? 'Adding...' : 'Add SubTopic'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        subtopics.length > 0 && (
                          <div className="px-6 py-2 border-t border-gray-100 dark:border-slate-700">
                            <button
                              onClick={() => setAddingSubTopicFor(topic.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1"
                            >
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

        {/* Add topic form / button */}
        {addingTopic ? (
          <div className="border border-dashed border-blue-300 dark:border-blue-600 rounded-xl p-4 bg-blue-50/30 dark:bg-blue-900/10">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Topic</p>
            <input
              autoFocus
              value={newTopicTitle}
              onChange={e => setNewTopicTitle(e.target.value)}
              placeholder="Topic title *"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
            />
            <textarea
              value={newTopicDesc}
              onChange={e => setNewTopicDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setAddingTopic(false)} className="text-sm px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
              <button
                onClick={handleAddTopic}
                disabled={saving || !newTopicTitle.trim()}
                className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Topic'}
              </button>
            </div>
          </div>
        ) : (
          selectedGrade !== null && (
            <button
              onClick={() => setAddingTopic(true)}
              className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Add New Topic
            </button>
          )
        )}
      </div>
    );
  }

  // ==========================================================================
  // RENDER — SUBJECT OVERVIEW CARDS
  // ==========================================================================
  return (
    <div className="space-y-4">
      {/* Search + global stats */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search subjects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><BookOpen size={14} className="text-blue-500" /> {overview.length} Subjects</span>
          <span className="flex items-center gap-1"><Layers size={14} className="text-indigo-500" /> {overview.reduce((s, o) => s + o.totalTopics, 0)} Topics</span>
          <span className="flex items-center gap-1"><ListTree size={14} className="text-emerald-500" /> {overview.reduce((s, o) => s + o.totalSubTopics, 0)} SubTopics</span>
        </div>
      </div>

      {loadingOverview ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading curriculum data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {search ? 'No subjects match your search.' : 'No syllabus data found. Run the syllabus seeder or add topics manually.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(subject => (
            <button
              key={subject.id}
              onClick={() => openSubject(subject)}
              className="text-left p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{subjectIcon(subject.name)}</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                      {subject.name}
                    </h3>
                    <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{subject.code}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition mt-1" />
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
                  <span
                    key={gl}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${gradeBadgeColor(gl)}`}
                  >
                    {gradeLabel(gl)}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyllabusDefinition;
