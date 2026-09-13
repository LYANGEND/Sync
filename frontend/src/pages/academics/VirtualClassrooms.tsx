import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Plus, Calendar, Users, Bot, Play, Trash2, Edit,
  Search, Loader2, GraduationCap, Brain, Sparkles,
  Monitor, BookOpen, X, Volume2,
  Wand2, ListTree
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { PageHeader } from '../../components/ui/DesignSystem';
import syllabusService, {
  StructuredLessonPlan,
  Topic,
  parseLearningObjectives,
} from '../../services/syllabusService';

interface Classroom {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  aiTutorEnabled: boolean;
  aiTutorName: string;
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  _count: {
    participants: number;
    chatMessages: number;
    tutorSessions: number;
  };
}

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  preview_url?: string;
}

interface ClassOption {
  id: string;
  name: string;
  gradeLevel?: number;
  subjects?: { id: string; name: string; code: string }[];
}

interface SubjectOption {
  id: string;
  name: string;
}

export default function VirtualClassrooms() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirm } = useAppDialog();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'SCHEDULED' | 'LIVE' | 'ENDED'>('all');
  const [search, setSearch] = useState('');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);

  // Syllabus-driven scheduling state
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedSubTopicIds, setSelectedSubTopicIds] = useState<string[]>([]);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedStructuredPlan, setGeneratedStructuredPlan] = useState<StructuredLessonPlan | null>(null);
  const [savedLessonPlans, setSavedLessonPlans] = useState<{ id: string; title: string; content: string; weekStartDate: string }[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    classId: '',
    subjectId: '',
    scheduledStart: '',
    scheduledEnd: '',
    aiTutorEnabled: true,
    aiTutorName: 'AI Teacher',
    aiTutorVoiceId: '',
    aiTutorPersona: '',
    lessonPlanContent: '',
    maxParticipants: 50,
  });
  const selectedFormClass = classes.find(c => c.id === form.classId);
  const availableFormSubjects = form.classId
    ? (((selectedFormClass?.subjects?.length ? selectedFormClass.subjects : subjects) || []) as SubjectOption[])
    : subjects;

  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const canCreate = isAdmin || isTeacher;

  // ==========================================
  // FETCH DATA
  // ==========================================
  useEffect(() => {
    fetchClassrooms();
    if (canCreate) {
      fetchVoices();
      fetchClasses();
      fetchSubjects();
    }
  }, []);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const res = await api.get('/virtual-classroom');
      setClassrooms(res.data);
    } catch (err) {
      console.error('Fetch classrooms error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVoices = async () => {
    try {
      const res = await api.get('/virtual-classroom/voices');
      setVoices(res.data.voices || []);
    } catch (err) {
      console.error('Fetch voices error:', err);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes');
      const data = res.data;
      setClasses(Array.isArray(data) ? data : data.classes || []);
    } catch (err) {
      console.error('Fetch classes error:', err);
    }
  };

  const fetchSubjects = async () => {
    try {
      const res = await api.get('/subjects');
      const data = res.data;
      setSubjects(Array.isArray(data) ? data : data.subjects || []);
    } catch (err) {
      console.error('Fetch subjects error:', err);
    }
  };

  // Fetch topics when both subject and class are selected
  const fetchTopics = useCallback(async (subjectId: string, classId: string) => {
    if (!subjectId || !classId) {
      setTopics([]);
      setSelectedTopicId('');
      setSelectedSubTopicIds([]);
      setGeneratedStructuredPlan(null);
      return;
    }

    const selectedClass = classes.find(c => c.id === classId);
    const gradeLevel = selectedClass?.gradeLevel;
    if (gradeLevel === undefined) return;

    setLoadingTopics(true);
    try {
      const res = await syllabusService.getTopics(subjectId, gradeLevel);
      setTopics(res.data);
    } catch (err) {
      console.error('Fetch topics error:', err);
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  }, [classes]);

  // Auto-fetch topics when subject or class changes
  useEffect(() => {
    if (form.subjectId && form.classId && classes.length > 0) {
      fetchTopics(form.subjectId, form.classId);
      // Also fetch saved lesson plans for this class+subject
      api.get(`/syllabus/lesson-plans?classId=${form.classId}&subjectId=${form.subjectId}`)
        .then(res => setSavedLessonPlans(res.data))
        .catch(() => setSavedLessonPlans([]));
    } else {
      setTopics([]);
      setSelectedTopicId('');
      setSelectedSubTopicIds([]);
      setGeneratedStructuredPlan(null);
      setSavedLessonPlans([]);
    }
  }, [form.subjectId, form.classId, classes, fetchTopics]);

  useEffect(() => {
    if (!form.classId) {
      return;
    }

    if (availableFormSubjects.length === 0) {
      if (form.subjectId) {
        setForm(prev => ({ ...prev, subjectId: '' }));
      }
      return;
    }

    if (form.subjectId && availableFormSubjects.some(subject => subject.id === form.subjectId)) {
      return;
    }

    setForm(prev => ({ ...prev, subjectId: availableFormSubjects[0].id }));
  }, [form.classId, form.subjectId, availableFormSubjects]);

  // Toggle subtopic selection
  const toggleSubTopic = (subTopicId: string) => {
    setSelectedSubTopicIds(prev =>
      prev.includes(subTopicId)
        ? prev.filter(id => id !== subTopicId)
        : [...prev, subTopicId]
    );
  };

  // Select all subtopics for current topic
  const selectAllSubTopics = () => {
    const topic = topics.find(t => t.id === selectedTopicId);
    if (topic?.subtopics) {
      setSelectedSubTopicIds(topic.subtopics.map(st => st.id));
    }
  };

  // AI-generate lesson plan from selected topic + subtopics
  const handleGenerateLessonPlan = async () => {
    if (!selectedTopicId) return;

    setGeneratingPlan(true);
    try {
      const selectedClass = classes.find(c => c.id === form.classId);
      const res = await syllabusService.generateLessonPlan({
        topicId: selectedTopicId,
        subTopicIds: selectedSubTopicIds.length > 0 ? selectedSubTopicIds : undefined,
        subjectId: form.subjectId || undefined,
        gradeLevel: selectedClass?.gradeLevel,
        durationMinutes: form.scheduledStart && form.scheduledEnd
          ? Math.round((new Date(form.scheduledEnd).getTime() - new Date(form.scheduledStart).getTime()) / 60000)
          : 45,
      });

      setForm(prev => ({ ...prev, lessonPlanContent: res.data.lessonPlan }));
      setGeneratedStructuredPlan(res.data.structuredLessonPlan || null);
    } catch (err: any) {
      console.error('Generate lesson plan error:', err);
      alert('Failed to generate lesson plan. Please try again or write it manually.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  // ==========================================
  // CREATE CLASSROOM
  // ==========================================
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.scheduledStart || !form.scheduledEnd) return;

    setCreating(true);
    try {
      await api.post('/virtual-classroom', {
        ...form,
        classId: form.classId || undefined,
        subjectId: form.subjectId || undefined,
        aiTutorVoiceId: form.aiTutorVoiceId || undefined,
        aiTutorPersona: form.aiTutorPersona || undefined,
        lessonPlanContent: form.lessonPlanContent || undefined,
        topicId: selectedTopicId || undefined,
        selectedSubTopicIds: selectedSubTopicIds.length > 0 ? selectedSubTopicIds : undefined,
      });

      setShowCreate(false);
      resetForm();
      fetchClassrooms();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      classId: '',
      subjectId: '',
      scheduledStart: '',
      scheduledEnd: '',
      aiTutorEnabled: true,
      aiTutorName: 'AI Teacher',
      aiTutorVoiceId: '',
      aiTutorPersona: '',
      lessonPlanContent: '',
      maxParticipants: 50,
    });
    setSelectedTopicId('');
    setSelectedSubTopicIds([]);
    setGeneratedStructuredPlan(null);
    setTopics([]);
  };

  const deleteClassroom = async (classroomId: string) => {
    if (!(await confirm({
      title: 'Delete virtual classroom?',
      message: 'Delete this virtual classroom?',
      confirmText: 'Delete classroom',
    }))) return;
    try {
      await api.delete(`/virtual-classroom/${classroomId}`);
      fetchClassrooms();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const startClassroom = async (classroomId: string) => {
    try {
      await api.post(`/virtual-classroom/${classroomId}/start`);
      fetchClassrooms();
    } catch (err) {
      console.error('Start error:', err);
    }
  };

  // ==========================================
  // FILTER & SEARCH
  // ==========================================
  const filtered = classrooms
    .filter(c => filter === 'all' || c.status === filter)
    .filter(c =>
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.subjectName?.toLowerCase().includes(search.toLowerCase()) ||
      c.className?.toLowerCase().includes(search.toLowerCase())
    );

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LIVE': return 'ds-badge-success';
      case 'SCHEDULED': return 'ds-badge-info';
      case 'ENDED': return 'ds-badge-neutral';
      case 'CANCELLED': return 'ds-badge-error';
      default: return 'ds-badge-neutral';
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="ds-page">
      {/* Header */}
      <PageHeader title="Virtual Classrooms" description="Live classes powered by Jitsi Meet with AI teaching assistant" actions={canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="ds-button-primary"
          >
            <Plus size={18} />
            New Classroom
          </button>
        )} />

      {/* Filters */}
      <div className="ds-card ds-toolbar">
        <div className="ds-field w-full sm:max-w-sm">
          <label htmlFor="classroom-search" className="ds-label">Search classrooms</label>
          <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
          <input
            id="classroom-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classrooms..."
            className="ds-input pl-9"
          />
          </div>
        </div>

        <div className="ds-actions" role="group" aria-label="Filter classrooms by status">
          {(['all', 'SCHEDULED', 'LIVE', 'ENDED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? 'ds-button-primary' : 'ds-button-outline'}
              aria-pressed={filter === f}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Classrooms Grid */}
      {loading ? (
        <div className="ds-card flex items-center justify-center py-20" role="status" aria-label="Loading virtual classrooms">
          <Loader2 className="w-8 h-8 text-[var(--action-color)] animate-spin" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="ds-card ds-empty">
          <Monitor className="w-12 h-12 mx-auto mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-1">
            No virtual classrooms
          </h3>
          <p className="ds-helper">
            {canCreate ? 'Create your first virtual classroom to get started' : 'No classrooms available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((classroom) => (
            <div
              key={classroom.id}
              className="ds-surface min-w-0 overflow-hidden"
            >
              {/* Card header */}
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {classroom.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {classroom.subjectName && `${classroom.subjectName}`}
                      {classroom.className && ` • ${classroom.className}`}
                    </p>
                  </div>
                  <span className={`ds-badge shrink-0 ${getStatusColor(classroom.status)}`}>
                    {classroom.status}
                  </span>
                </div>

                {/* Schedule */}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <Calendar size={12} />
                  <span>{formatDate(classroom.scheduledStart)}</span>
                </div>

                {/* AI Tutor badge */}
                {classroom.aiTutorEnabled && (
                  <div className="ds-badge ds-badge-info mb-3 w-fit">
                    <Brain size={14} aria-hidden="true" />
                    <span>
                      AI Tutor: {classroom.aiTutorName}
                    </span>
                    <Volume2 size={12} className="ml-1" aria-hidden="true" />
                  </div>
                )}

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-4 ds-helper">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {classroom._count.participants} joined
                  </span>
                  <span className="flex items-center gap-1">
                    <Bot size={12} /> {classroom._count.chatMessages} messages
                  </span>
                </div>

                {/* Teacher */}
                {classroom.teacherName && (
                  <p className="ds-helper mt-2">
                    <GraduationCap size={12} className="inline mr-1" />
                    {classroom.teacherName}
                  </p>
                )}
              </div>

              {/* Card footer actions */}
              <div className="px-4 sm:px-6 py-3 bg-[var(--surface-muted)] border-t border-[var(--border-color)] ds-actions">
                {classroom.status === 'LIVE' && (
                  <button
                    onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                    className="ds-button-primary flex-1"
                  >
                    <Video size={14} /> Join Class
                  </button>
                )}

                {classroom.status === 'SCHEDULED' && canCreate && (
                  <>
                    <button
                      onClick={() => {
                        startClassroom(classroom.id);
                        navigate(`/virtual-classroom/${classroom.id}`);
                      }}
                      className="ds-button-primary flex-1"
                    >
                      <Play size={14} /> Start Class
                    </button>
                    <button
                      onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                      className="ds-button-ghost"
                      aria-label={`Open classroom: ${classroom.title}`}
                    >
                      <Edit size={14} />
                    </button>
                  </>
                )}

                {classroom.status === 'ENDED' && (
                  <button
                    onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                    className="ds-button-secondary flex-1"
                  >
                    <BookOpen size={14} /> View Summary
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => deleteClassroom(classroom.id)}
                    className="ds-button-destructive"
                    aria-label={`Delete classroom: ${classroom.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==========================================
          CREATE CLASSROOM MODAL
          ========================================== */}
      {showCreate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="ds-surface w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="create-classroom-title">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
              <h2 id="create-classroom-title" className="flex items-center gap-2">
                <Video className="text-[var(--text-secondary)]" size={20} aria-hidden="true" />
                Create Virtual Classroom
              </h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="ds-button-ghost" aria-label="Close create classroom">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Class Details</h3>

                <div>
                  <label htmlFor="classroom-title" className="ds-label mb-2">Title (required)</label>
                  <input
                    id="classroom-title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Grade 7 Mathematics - Algebra"
                    className="ds-input"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="classroom-description" className="ds-label mb-2">Description</label>
                  <textarea
                    id="classroom-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description of the class..."
                    rows={2}
                    className="ds-textarea"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="classroom-class" className="ds-label mb-2">Class</label>
                    <select
                      id="classroom-class"
                      value={form.classId}
                      onChange={(e) => setForm({ ...form, classId: e.target.value })}
                      className="ds-select"
                    >
                      <option value="">Select class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="classroom-subject" className="ds-label mb-2">Subject</label>
                    <select
                      id="classroom-subject"
                      value={form.subjectId}
                      onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                      className="ds-select"
                    >
                      <option value="">Select subject...</option>
                      {availableFormSubjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="classroom-start" className="ds-label mb-2">Start Time (required)</label>
                    <input
                      id="classroom-start"
                      type="datetime-local"
                      value={form.scheduledStart}
                      onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
                      className="ds-input"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="classroom-end" className="ds-label mb-2">End Time (required)</label>
                    <input
                      id="classroom-end"
                      type="datetime-local"
                      value={form.scheduledEnd}
                      onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
                      className="ds-input"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Syllabus Topic Picker — shown when subject + class selected */}
              {form.subjectId && form.classId && (
                <div className="space-y-4 pt-6 border-t border-[var(--border-color)]">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <ListTree size={16} className="text-indigo-500" />
                    Syllabus Topic
                    <span className="ds-helper">(from curriculum)</span>
                  </h3>

                  {loadingTopics ? (
                    <div className="flex items-center gap-2 ds-helper py-2" role="status">
                      <Loader2 size={14} className="animate-spin" /> Loading topics...
                    </div>
                  ) : topics.length === 0 ? (
                    <p className="ds-helper py-2">
                      No syllabus topics found for this subject + grade. You can still write a lesson plan manually below.
                    </p>
                  ) : (
                    <>
                      {/* Topic dropdown */}
                      <div>
                        <label htmlFor="classroom-topic" className="ds-label mb-2">Select Topic</label>
                        <select
                          id="classroom-topic"
                          value={selectedTopicId}
                          onChange={(e) => {
                            setSelectedTopicId(e.target.value);
                            setSelectedSubTopicIds([]);
                            setGeneratedStructuredPlan(null);
                          }}
                          className="ds-select"
                        >
                          <option value="">Choose a topic from the syllabus...</option>
                          {topics.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.orderIndex > 0 ? `${t.orderIndex}. ` : ''}{t.title}
                              {t._count?.subtopics ? ` (${t._count.subtopics} subtopics)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Subtopic checkboxes */}
                      {selectedTopicId && (() => {
                        const topic = topics.find(t => t.id === selectedTopicId);
                        const subtopics = topic?.subtopics || [];

                        if (subtopics.length === 0) {
                          return (
                            <p className="ds-helper pl-1">
                              No subtopics defined for this topic yet.
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p id="classroom-subtopics-label" className="ds-label">
                                Select subtopics to cover ({selectedSubTopicIds.length}/{subtopics.length})
                              </p>
                              <button
                                type="button"
                                onClick={selectAllSubTopics}
                                className="ds-button-ghost"
                              >
                                Select all
                              </button>
                            </div>

                            <div className="ds-surface-muted max-h-40 overflow-y-auto space-y-1 p-2" role="group" aria-labelledby="classroom-subtopics-label" tabIndex={0}>
                              {subtopics.map(st => {
                                const isSelected = selectedSubTopicIds.includes(st.id);
                                const objectives = parseLearningObjectives(st.learningObjectives);

                                return (
                                  <label
                                    key={st.id}
                                    className="flex min-h-11 items-start gap-3 p-2 rounded-xl cursor-pointer"
                                  >
                                    <input type="checkbox" className="ds-choice mt-0.5" checked={isSelected} onChange={() => toggleSubTopic(st.id)} aria-label={st.title} />
                                    <span className="min-w-0">
                                      <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">
                                        {st.title}
                                      </span>
                                      {st.duration && (
                                        <span className="text-xs text-[var(--text-secondary)] ml-1">~{st.duration}min</span>
                                      )}
                                      {objectives.length > 0 && (
                                        <span className="block text-xs text-[var(--text-secondary)] mt-1">
                                          {objectives[0]}{objectives.length > 1 ? ` +${objectives.length - 1} more` : ''}
                                        </span>
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* AI Generate Lesson Plan button */}
                      {selectedTopicId && (
                        <>
                          <button
                            type="button"
                            onClick={handleGenerateLessonPlan}
                            disabled={generatingPlan}
                            className="ds-button-primary w-full"
                            aria-busy={generatingPlan || undefined}
                          >
                            {generatingPlan ? (
                              <><Loader2 size={14} className="animate-spin" /> Generating lesson plan with AI...</>
                            ) : (
                              <><Wand2 size={14} /> Generate Lesson Plan from Syllabus</>
                            )}
                          </button>

                          {generatedStructuredPlan && (
                            <div className="ds-card space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="ds-label">
                                    Timed Lesson Flow
                                  </p>
                                  <p className="ds-helper">
                                    {generatedStructuredPlan.totalDurationMinutes} minutes • {generatedStructuredPlan.segments.length} segments
                                  </p>
                                </div>
                                <span className="ds-badge ds-badge-info">
                                  {generatedStructuredPlan.source}
                                </span>
                              </div>

                              <div className="max-h-48 overflow-y-auto space-y-2" role="region" aria-label="Generated lesson segments" tabIndex={0}>
                                {generatedStructuredPlan.segments.map(segment => (
                                  <div
                                    key={`${segment.phase}-${segment.index}-${segment.title}`}
                                    className="ds-surface-muted px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
                                        {segment.index + 1}. {segment.title}
                                      </p>
                                      <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                                        {segment.phase} • {segment.durationMinutes}m
                                      </span>
                                    </div>
                                    {segment.objectives.length > 0 && (
                                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                                        {segment.objectives[0]}
                                        {segment.objectives.length > 1 ? ` +${segment.objectives.length - 1} more objective${segment.objectives.length > 2 ? 's' : ''}` : ''}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* AI Tutor Settings */}
              <div className="space-y-4 pt-6 border-t border-[var(--border-color)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Brain size={16} className="text-purple-500" />
                    AI Tutor Settings
                  </h3>
                  <label className="flex min-h-11 items-center gap-3 cursor-pointer ds-label">
                    <input
                      type="checkbox"
                      checked={form.aiTutorEnabled}
                      onChange={(e) => setForm({ ...form, aiTutorEnabled: e.target.checked })}
                      className="ds-choice"
                    />
                    Enable AI tutor
                  </label>
                </div>

                {form.aiTutorEnabled && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="classroom-tutor-name" className="ds-label mb-2">AI Teacher Name</label>
                        <input
                          id="classroom-tutor-name"
                          type="text"
                          value={form.aiTutorName}
                          onChange={(e) => setForm({ ...form, aiTutorName: e.target.value })}
                          placeholder="e.g. Ms. Moyo"
                          className="ds-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="classroom-voice" className="ds-label mb-2">Voice (ElevenLabs)</label>
                        <select
                          id="classroom-voice"
                          value={form.aiTutorVoiceId}
                          onChange={(e) => setForm({ ...form, aiTutorVoiceId: e.target.value })}
                          className="ds-select"
                        >
                          <option value="">Default voice</option>
                          {voices.map(v => (
                            <option key={v.voice_id} value={v.voice_id}>
                              {v.name} ({v.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="classroom-persona" className="ds-label mb-2">
                        Teacher Persona (optional)
                      </label>
                      <textarea
                        id="classroom-persona"
                        value={form.aiTutorPersona}
                        onChange={(e) => setForm({ ...form, aiTutorPersona: e.target.value })}
                        placeholder="e.g. You are Ms. Moyo, a warm and patient Mathematics teacher who loves using real-world examples..."
                        rows={3}
                        className="ds-textarea"
                      />
                    </div>

                    <div>
                      <label htmlFor="classroom-lesson-plan" className="ds-label mb-2">
                        Lesson Plan {selectedTopicId ? '(auto-generated from syllabus — edit if needed)' : '(optional)'}
                      </label>
                      {savedLessonPlans.length > 0 && (
                        <div className="mb-2">
                          <select
                            aria-label="Load a saved lesson plan"
                            onChange={(e) => {
                              const plan = savedLessonPlans.find(p => p.id === e.target.value);
                              if (plan) {
                                setForm(prev => ({ ...prev, lessonPlanContent: `📋 ${plan.title}\n\n${plan.content}` }));
                              }
                            }}
                            className="ds-select"
                            defaultValue=""
                          >
                            <option value="" disabled>📂 Load from saved lesson plan ({savedLessonPlans.length} available)...</option>
                            {savedLessonPlans.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.title} — {new Date(p.weekStartDate).toLocaleDateString()}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <textarea
                        id="classroom-lesson-plan"
                        value={form.lessonPlanContent}
                        onChange={(e) => setForm({ ...form, lessonPlanContent: e.target.value })}
                        placeholder={selectedTopicId
                          ? 'Click "Generate Lesson Plan from Syllabus" above, or write your own...'
                          : 'Paste or type the lesson plan here. The AI tutor will follow this plan during the class...'}
                        rows={5}
                        className="ds-textarea"
                      />
                    </div>

                    <div className="ds-alert ds-badge-info">
                      <Sparkles size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <p>
                        The AI tutor will join the class, greet students, follow the lesson plan, answer questions with natural voice (ElevenLabs),
                        and conduct quizzes — just like a real teacher.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="ds-form-actions border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  className="ds-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !form.title || !form.scheduledStart || !form.scheduledEnd}
                  className="ds-button-primary"
                  aria-busy={creating || undefined}
                >
                  {creating ? (
                    <><Loader2 size={14} className="animate-spin" /> Creating...</>
                  ) : (
                    <><Video size={14} /> Create Classroom</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
