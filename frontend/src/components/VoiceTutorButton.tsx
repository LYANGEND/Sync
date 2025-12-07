import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Sparkles } from 'lucide-react';

interface VoiceTutorButtonProps {
  topicId?: string;
  subjectId?: string;
  variant?: 'primary' | 'secondary' | 'floating';
  className?: string;
}

/**
 * Quick access button to launch Voice AI Tutor
 * Can be placed anywhere in the app
 */
const VoiceTutorButton: React.FC<VoiceTutorButtonProps> = ({
  topicId,
  subjectId,
  variant = 'primary',
  className = '',
}) => {
  const navigate = useNavigate();

  const handleClick = () => {
    const params = new URLSearchParams();
    if (topicId) params.append('topicId', topicId);
    if (subjectId) params.append('subjectId', subjectId);
    
    const queryString = params.toString();
    navigate(`/student/voice-tutor${queryString ? `?${queryString}` : ''}`);
  };

  if (variant === 'floating') {
    return (
      <button
        onClick={handleClick}
        className={`fixed bottom-6 right-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 z-50 ${className}`}
        title="Ask AI Tutor"
      >
        <div className="relative">
          <Mic size={28} />
          <Sparkles
            size={16}
            className="absolute -top-1 -right-1 text-yellow-300 animate-pulse"
          />
        </div>
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button
        onClick={handleClick}
        className={`flex items-center gap-2 px-4 py-2 bg-white border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors ${className}`}
      >
        <Mic size={20} />
        <span className="font-medium">Ask AI Tutor</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 shadow-md hover:shadow-lg transition-all ${className}`}
    >
      <Mic size={20} />
      <span className="font-medium">Voice AI Tutor</span>
      <Sparkles size={16} className="animate-pulse" />
    </button>
  );
};

export default VoiceTutorButton;
