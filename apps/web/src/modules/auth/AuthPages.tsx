import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { GoldButton } from '../../design-system';
import './AuthPages.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="ds-panel ds-panel--chrome auth-card">
        <div className="ds-panel__header">
          <h1 className="ds-panel__title">Sign In</h1>
        </div>
        <div className="ds-panel__body">
          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="auth-error">{error}</div>}
            <label className="auth-label">
              Email
              <input
                className="ds-input"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="auth-label">
              Password
              <input
                className="ds-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <GoldButton type="submit" fullWidth loading={loading}>
              Sign In
            </GoldButton>
          </form>
          <p className="auth-switch">
            Don't have an account? <Link to="/register">Create Account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="ds-panel ds-panel--chrome auth-card">
        <div className="ds-panel__header">
          <h1 className="ds-panel__title">Create Account</h1>
        </div>
        <div className="ds-panel__body">
          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="auth-error">{error}</div>}
            <label className="auth-label">
              Email
              <input className="ds-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label className="auth-label">
              Username
              <input className="ds-input" type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required pattern="[a-z0-9_]{3,30}" />
            </label>
            <label className="auth-label">
              Display Name
              <input className="ds-input" type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </label>
            <label className="auth-label">
              Password
              <input className="ds-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </label>
            <GoldButton type="submit" fullWidth loading={loading}>
              Register
            </GoldButton>
          </form>
          <p className="auth-switch">
            Have an account? <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
