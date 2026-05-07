import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, MessageCircle, Zap, Shield, Globe } from 'lucide-react';
import '../styles/Auth.css';
import { API_URL } from '../config';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('userInfo', JSON.stringify(data));
      navigate('/dashboard');
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        setError('Cannot reach the server. Please check your connection or try again later.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* ── Left hero panel ── */}
      <section className="auth-hero" aria-hidden="true">
        {/* Animated bubble background */}
        <div className="auth-bubbles">
          <span className="bubble bubble-1" />
          <span className="bubble bubble-2" />
          <span className="bubble bubble-3" />
          <span className="bubble bubble-4" />
          <span className="bubble bubble-5" />
        </div>

        <div className="auth-hero-inner">
          {/* Brand */}
          <div className="auth-brand">
            <div className="auth-brand-mark">
              <MessageCircle size={20} />
            </div>
            <div className="auth-brand-text">
              <strong>NeoChat</strong>
              <span>Real-time conversations</span>
            </div>
          </div>

          {/* Headline copy */}
          <div className="auth-hero-copy">
            <span className="auth-kicker">
              <Zap size={12} /> Live &amp; always on
            </span>
            <h1>
              Chat that feels&nbsp;<em>instant,</em> every&nbsp;time.
            </h1>
            <p>
              NeoChat brings your conversations, groups, and contacts into one calm, beautifully
              organized workspace — built for the way you actually communicate.
            </p>

            {/* Feature cards */}
            <div className="auth-feature-grid">
              <div className="auth-feature-card">
                <span className="auth-feature-icon">
                  <Zap size={16} />
                </span>
                <div>
                  <strong>Instant delivery</strong>
                  <span>Socket-powered live updates across every room.</span>
                </div>
              </div>
              <div className="auth-feature-card">
                <span className="auth-feature-icon">
                  <Shield size={16} />
                </span>
                <div>
                  <strong>Private by default</strong>
                  <span>Your messages stay between you and who you choose.</span>
                </div>
              </div>
              <div className="auth-feature-card">
                <span className="auth-feature-icon">
                  <Globe size={16} />
                </span>
                <div>
                  <strong>Works everywhere</strong>
                  <span>Phone, tablet, laptop — same seamless experience.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating chat preview mockup */}
        <div className="auth-chat-preview">
          <div className="chat-preview-bubble incoming">
            <span className="chat-preview-avatar">A</span>
            <div className="chat-preview-msg">
              <p>Hey! Just pushed the new build 🚀</p>
              <time>9:41 AM</time>
            </div>
          </div>
          <div className="chat-preview-bubble outgoing">
            <div className="chat-preview-msg">
              <p>Looking great! Love the new UI 🔥</p>
              <time>9:42 AM</time>
            </div>
          </div>
          <div className="chat-preview-bubble incoming">
            <span className="chat-preview-avatar">A</span>
            <div className="chat-preview-msg">
              <p>Thanks! Real-time feels so smooth now ⚡</p>
              <time>9:42 AM</time>
            </div>
          </div>
          <div className="chat-preview-typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      {/* ── Right form panel ── */}
      <section className="auth-panel">
        <div className="auth-card">
          {/* Mobile-only brand */}
          <div className="auth-brand auth-mobile-brand">
            <div className="auth-brand-mark">
              <MessageCircle size={18} />
            </div>
            <div className="auth-brand-text">
              <strong>NeoChat</strong>
              <span>Real-time conversations</span>
            </div>
          </div>

          <div className="auth-card-head">
            <h2>Welcome back 👋</h2>
            <p>Sign in to jump back into your conversations.</p>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Email field */}
            <div className="auth-field">
              <label htmlFor="login-email">Email address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <Mail size={17} />
                </span>
                <input
                  type="email"
                  id="login-email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="auth-field">
              <div className="auth-field-row">
                <label htmlFor="login-password">Password</label>
                <Link to="/register" className="auth-forgot-link">
                  New here? Register
                </Link>
              </div>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <LockKeyhole size={17} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <span className="auth-spinner-wrap">
                  <span className="auth-spinner" />
                  Signing in…
                </span>
              ) : (
                'Sign in to NeoChat'
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-switch">
            Don&apos;t have an account?{' '}
            <Link to="/register">Create one free →</Link>
          </div>

          <p className="auth-legal">
            By signing in you agree to our{' '}
            <a href="#terms">Terms of Service</a> and{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Login;
