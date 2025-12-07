import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';
import api from '../../utils/api';

interface VideoData {
  id: string;
  title: string;
  description: string;
  subject: { name: string };
  topic?: { title: string };
  teacher: { fullName: string };
  duration: number;
  videoUrl: string;
  transcript?: string;
  progress?: {
    watchedSeconds: number;
    completed: boolean;
    lastPosition: number;
  };
}

const VideoPlayer: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  
  const [video, setVideo] = useState<VideoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchVideo();
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      saveProgress();
    };
  }, [videoId]);

  const fetchVideo = async () => {
    try {
      const response = await api.get(`/video-lessons/videos/${videoId}`);
      setVideo(response.data);
      setLoading(false);

      // Resume from last position
      if (response.data.progress?.lastPosition && videoRef.current) {
        videoRef.current.currentTime = response.data.progress.lastPosition;
      }
    } catch (error) {
      console.error('Failed to fetch video:', error);
      setLoading(false);
    }
  };

  const saveProgress = async () => {
    if (!videoRef.current || !video) return;

    const currentTime = Math.floor(videoRef.current.currentTime);
    const completed = currentTime >= video.duration - 10; // Consider completed if within 10s of end

    try {
      await api.post(`/video-lessons/videos/${videoId}/progress`, {
        watchedSeconds: currentTime,
        lastPosition: currentTime,
        completed,
      });
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
      
      // Start progress tracking
      if (!progressIntervalRef.current) {
        progressIntervalRef.current = setInterval(saveProgress, 10000); // Save every 10 seconds
      }
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const changeSpeed = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading video...</p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Video not found</p>
          <button
            onClick={() => navigate('/student/video-library')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/student/video-library')}
          className="text-white hover:text-gray-300"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{video.title}</h1>
          <p className="text-sm text-gray-400">
            {video.subject.name} • {video.teacher.fullName}
          </p>
        </div>
      </div>

      {/* Video Player */}
      <div className="relative bg-black">
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="w-full max-h-[70vh]"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={saveProgress}
        />

        {/* Video Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white hover:text-gray-300"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            {/* Volume */}
            <button
              onClick={toggleMute}
              className="text-white hover:text-gray-300"
            >
              {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Speed Control */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-white hover:text-gray-300 flex items-center gap-2"
              >
                <Settings size={20} />
                <span className="text-sm">{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-lg py-2 min-w-[100px]">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => changeSpeed(speed)}
                      className={`w-full px-4 py-2 text-left text-white hover:bg-gray-700 ${
                        playbackSpeed === speed ? 'bg-gray-700' : ''
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-gray-300"
            >
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Video Info */}
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">{video.title}</h2>
          
          {video.topic && (
            <div className="mb-4">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {video.topic.title}
              </span>
            </div>
          )}

          <p className="text-gray-600 mb-6">{video.description}</p>

          <div className="flex items-center gap-6 text-sm text-gray-500 mb-6">
            <span>Subject: <strong>{video.subject.name}</strong></span>
            <span>Teacher: <strong>{video.teacher.fullName}</strong></span>
            <span>Duration: <strong>{Math.ceil(video.duration / 60)} minutes</strong></span>
          </div>

          {video.transcript && (
            <div className="border-t pt-6">
              <h3 className="font-semibold text-gray-800 mb-3">Transcript</h3>
              <div className="text-gray-600 whitespace-pre-wrap">
                {video.transcript}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
