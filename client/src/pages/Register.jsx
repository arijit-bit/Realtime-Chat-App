import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail, MessageCircle, UserRound, Zap, Shield, Globe } from 'lucide-react';
import '../styles/Auth.css';
import { API_URL } from '../config';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !email || !password) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
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
              <Zap size={12} /> Join the community
            </span>
            <h1>
              Your space to&nbsp;<em>connect,</em> instantly.
            </h1>
            <p>
              Set up your free account in seconds and step into a workspace built for real, fast,
              human communication — whether you're messaging a friend or coordinating a team.
            </p>

            {/* Feature cards */}
            <div className="auth-feature-grid">
              <div className="auth-feature-card">
                <span className="auth-feature-icon">
                  <Zap size={16} />
                </span>
                <div>
                  <strong>Set up in seconds</strong>
                  <span>One form, and you're inside your workspace.</span>
                </div>
              </div>
              <div className="auth-feature-card">
                <span className="auth-feature-icon">
                  <Shield size={16} />
                </span>
                <div>
                  <strong>Private by default</strong>
                  <span>Only you and your contacts see your messages.</span>
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
            <h2>Create your account ✨</h2>
            <p>Join NeoChat and start chatting in real time.</p>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div className="auth-field">
              <label htmlFor="reg-username">Username</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <UserRound size={17} />
                </span>
                <input
                  type="text"
                  id="reg-username"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Email */}
            <div className="auth-field">
              <label htmlFor="reg-email">Email address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <Mail size={17} />
                </span>
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
                <span className="auth-input-icon">
                  <LockKeyhole size={17} />
                </span>
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
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
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

          <div className="auth-divider">
            <span>or</span>
          </div>

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
