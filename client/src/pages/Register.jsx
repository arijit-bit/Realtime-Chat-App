import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, LockKeyhole, Mail, MessageCircle,
  AtSign, Check, X, Loader, Zap, Shield, Globe
} from 'lucide-react';
import '../styles/Auth.css';
import { API_URL } from '../config';

// Debounce helper
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const Register = () => {
  const [username, setUsername]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState(null);
  const [loading, setLoading]           = useState(false);
  const navigate = useNavigate();

  // ── Username availability state ──
  const [usernameStatus, setUsernameStatus] = useState('idle');
  // idle | checking | available | taken | short
  const [usernameMsg, setUsernameMsg]       = useState('');
  const debouncedUsername = useDebounce(username, 550);
  const abortRef = useRef(null);

  // Real-time username check
  useEffect(() => {
    const trimmed = debouncedUsername.trim();

    if (!trimmed) {
      setUsernameStatus('idle');
      setUsernameMsg('');
      return;
    }
    if (trimmed.length < 3) {
      setUsernameStatus('short');
      setUsernameMsg('Username must be at least 3 characters');
      return;
    }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setUsernameStatus('checking');
    setUsernameMsg('');

    fetch(`${API_URL}/api/auth/check-username?username=${encodeURIComponent(trimmed)}`, {
      signal: abortRef.current.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.available) {
          setUsernameStatus('available');
          setUsernameMsg('Username is available!');
        } else {
          setUsernameStatus('taken');
          setUsernameMsg('Username already taken');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setUsernameStatus('idle');
          setUsernameMsg('');
        }
      });
  }, [debouncedUsername]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !email || !password) {
      setError('Please fill in all required fields');
      return;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken — please choose another.');
      return;
    }
    if (usernameStatus === 'short') {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Use at least 8 characters with uppercase, lowercase, a number, and a special character.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      localStorage.setItem('userInfo', JSON.stringify(data));
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Username status icon & colour helpers ──
  const usernameStatusIcon = () => {
    if (usernameStatus === 'checking')  return <Loader size={16} className="auth-spin-icon" />;
    if (usernameStatus === 'available') return <Check size={16} />;
    if (usernameStatus === 'taken')     return <X size={16} />;
    if (usernameStatus === 'short')     return <X size={16} />;
    return null;
  };

  const usernameStatusClass = () => {
    if (usernameStatus === 'available') return 'username-hint username-ok';
    if (usernameStatus === 'taken' || usernameStatus === 'short') return 'username-hint username-err';
    if (usernameStatus === 'checking')  return 'username-hint username-checking';
    return '';
  };

  const inputWrapStatus = () => {
    if (usernameStatus === 'available') return 'auth-input-wrap input-ok';
    if (usernameStatus === 'taken' || usernameStatus === 'short') return 'auth-input-wrap input-err';
    return 'auth-input-wrap';
  };

  return (
    <div className="auth-shell">
      {/* ── Left hero panel ── */}
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-bubbles">
          <span className="bubble bubble-1" />
          <span className="bubble bubble-2" />
          <span className="bubble bubble-3" />
          <span className="bubble bubble-4" />
          <span className="bubble bubble-5" />
        </div>

        <div className="auth-hero-inner">
          <div className="auth-brand">
            <div className="auth-brand-mark">
              <MessageCircle size={20} />
            </div>
            <div className="auth-brand-text">
              <strong>NeoChat</strong>
              <span>Real-time conversations</span>
            </div>
          </div>

          <div className="auth-hero-copy">
            <span className="auth-kicker">
              <Zap size={12} /> Join the community
            </span>
            <h1>
              Your space to&nbsp;<em>connect,</em> instantly.
            </h1>
            <p>
              Set up your free account in seconds and step into a workspace built for real, fast,
              human communication — whether you're messaging a friend or coordinating a team.
            </p>

            <div className="auth-feature-grid">
              <div className="auth-feature-card">
                <span className="auth-feature-icon"><Zap size={16} /></span>
                <div>
                  <strong>Set up in seconds</strong>
                  <span>One form, and you're inside your workspace.</span>
                </div>
              </div>
              <div className="auth-feature-card">
                <span className="auth-feature-icon"><Shield size={16} /></span>
                <div>
                  <strong>Private by default</strong>
                  <span>Only you and your contacts see your messages.</span>
                </div>
              </div>
              <div className="auth-feature-card">
                <span className="auth-feature-icon"><Globe size={16} /></span>
                <div>
                  <strong>Works everywhere</strong>
                  <span>Phone, tablet, laptop — same seamless experience.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat preview mockup */}
        <div className="auth-chat-preview">
          <div className="chat-preview-bubble incoming">
            <span className="chat-preview-avatar">S</span>
            <div className="chat-preview-msg">
              <p>Welcome to NeoChat! 🎉</p>
              <time>Just now</time>
            </div>
          </div>
          <div className="chat-preview-bubble outgoing">
            <div className="chat-preview-msg">
              <p>Thanks! This looks amazing 😍</p>
              <time>Just now</time>
            </div>
          </div>
          <div className="chat-preview-typing">
            <span /><span /><span />
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
            <h2>Create your account ✨</h2>
            <p>Pick a unique username — it's how people find you.</p>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>

            {/* Username with real-time check */}
            <div className="auth-field">
              <label htmlFor="reg-username">Username (your unique ID)</label>
              <div className={inputWrapStatus()}>
                <span className="auth-input-icon"><AtSign size={17} /></span>
                <input
                  type="text"
                  id="reg-username"
                  placeholder="Choose a unique username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                />
                {/* Live status indicator */}
                {usernameStatus !== 'idle' && (
                  <span className={`auth-username-badge ${usernameStatus === 'available' ? 'badge-ok' : usernameStatus === 'checking' ? 'badge-checking' : 'badge-err'}`}>
                    {usernameStatusIcon()}
                  </span>
                )}
              </div>
              {/* Status message below input */}
              {usernameMsg && (
                <span className={usernameStatusClass()}>
                  {usernameMsg}
                </span>
              )}
            </div>

            {/* Email */}
            <div className="auth-field">
              <label htmlFor="reg-email">Email address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><Mail size={17} /></span>
                <input
                  type="email"
                  id="reg-email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockKeyhole size={17} /></span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reg-password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
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
              <span className="username-hint">
                Use 8+ chars, upper/lowercase, a number, and a symbol.
              </span>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking' || usernameStatus === 'short'}
            >
              {loading ? (
                <span className="auth-spinner-wrap">
                  <span className="auth-spinner" />
                  Creating account…
                </span>
              ) : (
                'Create your free account'
              )}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <div className="auth-switch">
            Already have an account?{' '}
            <Link to="/login">Sign in →</Link>
          </div>

          <p className="auth-legal">
            By creating an account you agree to our{' '}
            <a href="#terms">Terms of Service</a> and{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Register;
