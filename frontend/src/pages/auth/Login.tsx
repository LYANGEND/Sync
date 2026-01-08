import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../utils/api';
import {
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  BookOpen,
  Users,
  Calendar,
  FileBarChart
} from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { refreshSettings } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;
      login(token, user);

      // Refresh theme settings to get tenant-specific branding
      await refreshSettings();

      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row bg-white md:overflow-hidden">
      {/* Left Panel - Branding & Information */}
      <div className="hidden md:flex md:w-1/2 bg-[#0056b3] text-white p-6 md:p-12 flex-col justify-between relative h-full">
        {/* Decorative Circle (Optional subtle gradient effect) */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600 to-blue-800 opacity-50 z-0"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-8">
            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
              <GraduationCap size={28} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Sync Portal</span>
          </div>

          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Empowering Education Through Technology
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed opacity-90">
              Manage students, track attendance, monitor grades, and streamline your school operations all in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8 max-w-lg">
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 hover:bg-white/20 transition-colors">
              <BookOpen className="mb-3 text-blue-200" size={24} />
              <h3 className="font-semibold">Grades</h3>
              <p className="text-sm text-blue-100 opacity-80">Track academic progress</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 hover:bg-white/20 transition-colors">
              <Users className="mb-3 text-blue-200" size={24} />
              <h3 className="font-semibold">Students</h3>
              <p className="text-sm text-blue-100 opacity-80">Manage enrollment</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 hover:bg-white/20 transition-colors">
              <Calendar className="mb-3 text-blue-200" size={24} />
              <h3 className="font-semibold">Schedule</h3>
              <p className="text-sm text-blue-100 opacity-80">Organize timetables</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 hover:bg-white/20 transition-colors">
              <FileBarChart className="mb-3 text-blue-200" size={24} />
              <h3 className="font-semibold">Reports</h3>
              <p className="text-sm text-blue-100 opacity-80">Generate Insights</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-12 md:mt-0 text-sm text-blue-200 opacity-60">
          © {new Date().getFullYear()} Sync Portal. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white md:h-full md:overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            {/* Mobile Logo */}
            <div className="flex items-center space-x-2 md:hidden mb-6">
              <div className="bg-blue-600 p-2 rounded-lg">
                <GraduationCap size={24} className="text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-blue-900">Sync Portal</span>
            </div>

            <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100 flex items-center">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email or ID
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="student@school.edu"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <a href="#" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600">
                Keep me signed in
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-[#0056b3] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-500">
              Need help?{' '}
              <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                Contact IT Support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
