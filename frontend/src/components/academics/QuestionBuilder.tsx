import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, CheckCircle, XCircle, Sparkles, X, Loader2 } from 'lucide-react';
import api from '../../utils/api';

interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

interface Question {
  id?: string;
  text: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY';
  points: number;
  options?: QuestionOption[];
  correctAnswer?: string;
}

interface QuestionBuilderProps {
  assessmentId: string;
  subjectId?: string;
  subjectName?: string;
  onClose: () => void;
}

const QuestionBuilder: React.FC<QuestionBuilderProps> = ({ assessmentId, subjectId, subjectName, onClose }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI Generation State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiGenerating, setAIGenerating] = useState(false);
  const [aiQuestionCount, setAIQuestionCount] = useState(5);
  const [aiDifficulty, setAIDifficulty] = useState('medium');
  const [aiQuestionTypes, setAIQuestionTypes] = useState<string[]>(['MULTIPLE_CHOICE']);
  const [aiTopicName, setAITopicName] = useState('');
  const [aiGeneratedQuestions, setAIGeneratedQuestions] = useState<Question[]>([]);

  // New Question State
  const [newQuestion, setNewQuestion] = useState<Question>({
    text: '',
    type: 'MULTIPLE_CHOICE',
    points: 1,
    options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }]
  });

  useEffect(() => {
    fetchQuestions();
  }, [assessmentId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/online-assessments/${assessmentId}/questions`);
      setQuestions(response.data);
    } catch (error) {
      console.error('Failed to fetch questions', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOption = () => {
    if (newQuestion.options) {
      setNewQuestion({
        ...newQuestion,
        options: [...newQuestion.options, { text: '', isCorrect: false }]
      });
    }
  };

  const handleOptionChange = (index: number, field: 'text' | 'isCorrect', value: any) => {
    if (!newQuestion.options) return;
    
    const updatedOptions = [...newQuestion.options];
    if (field === 'isCorrect') {
      // If single choice, uncheck others
      updatedOptions.forEach(opt => opt.isCorrect = false);
      updatedOptions[index].isCorrect = value;
    } else {
      updatedOptions[index].text = value;
    }
    
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const handleRemoveOption = (index: number) => {
    if (!newQuestion.options) return;
    const updatedOptions = newQuestion.options.filter((_, i) => i !== index);
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const handleAddQuestion = () => {
    if (!newQuestion.text) return;
    
    setQuestions([...questions, newQuestion]);
    
    // Reset form
    setNewQuestion({
      text: '',
      type: 'MULTIPLE_CHOICE',
      points: 1,
      options: [{ text: '', isCorrect: false }, { text: '', isCorrect: false }]
    });
  };

  const handleAIGenerate = async () => {
    if (!subjectId) {
      alert('Subject information not available for AI generation.');
      return;
    }
    setAIGenerating(true);
    try {
      const response = await api.post('/syllabus/generate-questions', {
        subjectId,
        topicName: aiTopicName || undefined,
        questionCount: aiQuestionCount,
        questionTypes: aiQuestionTypes,
        difficulty: aiDifficulty,
      });
      setAIGeneratedQuestions(response.data.questions || []);
    } catch (error) {
      console.error('AI question generation failed:', error);
      alert('Failed to generate questions. Please check your AI configuration in settings.');
    } finally {
      setAIGenerating(false);
    }
  };

  const handleAddAIQuestions = () => {
    setQuestions([...questions, ...aiGeneratedQuestions]);
    setAIGeneratedQuestions([]);
    setShowAIModal(false);
    setAITopicName('');
  };

  const handleSaveAll = async () => {
    try {
      setSaving(true);
      // Only save new questions (those without ID)
      // Ideally we should handle updates too, but for now let's just push all as new or handle bulk replace
      // The backend endpoint adds questions.
      
      // Filter out questions that already have an ID (assuming they are saved)
      // Actually the backend adds questions, so we should only send the new ones.
      // But the UI state here mixes fetched and new.
      // Let's just send the ones that don't have an ID.
      
      const questionsToSave = questions.filter(q => !q.id);
      
      if (questionsToSave.length === 0) {
        alert('No new questions to save');
        return;
      }

      await api.post(`/online-assessments/${assessmentId}/questions`, {
        questions: questionsToSave
      });
      
      alert('Questions saved successfully');
      fetchQuestions(); // Refresh
    } catch (error) {
      console.error('Failed to save questions', error);
      alert('Failed to save questions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Question Builder</h2>
        <div className="flex gap-2">
          {subjectId && (
            <button
              onClick={() => { setShowAIModal(true); setAIGeneratedQuestions([]); }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all"
            >
              <Sparkles size={18} />
              AI Generate
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
            Close
          </button>
          <button 
            onClick={handleSaveAll} 
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Questions'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Question Form */}
        <div className="space-y-6 border-r border-gray-200 pr-6">
          <h3 className="font-semibold text-gray-700">Add New Question</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
            <textarea
              value={newQuestion.text}
              onChange={e => setNewQuestion({ ...newQuestion, text: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="Enter question text..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={newQuestion.type}
                onChange={e => setNewQuestion({ ...newQuestion, type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                <option value="TRUE_FALSE">True/False</option>
                <option value="SHORT_ANSWER">Short Answer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
              <input
                type="number"
                min="1"
                value={newQuestion.points}
                onChange={e => setNewQuestion({ ...newQuestion, points: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Options for Multiple Choice */}
          {newQuestion.type === 'MULTIPLE_CHOICE' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Options</label>
              {newQuestion.options?.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={option.isCorrect}
                    onChange={() => handleOptionChange(index, 'isCorrect', true)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <input
                    type="text"
                    value={option.text}
                    onChange={e => handleOptionChange(index, 'text', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={`Option ${index + 1}`}
                  />
                  <button 
                    onClick={() => handleRemoveOption(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddOption}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <Plus size={16} /> Add Option
              </button>
            </div>
          )}

          {/* Options for True/False */}
          {newQuestion.type === 'TRUE_FALSE' && (
             <div className="space-y-3">
             <label className="block text-sm font-medium text-gray-700">Correct Answer</label>
             <div className="flex gap-4">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input
                   type="radio"
                   name="tfCorrect"
                   checked={newQuestion.options?.[0]?.isCorrect}
                   onChange={() => {
                     setNewQuestion({
                       ...newQuestion,
                       options: [
                         { text: 'True', isCorrect: true },
                         { text: 'False', isCorrect: false }
                       ]
                     });
                   }}
                   className="w-4 h-4 text-blue-600"
                 />
                 <span>True</span>
               </label>
               <label className="flex items-center gap-2 cursor-pointer">
                 <input
                   type="radio"
                   name="tfCorrect"
                   checked={newQuestion.options?.[1]?.isCorrect}
                   onChange={() => {
                     setNewQuestion({
                       ...newQuestion,
                       options: [
                         { text: 'True', isCorrect: false },
                         { text: 'False', isCorrect: true }
                       ]
                     });
                   }}
                   className="w-4 h-4 text-blue-600"
                 />
                 <span>False</span>
               </label>
             </div>
           </div>
          )}

          <button
            onClick={handleAddQuestion}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Add Question to List
          </button>
        </div>

        {/* Right: Question List */}
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          <h3 className="font-semibold text-gray-700">Questions ({questions.length})</h3>
          {questions.length === 0 && (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              No questions added yet.
            </div>
          )}
          {questions.map((q, i) => (
            <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200 relative group">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-gray-900">Q{i + 1}. {q.text}</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{q.type}</span>
              </div>
              
              {q.type === 'MULTIPLE_CHOICE' && (
                <ul className="space-y-1 ml-4 mt-2">
                  {q.options?.map((opt, j) => (
                    <li key={j} className={`text-sm flex items-center gap-2 ${opt.isCorrect ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                      {opt.isCorrect ? <CheckCircle size={14} /> : <div className="w-3.5" />}
                      {opt.text}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 text-xs text-gray-500 text-right">
                {q.points} points
              </div>
              
              {!q.id && (
                <button 
                  onClick={() => {
                    const newQs = questions.filter((_, idx) => idx !== i);
                    setQuestions(newQs);
                  }}
                  className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AI Question Generation Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">AI Question Generator</h2>
                  {subjectName && <p className="text-sm text-gray-500 dark:text-gray-400">{subjectName}</p>}
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {aiGeneratedQuestions.length === 0 ? (
              /* Config Step */
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic (optional)</label>
                  <input
                    type="text"
                    value={aiTopicName}
                    onChange={e => setAITopicName(e.target.value)}
                    placeholder="e.g., Photosynthesis, Quadratic Equations..."
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of Questions</label>
                    <select
                      value={aiQuestionCount}
                      onChange={e => setAIQuestionCount(Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                    >
                      {[3, 5, 7, 10, 15].map(n => (
                        <option key={n} value={n}>{n} questions</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulty</label>
                    <select
                      value={aiDifficulty}
                      onChange={e => setAIDifficulty(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-slate-700 dark:text-white"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Question Types</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
                      { value: 'TRUE_FALSE', label: 'True/False' },
                      { value: 'SHORT_ANSWER', label: 'Short Answer' },
                    ].map(type => (
                      <button
                        key={type.value}
                        onClick={() => {
                          setAIQuestionTypes(prev =>
                            prev.includes(type.value)
                              ? prev.filter(t => t !== type.value).length > 0 ? prev.filter(t => t !== type.value) : prev
                              : [...prev, type.value]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          aiQuestionTypes.includes(type.value)
                            ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
                            : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowAIModal(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAIGenerate}
                    disabled={aiGenerating}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Questions
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Preview Step */
              <div className="p-6 space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    {aiGeneratedQuestions.length} questions generated!
                  </span>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {aiGeneratedQuestions.map((q, i) => (
                    <div key={i} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-gray-900 dark:text-white">Q{i + 1}. {q.text}</span>
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded ml-2 flex-shrink-0">{q.type}</span>
                      </div>
                      {q.options && (
                        <ul className="space-y-1 ml-4 mt-2">
                          {q.options.map((opt, j) => (
                            <li key={j} className={`text-sm flex items-center gap-2 ${opt.isCorrect ? 'text-green-700 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                              {opt.isCorrect ? <CheckCircle size={14} /> : <span className="w-3.5" />}
                              {opt.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      {q.correctAnswer && (
                        <p className="text-sm text-green-700 mt-2 ml-4">✓ Answer: {q.correctAnswer}</p>
                      )}
                      <div className="mt-2 text-xs text-gray-500 text-right">{q.points} points</div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    onClick={() => setAIGeneratedQuestions([])}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-2"
                  >
                    <Sparkles size={16} />
                    Regenerate
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowAIModal(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleAddAIQuestions}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus size={16} />
                      Add All to Assessment
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBuilder;
