import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  FileText, 
  ClipboardList, 
  Calendar, 
  Clock, 
  ChevronRight,
  Play,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  BookOpen
} from 'lucide-react';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';

interface VideoLesson {
  id: string;
  title: string;
  description: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  subject: { id: string; name: string };
  teacher: { id: string; fullName: string };
  class: { id: string; name: string };
}

interface Homework {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  maxPoints: number | null;
  subject: { id: string; name: string } | null;
  submitted: boolean;
  submissionStatus: string | null;
}

interface Assessment {
  id: string;
  title: string;
  type: string;
  date: string;
  totalMarks: number;
  subject: { id: string; name: string } | null;
  questionCount: number;
  completed: boolean;
  score: number | null;
}

interface RelatedContentProps {
  subjectId?: string;
  onAskAbout: (topic: string) => void;
}

const RelatedContent = ({ subjectId, onAskAbout }: RelatedContentProps) => {
  const navigate = useNavigate();
  const [videoLessons, setVideoLessons] = useState<VideoLesson[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'videos' | 'homework' | 'quizzes'>('videos');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchRelatedContent();
  }, [subjectId]);

  const fetchRelatedContent = async () => {
    setLoading(true);
    try {
      const baseUrl = subjectId ? `/ai-teacher/related` : `/ai-teacher/related`;
      const suffix = subjectId ? `/${subjectId}` : '';

      const [videosRes, homeworkRes, assessmentsRes] = await Promise.all([
        api.get(`${baseUrl}/video-lessons${suffix}`).catch(() => ({ data: [] })),
        api.get(`${baseUrl}/homework${suffix}`).catch(() => ({ data: [] })),
        api.get(`${baseUrl}/assessments${suffix}`).catch(() => ({ data: [] })),
      ]);

      setVideoLessons(videosRes.data || []);
      setHomework(homeworkRes.data || []);
      setAssessments(assessmentsRes.data || []);
    } catch (error) {
      console.error('Failed to fetch related content:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `In ${days} days`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const totalItems = videoLessons.length + homework.length + assessments.length;

  if (loading) {
    return (
      <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading related content...</span>
        </div>
      </div>
    );
  }

  if (totalItems === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
            <BookOpen size={18} className="text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white">Related Learning</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {totalItems} item{totalItems !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight size={20} className="text-gray-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Tabs */}
            <div className="flex border-t border-b border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('videos')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'videos'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Video size={16} />
                <span>Videos</span>
                {videoLessons.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs">
                    {videoLessons.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('homework')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'homework'
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <FileText size={16} />
                <span>Homework</span>
                {homework.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded text-xs">
                    {homework.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('quizzes')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'quizzes'
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <ClipboardList size={16} />
                <span>Quizzes</span>
                {assessments.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs">
                    {assessments.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="p-3 max-h-64 overflow-y-auto">
              {/* Video Lessons */}
              {activeTab === 'videos' && (
                <div className="space-y-2">
                  {videoLessons.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                      No upcoming video lessons
                    </p>
                  ) : (
                    videoLessons.map((lesson) => (
                      <motion.div
                        key={lesson.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {lesson.status === 'LIVE' && (
                                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-medium">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                  LIVE
                                </span>
                              )}
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {lesson.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {formatDate(lesson.scheduledStart)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                {formatTime(lesson.scheduledStart)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {lesson.teacher.fullName} • {lesson.subject.name}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            {lesson.status === 'LIVE' ? (
                              <button
                                onClick={() => navigate(`/video-lessons/${lesson.id}`)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors"
                              >
                                <Play size={12} />
                                Join
                              </button>
                            ) : (
                              <button
                                onClick={() => onAskAbout(`Prepare me for the upcoming lesson on "${lesson.title}" in ${lesson.subject.name}`)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors"
                              >
                                Prepare
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {/* Homework */}
              {activeTab === 'homework' && (
                <div className="space-y-2">
                  {homework.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                      No pending homework
                    </p>
                  ) : (
                    homework.map((hw) => (
                      <motion.div
                        key={hw.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {hw.submitted ? (
                                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                              ) : (
                                <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                              )}
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {hw.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                Due {formatDate(hw.dueDate)}
                              </span>
                              {hw.maxPoints && (
                                <span>{hw.maxPoints} pts</span>
                              )}
                            </div>
                            {hw.subject && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {hw.subject.name}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => onAskAbout(`Help me with my homework: "${hw.title}"${hw.subject ? ` in ${hw.subject.name}` : ''}`)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
                            >
                              Get Help
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}

              {/* Assessments/Quizzes */}
              {activeTab === 'quizzes' && (
                <div className="space-y-2">
                  {assessments.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
                      No upcoming quizzes
                    </p>
                  ) : (
                    assessments.map((quiz) => (
                      <motion.div
                        key={quiz.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {quiz.completed ? (
                                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                              ) : (
                                <ClipboardList size={14} className="text-green-500 flex-shrink-0" />
                              )}
                              <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                {quiz.title}
                              </h4>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Calendar size={12} />
                                {formatDate(quiz.date)}
                              </span>
                              <span>{quiz.questionCount} questions</span>
                              <span>{quiz.totalMarks} marks</span>
                            </div>
                            {quiz.subject && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {quiz.subject.name} • {quiz.type}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {quiz.completed ? (
                              <span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg text-xs font-medium">
                                {quiz.score}/{quiz.totalMarks}
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => onAskAbout(`Help me prepare for my ${quiz.type} on "${quiz.title}"${quiz.subject ? ` in ${quiz.subject.name}` : ''}. Create practice questions.`)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 transition-colors"
                                >
                                  Practice
                                </button>
                                <button
                                  onClick={() => navigate(`/student/quiz/${quiz.id}`)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors"
                                >
                                  <ExternalLink size={12} />
                                  Take Quiz
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RelatedContent;
