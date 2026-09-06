import React from 'react';

export default function Auth({
  isRegister,
  setIsRegister,
  authForm,
  setAuthForm,
  errorMsg,
  setErrorMsg,
  infoMsg,
  setInfoMsg,
  handleAuth
}) {
  return (
    <div className="auth-container">
      <div className="auth-wrapper">
        <div className="auth-info">
          <div>
            <span className="badge badge-info" style={{ marginBottom: '1rem' }}>SafeWell Project</span>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Safety-First Health Planner</h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Calculate safe target weight, enforce medical guardrails, evaluate BMI boundaries, and visualize timeline checkpoints instantly.
            </p>
          </div>
        </div>
        <div className="auth-form-card">
          <h3 style={{ marginBottom: '1.5rem' }}>{isRegister ? 'Create Account' : 'Welcome Back'}</h3>
          {errorMsg && <div className="alert-banner alert-danger">{errorMsg}</div>}
          {infoMsg && <div className="alert-banner alert-info">{infoMsg}</div>}
          <form onSubmit={handleAuth}>
            <div className="form-group">
              <label className="form-label">Username:</label>
              <input
                type="text"
                className="form-input"
                value={authForm.name}
                onChange={(e) => setAuthForm(prev=>({ ...prev, name: e.target.value }))}
                placeholder="e.g. nimith"
                maxLength="50"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="winterfell"
                maxLength="50"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '0.5rem' }}>
              {isRegister ? 'Sign Up' : 'Log In'}
            </button>
          </form>
          <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {isRegister ? 'Already registered? ' : 'First time? '}
            <span
              role="button"
              tabIndex="0"
              style={{ color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => {
                setIsRegister(prev => !prev);
                setErrorMsg('');
                setInfoMsg('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsRegister(prev => !prev);
                  setErrorMsg('');
                  setInfoMsg('');
                }
              }}
            >
              {isRegister ? 'Log In here' : 'Sign Up here'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
