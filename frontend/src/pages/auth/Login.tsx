import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import {
  Loader2,
  Eye,
  EyeOff,
  GraduationCap,
  BookOpen,
  Users,
  Calendar,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  LockKeyhole,
  Mail,
} from 'lucide-react';
import styles from './Login.module.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicSettings, setPublicSettings] = useState<{ schoolName?: string; logoUrl?: string }>({});
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/settings/public').then(r => setPublicSettings(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
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
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          {publicSettings.logoUrl ? (
            <img src={publicSettings.logoUrl} alt={`${publicSettings.schoolName || 'School'} logo`} className={styles.logo} />
          ) : (
            <span className={`${styles.brandIcon} bg-primary`}><GraduationCap size={26} aria-hidden="true" /></span>
          )}
          <span className={styles.brandName}>{publicSettings.schoolName || 'Sync Portal'}</span>
        </div>
        <span className={styles.portalLabel}>School workspace</span>
      </header>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="intro-title">
          <span className={`${styles.accentLine} bg-primary`} aria-hidden="true" />
          <p className={styles.eyebrow}>MORE TIME FOR WHAT MATTERS</p>
          <h2 id="intro-title" className={styles.introTitle}>Your school day.<br /><span>All in sync.</span></h2>
          <p className={styles.introCopy}>Less time on admin. More time for education. Bring your people, learning, and everyday school life together.</p>
          <ul className={styles.features}>
            <li><span className={styles.featureIcon}><Users size={20} aria-hidden="true" /></span><div><h3>People, connected</h3><p>Students, teachers, and families in one place.</p></div></li>
            <li><span className={styles.featureIcon}><BookOpen size={20} aria-hidden="true" /></span><div><h3>Learning, in focus</h3><p>Keep track of grades and academic progress.</p></div></li>
            <li><span className={styles.featureIcon}><Calendar size={20} aria-hidden="true" /></span><div><h3>Every day, organized</h3><p>Stay on top of attendance and timetables.</p></div></li>
          </ul>
        </section>

        <section className={styles.card} aria-labelledby="login-title">
          <div className={styles.cardHeading}>
            <h1 id="login-title">Welcome back</h1>
            <p>Sign in to pick up where you left off.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} aria-labelledby="login-title" aria-busy={loading}>
            <div className={styles.field}>
              <label htmlFor="email">Email address</label>
              <div className={styles.inputWrap}>
                <Mail size={20} className={styles.inputIcon} aria-hidden="true" />
                <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" aria-describedby={error ? 'email-hint login-error' : 'email-hint'} />
              </div>
              <p id="email-hint" className={styles.hint}>Use the email linked to your school account.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <div className={styles.inputWrap}>
                <LockKeyhole size={20} className={styles.inputIcon} aria-hidden="true" />
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={styles.passwordInput} placeholder="Enter your password" aria-describedby={error ? 'login-error' : undefined} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className={styles.passwordToggle} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-controls="password" aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className={styles.submit}>
              {loading ? <><Loader2 size={20} className="motion-safe:animate-spin" aria-hidden="true" /> Signing in…</> : <>Sign in <ArrowRight size={20} aria-hidden="true" /></>}
            </button>
            <div id="login-error" role="alert" aria-atomic="true" className={styles.errorSlot} tabIndex={error ? 0 : undefined}>
              {error && (
                <div className={styles.error}>
                  <AlertCircle size={20} aria-hidden="true" />
                  <div><strong>Unable to sign in</strong><p>{error}</p></div>
                </div>
              )}
            </div>
            <span className="sr-only" role="status">{loading ? 'Signing in. Please wait.' : ''}</span>
          </form>

          <details className={styles.help}>
            <summary>Trouble signing in?<ChevronDown size={18} aria-hidden="true" /></summary>
            <p>Forgot your password or need an account? Contact your school administrator for help accessing your account.</p>
          </details>
          <p className={styles.sessionNote}>Using a shared device? Remember to sign out when you’re done.</p>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Sync. All rights reserved.</span>
        <span>Run your school. In sync.</span>
      </footer>
    </div>
  );
};

export default Login;
