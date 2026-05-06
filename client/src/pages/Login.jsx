import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LockKeyhole, Mail } from 'lucide-react';
import '../styles/Auth.css';
import { API_URL } from '../config';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      // Store in localStorage
      localStorage.setItem('userInfo', JSON.stringify(data));
      navigate('/dashboard');
    } catch (err) {
      if (err.message === 'Failed to fetch') {
        setError('Server Connection Error: Please ensure the backend is running and your MongoDB IP is whitelisted.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand">
            <div className="auth-brand-mark">NC</div>
            <div className="auth-brand-text">
              <strong>NeoChat</strong>
              <span>Modern real-time conversations</span>
            </div>
          </div>

          <div className="auth-hero-copy">
            <span className="auth-kicker">Smooth communication</span>
            <h1>Conversations that feel calm, fast, and beautifully organized.</h1>
            <p>
              Sign in to pick up your chats, groups, and contacts inside a cleaner messaging workspace built
              for everyday flow.
            </p>

            <div className="auth-preview-grid">
              <div className="auth-preview-card">
                <strong>Focused messaging</strong>
                <span>Open a conversation and move through direct chats and groups without losing context.</span>
              </div>
              <div className="auth-preview-card">
                <strong>Live presence</strong>
                <span>Track unread activity, message states, and contact status in one place.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-hero-bottom">
          <div className="auth-stats">
            <div className="auth-stat">
              <strong>Instant</strong>
              <span>Live updates across rooms</span>
            </div>
            <div className="auth-stat">
              <strong>Clean</strong>
              <span>Minimal, modern interface</span>
            </div>
            <div className="auth-stat">
              <strong>Private</strong>
              <span>Your personal message hub</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-brand auth-mobile-brand">
            <div className="auth-brand-mark">NC</div>
            <div className="auth-brand-text">
              <strong>NeoChat</strong>
              <span>Modern real-time conversations</span>
            </div>
          </div>

          <div className="auth-card-head">
            <h2>Welcome back</h2>
            <p>Sign in to continue your conversations and jump back into your chat space.</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><Mail size={18} /></span>
                <input
                  type="email"
                  id="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockKeyhole size={18} /></span>
                <input
                  type="password"
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Enter NeoChat'}
            </button>
          </form>

          <div className="auth-meta">
            <span>Secure access to your chat workspace</span>
            <Link to="/register">Create account</Link>
          </div>

          <div className="auth-switch">
            New here? <Link to="/register">Sign up and start chatting</Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;
