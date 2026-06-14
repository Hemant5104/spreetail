import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthAPI } from '../api';

const Auth = () => {
  const { user, login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register({ username, password, email, display_name: displayName });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (demoUser) => {
    setError('');
    setLoading(true);
    try {
      await login(demoUser, 'password123');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container fade-in">
      <div className="auth-card slide-up">
        <div className="auth-logo">
          <svg width="56" height="56" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="14" fill="url(#auth-logo-grad)"/>
            <path d="M8 14.5C8 11.5 10 9 14 9C18 9 20 11.5 20 14.5C20 17.5 18 20 14 20C10 20 8 17.5 8 14.5Z" stroke="white" strokeWidth="1.5" fill="none"/>
            <path d="M12 13V16M16 13V16M11 14.5H17" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="auth-logo-grad" x1="0" y1="0" x2="28" y2="28">
                <stop stopColor="#6366f1"/>
                <stop offset="1" stopColor="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <h1>Spreetail</h1>
          <p>Split expenses, not friendships</p>
        </div>

        <div className="tabs mb-6">
          <button
            className={`tab ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            Sign In
          </button>
          <button
            className={`tab ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="card card-glass mb-4" style={{ borderColor: 'var(--danger)', padding: 'var(--space-3)' }}>
            <span className="text-danger font-bold text-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={!isLogin}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder={isLogin ? 'Enter password' : 'Min 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isLogin ? undefined : 6}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full mt-4" disabled={loading}>
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-3 text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
          or try a demo account
          <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button className="btn btn-secondary btn-sm" onClick={() => quickLogin('aisha')}>Aisha</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quickLogin('rohan')}>Rohan</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quickLogin('priya')}>Priya</button>
          <button className="btn btn-secondary btn-sm" onClick={() => quickLogin('sam')}>Sam</button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
