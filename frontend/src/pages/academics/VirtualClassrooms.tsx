import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Plus, Calendar, Users, Bot, Play, Trash2, Edit,
  Search, Loader2, GraduationCap, Brain, Sparkles,
  Monitor, BookOpen, X, Volume2, CheckSquare,
  Square, Wand2, ListTree
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
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
    if (!confirm('Delete this virtual classroom?')) return;
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
      case 'LIVE': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'SCHEDULED': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'ENDED': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'CANCELLED': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-xl">
              <Video className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            Virtual Classrooms
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Live classes powered by Jitsi Meet with AI teaching assistant
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition font-medium"
          >
            <Plus size={18} />
            New Classroom
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classrooms..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(['all', 'SCHEDULED', 'LIVE', 'ENDED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                filter === f
                  ? 'bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Classrooms Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Monitor className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-1">
            No virtual classrooms
          </h3>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {canCreate ? 'Create your first virtual classroom to get started' : 'No classrooms available'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((classroom) => (
            <div
              key={classroom.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition group"
            >
              {/* Card header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {classroom.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {classroom.subjectName && `${classroom.subjectName}`}
                      {classroom.className && ` • ${classroom.className}`}
                    </p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusColor(classroom.status)}`}>
                    {classroom.status === 'LIVE' && '🔴 '}
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
                  <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-purple-50 dark:bg-purple-900/30 rounded-lg w-fit">
                    <Brain size={14} className="text-purple-500" />
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                      AI Tutor: {classroom.aiTutorName}
                    </span>
                    <Volume2 size={12} className="text-purple-400 ml-1" />
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {classroom._count.participants} joined
                  </span>
                  <span className="flex items-center gap-1">
                    <Bot size={12} /> {classroom._count.chatMessages} messages
                  </span>
                </div>

                {/* Teacher */}
                {classroom.teacherName && (
                  <p className="text-xs text-gray-400 mt-2">
                    <GraduationCap size={12} className="inline mr-1" />
                    {classroom.teacherName}
                  </p>
                )}
              </div>

              {/* Card footer actions */}
              <div className="px-5 py-3 bg-gray-50 dark:bg-gray-750 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
                {classroom.status === 'LIVE' && (
                  <button
                    onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
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
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                    >
                      <Play size={14} /> Start Class
                    </button>
                    <button
                      onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                      <Edit size={14} />
                    </button>
                  </>
                )}

                {classroom.status === 'ENDED' && (
                  <button
                    onClick={() => navigate(`/virtual-classroom/${classroom.id}`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                  >
                    <BookOpen size={14} /> View Summary
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => deleteClassroom(classroom.id)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold flex items-center gap-2 dark:text-white">
                <Sparkles className="text-purple-500" size={20} />
                Create Virtual Classroom
              </h2>
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* Modal form */}
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Class Details</h3>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Title *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Grade 7 Mathematics - Algebra"
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description of the class..."
                    rows={2}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Class</label>
                    <select
                      value={form.classId}
                      onChange={(e) => setForm({ ...form, classId: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                    >
                      <option value="">Select class...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                    <select
                      value={form.subjectId}
                      onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                    >
                      <option value="">Select subject...</option>
                      {(() => {
                        const cls = classes.find(c => c.id === form.classId);
                        const classSubjectIds = new Set((cls?.subjects || []).map(s => s.id));
                        const filtered = classSubjectIds.size > 0
                          ? subjects.filter(s => classSubjectIds.has(s.id))
                          : subjects;
                        return filtered.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start Time *</label>
                    <input
                      type="datetime-local"
                      value={form.scheduledStart}
                      onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End Time *</label>
                    <input
                      type="datetime-local"
                      value={form.scheduledEnd}
                      onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Syllabus Topic Picker — shown when subject + class selected */}
              {form.subjectId && form.classId && (
                <div className="space-y-3 pt-3 border-t dark:border-gray-700">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <ListTree size={16} className="text-indigo-500" />
                    Syllabus Topic
                    <span className="text-xs font-normal text-gray-400">(from curriculum)</span>
                  </h3>

                  {loadingTopics ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                      <Loader2 size={14} className="animate-spin" /> Loading topics...
                    </div>
                  ) : topics.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">
                      No syllabus topics found for this subject + grade. You can still write a lesson plan manually below.
                    </p>
                  ) : (
                    <>
                      {/* Topic dropdown */}
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Select Topic</label>
                        <select
                          value={selectedTopicId}
                          onChange={(e) => {
                            setSelectedTopicId(e.target.value);
                            setSelectedSubTopicIds([]);
                            setGeneratedStructuredPlan(null);
                          }}
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
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
                            <p className="text-xs text-gray-400 pl-1">
                              No subtopics defined for this topic yet.
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs text-gray-500 dark:text-gray-400">
                                Select subtopics to cover ({selectedSubTopicIds.length}/{subtopics.length})
                              </label>
                              <button
                                type="button"
                                onClick={selectAllSubTopics}
                                className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
                              >
                                Select all
                              </button>
                            </div>

                            <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border dark:border-gray-600 p-2 bg-gray-50 dark:bg-gray-750">
                              {subtopics.map(st => {
                                const isSelected = selectedSubTopicIds.includes(st.id);
                                const objectives = parseLearningObjectives(st.learningObjectives);

                                return (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => toggleSubTopic(st.id)}
                                    className={`w-full text-left flex items-start gap-2 p-2 rounded-lg transition text-sm ${
                                      isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                                    }`}
                                  >
                                    {isSelected ? (
                                      <CheckSquare size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                                    ) : (
                                      <Square size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <span className="font-medium text-gray-800 dark:text-gray-200 text-xs">
                                        {st.title}
                                      </span>
                                      {st.duration && (
                                        <span className="text-[10px] text-gray-400 ml-1">~{st.duration}min</span>
                                      )}
                                      {objectives.length > 0 && (
                                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                          {objectives[0]}{objectives.length > 1 ? ` +${objectives.length - 1} more` : ''}
                                        </p>
                                      )}
                                    </div>
                                  </button>
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
                            className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 text-xs font-medium transition w-full justify-center"
                          >
                            {generatingPlan ? (
                              <><Loader2 size={14} className="animate-spin" /> Generating lesson plan with AI...</>
                            ) : (
                              <><Wand2 size={14} /> Generate Lesson Plan from Syllabus</>
                            )}
                          </button>

                          {generatedStructuredPlan && (
                            <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                    Timed Lesson Flow
                                  </p>
                                  <p className="text-[11px] text-indigo-600/80 dark:text-indigo-300/70">
                                    {generatedStructuredPlan.totalDurationMinutes} minutes • {generatedStructuredPlan.segments.length} segments
                                  </p>
                                </div>
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/80 dark:bg-slate-900/60 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700">
                                  {generatedStructuredPlan.source}
                                </span>
                              </div>

                              <div className="max-h-48 overflow-y-auto space-y-2">
                                {generatedStructuredPlan.segments.map(segment => (
                                  <div
                                    key={`${segment.phase}-${segment.index}-${segment.title}`}
                                    className="rounded-lg bg-white/80 dark:bg-slate-900/40 border border-indigo-100 dark:border-indigo-900 px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
                                        {segment.index + 1}. {segment.title}
                                      </p>
                                      <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {segment.phase} • {segment.durationMinutes}m
                                      </span>
                                    </div>
                                    {segment.objectives.length > 0 && (
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
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
              <div className="space-y-3 pt-3 border-t dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Brain size={16} className="text-purple-500" />
                    AI Tutor Settings
                  </h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.aiTutorEnabled}
                      onChange={(e) => setForm({ ...form, aiTutorEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {form.aiTutorEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">AI Teacher Name</label>
                        <input
                          type="text"
                          value={form.aiTutorName}
                          onChange={(e) => setForm({ ...form, aiTutorName: e.target.value })}
                          placeholder="e.g. Ms. Moyo"
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Voice (ElevenLabs)</label>
                        <select
                          value={form.aiTutorVoiceId}
                          onChange={(e) => setForm({ ...form, aiTutorVoiceId: e.target.value })}
                          className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
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
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Teacher Persona (optional)
                      </label>
                      <textarea
                        value={form.aiTutorPersona}
                        onChange={(e) => setForm({ ...form, aiTutorPersona: e.target.value })}
                        placeholder="e.g. You are Ms. Moyo, a warm and patient Mathematics teacher who loves using real-world examples..."
                        rows={3}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Lesson Plan {selectedTopicId ? '(auto-generated from syllabus — edit if needed)' : '(optional)'}
                      </label>
                      {savedLessonPlans.length > 0 && (
                        <div className="mb-2">
                          <select
                            onChange={(e) => {
                              const plan = savedLessonPlans.find(p => p.id === e.target.value);
                              if (plan) {
                                setForm(prev => ({ ...prev, lessonPlanContent: `📋 ${plan.title}\n\n${plan.content}` }));
                              }
                            }}
                            className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white"
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
                        value={form.lessonPlanContent}
                        onChange={(e) => setForm({ ...form, lessonPlanContent: e.target.value })}
                        placeholder={selectedTopicId
                          ? 'Click "Generate Lesson Plan from Syllabus" above, or write your own...'
                          : 'Paste or type the lesson plan here. The AI tutor will follow this plan during the class...'}
                        rows={5}
                        className="w-full px-3 py-2 border dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 dark:text-white resize-none"
                      />
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                      <Sparkles size={14} className="text-purple-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-purple-700 dark:text-purple-300">
                        The AI tutor will join the class, greet students, follow the lesson plan, answer questions with natural voice (ElevenLabs),
                        and conduct quizzes — just like a real teacher.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); resetForm(); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !form.title || !form.scheduledStart || !form.scheduledEnd}
                  className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
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
