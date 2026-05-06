import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, LockKeyhole, Mail, UserRound } from 'lucide-react';
import '../styles/Auth.css';
import { API_URL } from '../config';

const Register = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      // Store in localStorage
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
            <span className="auth-kicker">Built for teams and friends</span>
            <h1>Create your space and start chatting in real time.</h1>
            <p>
              Join NeoChat to organize direct messages, launch groups, and keep your conversations fast,
              readable, and always within reach.
            </p>

            <div className="auth-preview-grid">
              <div className="auth-preview-card">
                <strong>Easy onboarding</strong>
                <span>Set up your identity once and move straight into your messaging workspace.</span>
              </div>
              <div className="auth-preview-card">
                <strong>Groups and DMs</strong>
                <span>Switch between one-to-one chats and team rooms without losing momentum.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-hero-bottom">
          <div className="auth-stats">
            <div className="auth-stat">
              <strong>One setup</strong>
              <span>Create your profile in seconds</span>
            </div>
            <div className="auth-stat">
              <strong>Live rooms</strong>
              <span>Real-time communication built in</span>
            </div>
            <div className="auth-stat">
              <strong>Modern shell</strong>
              <span>Designed for desktop and mobile</span>
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
            <h2>Create account</h2>
            <p>Set up your profile to start messaging, sharing updates, and joining chat rooms.</p>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="username">Username</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><UserRound size={18} /></span>
                <input
                  type="text"
                  id="username"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

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
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Creating account...' : 'Create your account'}
            </button>
          </form>

          <div className="auth-meta">
            <span>Your profile opens the full messaging workspace</span>
            <Link to="/login">Already registered?</Link>
          </div>

          <div className="auth-switch">
            Already have an account? <Link to="/login">Log in instead</Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Register;
