import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Clock, CheckCircle, Search, Filter } from 'lucide-react';
import api from '../../utils/api';

interface Video {
  id: string;
  title: string;
  description: string;
  subject: { name: string };
  topic?: { title: string };
  teacher: { fullName: string };
  duration: number;
  thumbnailUrl?: string;
  viewCount: number;
  progress?: {
    watchedSeconds: number;
    completed: boolean;
    lastPosition: number;
  };
}

const VideoLibrary: React.FC = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [subjects, setSubjects] = useState<string[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    fetchVideos();
  }, []);

  useEffect(() => {
    filterVideos();
  }, [searchQuery, selectedSubject, videos]);

  const fetchVideos = async () => {
    try {
      const response = await api.get('/video-lessons/my-library');
      setVideos(response.data);
      
      // Extract unique subjects
      const uniqueSubjects = [...new Set(response.data.map((v: Video) => v.subject.name))];
      setSubjects(uniqueSubjects);
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      setLoading(false);
    }
  };

  const filterVideos = () => {
    let filtered = videos;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (v) =>
          v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.subject.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by subject
    if (selectedSubject !== 'all') {
      filtered = filtered.filter((v) => v.subject.name === selectedSubject);
    }

    setFilteredVideos(filtered);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (video: Video) => {
    if (!video.progress) return 0;
    return Math.round((video.progress.watchedSeconds / video.duration) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading videos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Video Library</h1>
        <p className="text-gray-600">Watch lessons at your own pace</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Subject Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              <option value="all">All Subjects</option>
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Videos Grid */}
      {filteredVideos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No videos found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map((video) => {
            const progress = getProgressPercentage(video);
            
            return (
              <div
                key={video.id}
                onClick={() => navigate(`/student/video/${video.id}`)}
                className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gray-200">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play size={48} className="text-gray-400" />
                    </div>
                  )}
                  
                  {/* Duration Badge */}
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                    {formatDuration(video.duration)}
                  </div>

                  {/* Completed Badge */}
                  {video.progress?.completed && (
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                      <CheckCircle size={14} />
                      Completed
                    </div>
                  )}

                  {/* Progress Bar */}
                  {progress > 0 && !video.progress?.completed && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300">
                      <div
                        className="h-full bg-blue-600"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                    {video.title}
                  </h3>
                  
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {video.description}
                  </p>

                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span className="font-medium text-blue-600">{video.subject.name}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {Math.ceil(video.duration / 60)} min
                    </span>
                  </div>

                  {video.topic && (
                    <div className="mt-2 text-xs text-gray-500">
                      Topic: {video.topic.title}
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-400">
                    By {video.teacher.fullName}
                  </div>

                  {progress > 0 && !video.progress?.completed && (
                    <div className="mt-3 text-sm text-blue-600">
                      {progress}% watched
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VideoLibrary;
