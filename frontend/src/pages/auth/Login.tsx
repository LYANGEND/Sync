import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { isPlatformHost } from '../../utils/platformAccess';
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

const DEFAULT_TENANT_SLUG = 'lyangend';

const resolveTenantSlug = () => {
  const storedSlug = localStorage.getItem('tenantSlug');
  if (storedSlug && storedSlug.trim()) return storedSlug.trim();

  const host = window.location.hostname.toLowerCase();
  const normalizedHost = host.split(':')[0];
  const candidate = normalizedHost.includes('.') ? normalizedHost.split('.')[0] : normalizedHost;

  if (candidate && !['localhost', '127', '0', 'www'].includes(candidate)) {
    return candidate;
  }

  return DEFAULT_TENANT_SLUG;
};

const Login = () => {
  const [tenantSlug, setTenantSlug] = useState(() => resolveTenantSlug());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicSettings, setPublicSettings] = useState<{ schoolName?: string; logoUrl?: string }>({});
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPlatformHost()) {
      navigate('/ops/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const slug = resolveTenantSlug();
    setTenantSlug(slug);

    if (!slug) return;
    localStorage.setItem('tenantSlug', slug);

    api.get('/settings/public', { headers: { 'X-Tenant-Slug': slug } })
      .then(r => setPublicSettings(r.data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const slug = resolveTenantSlug();
      if (!slug) {
        setError('Unable to identify your school portal. Please open the correct school link.');
        setLoading(false);
        return;
      }

      localStorage.removeItem('platformSession');
      localStorage.setItem('tenantSlug', slug);
      const response = await api.post('/auth/login', { email, password });

      const { token, user } = response.data;
      login(token, user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:flex-row bg-white dark:bg-slate-900 md:overflow-hidden">
      {/* Left Panel - Branding */}
      <div className="hidden md:flex md:w-1/2 text-white p-6 md:p-12 flex-col justify-between relative h-full overflow-hidden" style={{ background: '#003366' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(135deg, #0047AB 0%, #FF9933 100%)' }}></div>
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10" style={{ background: '#FF9933' }}></div>
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-8" style={{ background: '#0047AB' }}></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-10">
            {publicSettings.logoUrl ? (
              <img
                src={publicSettings.logoUrl}
                alt="School Logo"
                className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1 backdrop-blur-sm"
              />
            ) : (
              <div className="p-2.5 rounded-xl backdrop-blur-sm" style={{ background: 'rgba(255, 153, 51, 0.2)', border: '1px solid rgba(255, 153, 51, 0.3)' }}>
                <GraduationCap size={28} className="text-white" />
              </div>
            )}
            <span className="text-2xl font-bold tracking-tight">{publicSettings.schoolName || 'Sync Portal'}</span>
          </div>

          <div className="space-y-6 max-w-lg">
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Run your school<br />
              <span style={{ color: '#FF9933' }}>in sync.</span>
            </h1>
            <p className="text-lg leading-relaxed opacity-80">
              Manage students, track attendance, monitor grades, and streamline your school operations — all in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-10 max-w-lg">
            <div className="backdrop-blur-md p-4 rounded-xl transition-colors" style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <BookOpen className="mb-3 opacity-80" size={24} style={{ color: '#FFB366' }} />
              <h3 className="font-semibold text-sm">Grades</h3>
              <p className="text-xs opacity-60 mt-1">Track academic progress</p>
            </div>
            <div className="backdrop-blur-md p-4 rounded-xl transition-colors" style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <Users className="mb-3 opacity-80" size={24} style={{ color: '#FFB366' }} />
              <h3 className="font-semibold text-sm">Students</h3>
              <p className="text-xs opacity-60 mt-1">Manage enrollment</p>
            </div>
            <div className="backdrop-blur-md p-4 rounded-xl transition-colors" style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <Calendar className="mb-3 opacity-80" size={24} style={{ color: '#FFB366' }} />
              <h3 className="font-semibold text-sm">Schedule</h3>
              <p className="text-xs opacity-60 mt-1">Organize timetables</p>
            </div>
            <div className="backdrop-blur-md p-4 rounded-xl transition-colors" style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <FileBarChart className="mb-3 opacity-80" size={24} style={{ color: '#FFB366' }} />
              <h3 className="font-semibold text-sm">Reports</h3>
              <p className="text-xs opacity-60 mt-1">Generate insights</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-sm opacity-50">
          © {new Date().getFullYear()} Livingi Labz. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="md:w-1/2 flex items-center justify-center p-6 md:p-12 bg-slate-50 dark:bg-slate-900 md:h-full md:overflow-y-auto">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-none md:p-8">
          <div className="space-y-2 mb-6">
            {/* Mobile Logo */}
            <div className="flex items-center space-x-2 md:hidden mb-4">
              {publicSettings.logoUrl ? (
                <img
                  src={publicSettings.logoUrl}
                  alt="Logo"
                  className="w-10 h-10 rounded-lg object-contain"
                />
              ) : (
                <div className="p-2 rounded-lg" style={{ background: '#0047AB' }}>
                  <GraduationCap size={24} className="text-white" />
                </div>
              )}
              <span className="text-xl font-bold tracking-tight dark:text-white" style={{ color: '#003366' }}>{publicSettings.schoolName || 'Sync Portal'}</span>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white md:text-[2rem]">Welcome back</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to continue to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-4 rounded-lg text-sm border border-red-100 dark:border-red-800">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="hidden">
                <input
                  type="text"
                  value={tenantSlug}
                  readOnly
                  aria-hidden="true"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-slate-50 dark:bg-slate-700/60 focus:bg-white dark:focus:bg-slate-700"
                  style={{ '--tw-ring-color': '#0047AB' } as React.CSSProperties}
                  placeholder="name@school.edu"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all pr-10 bg-slate-50 dark:bg-slate-700/60 focus:bg-white dark:focus:bg-slate-700"
                    style={{ '--tw-ring-color': '#0047AB' } as React.CSSProperties}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
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
                className="h-4 w-4 border-gray-300 dark:border-slate-600 rounded"
                style={{ accentColor: '#0047AB' }}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600 dark:text-gray-400">
                Keep me signed in
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-[0_12px_24px_rgba(0,71,171,0.22)] text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-[0_16px_28px_rgba(0,71,171,0.28)] active:scale-[0.98]"
              style={{ background: '#0047AB', '--tw-ring-color': '#0047AB' } as React.CSSProperties}
              onMouseOver={(e) => (e.currentTarget.style.background = '#003366')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#0047AB')}
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Need help?{' '}
              <a href="#" className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#FF9933' }}>
                Contact IT Support
              </a>
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">
              Powered by <span className="font-semibold" style={{ color: '#0047AB' }}>Livingi Labz</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
