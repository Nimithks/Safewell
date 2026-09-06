import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

export default function App() {
  const [token, setToken] = useState(sessionStorage.getItem('safewell-token') || '');
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ name: '', password: '' });
  const [isRegister, setIsRegister] = useState(false);
  
  const [statsForm, setStatsForm] = useState({
    ageYears: '',
    gender: 'Male',
    heightCm: '',
    currentWeightKg: '',
    goalWeightKg: '',
    durationDays: 30,
    healthConditions: ''
  });

  const [checkins, setCheckins] = useState([]);
  const [progressSummary, setProgressSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    if (token && !user) {
      fetchUser();
    }
  }, [token, user]);

  async function safeFetch(url, options = {}) {
    const activeToken = token || sessionStorage.getItem('safewell-token') || '';
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}),
        ...options.headers
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        handleLogout();
      }
      throw new Error(data.detail || `Request failed: ${res.status}`);
    }
    return data;
  }

  async function fetchUser() {
    try {
      const data = await safeFetch('/api/auth/me');
      setUser(data.user);
      setStatsForm({
        ageYears: data.user.ageYears || '',
        gender: data.user.gender || 'Male',
        heightCm: data.user.heightCm || '',
        currentWeightKg: data.user.currentWeightKg || '',
        goalWeightKg: data.user.goalWeightKg || '',
        durationDays: data.user.durationDays || 30,
        healthConditions: data.user.healthConditions || ''
      });
      if (data.user.heightCm && data.user.currentWeightKg) {
        fetchCheckins();
      }
    } catch (e) {
      if (token) setErrorMsg(e.message);
    }
  }

  async function fetchCheckins() {
    setLoading(true);
    try {
      const data = await safeFetch('/api/checkins');
      setCheckins(data.checkins || []);
      setProgressSummary(data.summary || null);
    } catch (e) {
      if (token) setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (!authForm.name || !authForm.password) {
      setErrorMsg('Username and password are required.');
      return;
    }

    const endpoint = isRegister ? '/api/auth/signup' : '/api/auth/login';
    try {
      const data = await safeFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ name: authForm.name, password: authForm.password })
      });

      if (isRegister) {
        setInfoMsg('Account created. Please log in.');
        setIsRegister(false);
      } else {
        sessionStorage.setItem('safewell-token', data.token);
        setToken(data.token);
        setUser(data.user);
        setStatsForm({
          ageYears: data.user.ageYears || '',
          gender: data.user.gender || 'Male',
          heightCm: data.user.heightCm || '',
          currentWeightKg: data.user.currentWeightKg || '',
          goalWeightKg: data.user.goalWeightKg || '',
          durationDays: data.user.durationDays || 30,
          healthConditions: data.user.healthConditions || ''
        });
        if (data.user.heightCm && data.user.currentWeightKg) {
          fetchCheckins();
        }
      }
    } catch (e) {
      setErrorMsg(e.message);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('safewell-token');
    setToken('');
    setUser(null);
    setCheckins([]);
    setProgressSummary(null);
  }

  function calculateSafetyGoal(h, w, g, dur) {
    if (h <= 0 || w <= 0 || g <= 0 || dur <= 0) {
      return { finalGoal: g, isAdjusted: false };
    }
    const heightM = h / 100;
    const bmi = w / (heightM * heightM);
    let finalGoal = g;
    let isAdjusted = false;

    if (bmi < 18.5) {
      const healthyWeight185 = Number((18.5 * heightM * heightM).toFixed(2));
      if (finalGoal < healthyWeight185) {
        finalGoal = healthyWeight185;
        isAdjusted = true;
      }
    }

    const requestedChange = Math.abs(w - finalGoal);
    const durationWeeks = dur / 7;
    const weeklyRate = requestedChange / durationWeeks;
    const maxSafeRate = finalGoal < w ? Math.min(1.0, w * 0.01) : 0.5;

    if (weeklyRate > maxSafeRate + 0.01) {
      const maxChange = maxSafeRate * durationWeeks;
      finalGoal = finalGoal < w ? Number((w - maxChange).toFixed(2)) : Number((w + maxChange).toFixed(2));
      isAdjusted = true;
    }
    return { finalGoal, isAdjusted };
  }

  function enforceSafetyAdjustments(updatedStats) {
    const { finalGoal, isAdjusted } = calculateSafetyGoal(
      Number(updatedStats.heightCm),
      Number(updatedStats.currentWeightKg),
      Number(updatedStats.goalWeightKg),
      Number(updatedStats.durationDays)
    );

    setStatsForm(prev => ({ ...prev, goalWeightKg: finalGoal }));
    setInfoMsg(isAdjusted ? `Safety check: Target weight adjusted to the safest speed (${finalGoal} kg).` : '');
  }

  async function handleSaveStats(e) {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const h = Number(statsForm.heightCm);
    const w = Number(statsForm.currentWeightKg);
    const g = Number(statsForm.goalWeightKg);
    const dur = Number(statsForm.durationDays);

    if (h <= 0 || w <= 0 || g <= 0 || dur <= 0) {
      setErrorMsg('Please input positive measurements.');
      return;
    }

    const { finalGoal, isAdjusted } = calculateSafetyGoal(h, w, g, dur);

    // Optimistically update user immediately so the onboarding modal closes instantly without remaining on screen
    setUser(prev => ({
      ...(prev || {}),
      ageYears: Number(statsForm.ageYears),
      gender: statsForm.gender,
      heightCm: h,
      currentWeightKg: w,
      goalWeightKg: finalGoal,
      durationDays: dur,
      healthConditions: statsForm.healthConditions,
      onboarded: true
    }));
    setStatsForm(prev => ({ ...prev, goalWeightKg: finalGoal }));

    try {
      setLoading(true);
      setInfoMsg(isAdjusted ? 'Safety check: Goal weight adjusted. Saving stats...' : 'Saving stats...');
      const data = await safeFetch('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({
          ageYears: Number(statsForm.ageYears),
          gender: statsForm.gender,
          heightCm: h,
          currentWeightKg: w,
          goalWeightKg: finalGoal,
          durationDays: dur,
          healthConditions: statsForm.healthConditions
        })
      });

      if (data && data.user) {
        setUser(data.user);
      }
      setInfoMsg(isAdjusted 
        ? `Target weight adjusted to safe speed (${finalGoal} kg). Profile updated!` 
        : 'Physiological profile updated!'
      );
      fetchCheckins();
    } catch (e) {
      setErrorMsg(e.message);
      setInfoMsg('');
      fetchUser();
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCheckin(logged_date, weight, note) {
    setErrorMsg('');
    setInfoMsg('');
    try {
      await safeFetch('/api/checkins', {
        method: 'POST',
        body: JSON.stringify({ logged_date, weight: Number(weight), note })
      });
      fetchCheckins();
      setInfoMsg('Weigh-in check-in logged successfully!');
    } catch (e) {
      setErrorMsg(e.message);
    }
  }

  async function handleUpdateCheckin(checkin_id, logged_date, weight, note) {
    setErrorMsg('');
    setInfoMsg('');
    try {
      await safeFetch(`/api/checkins/${checkin_id}`, {
        method: 'PUT',
        body: JSON.stringify({ logged_date, weight: Number(weight), note })
      });
      fetchCheckins();
      setInfoMsg('Check-in entry updated successfully!');
    } catch (e) {
      setErrorMsg(e.message);
    }
  }

  async function handleDeleteCheckin(checkin_id) {
    if (!window.confirm('Are you sure you want to delete this weigh-in log?')) return;
    setErrorMsg('');
    setInfoMsg('');
    try {
      await safeFetch(`/api/checkins/${checkin_id}`, { method: 'DELETE' });
      fetchCheckins();
      setInfoMsg('Check-in log removed.');
    } catch (e) {
      setErrorMsg(e.message);
    }
  }

  async function handleExportCSV() {
    try {
      const activeToken = token || sessionStorage.getItem('safewell-token') || '';
      const response = await fetch('/api/export/csv', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (!response.ok) throw new Error('Failed to generate CSV export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `safewell_progress_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setErrorMsg(e.message);
    }
  }



  if (!token || !user) {
    return (
      <Auth
        isRegister={isRegister}
        setIsRegister={setIsRegister}
        authForm={authForm}
        setAuthForm={setAuthForm}
        errorMsg={errorMsg}
        setErrorMsg={setErrorMsg}
        infoMsg={infoMsg}
        setInfoMsg={setInfoMsg}
        handleAuth={handleAuth}
      />
    );
  }

  const needsOnboarding = !user.heightCm || !user.currentWeightKg;
  const userHeightM = Number(statsForm.heightCm) / 100;
  const userBmi = Number(statsForm.currentWeightKg) / (userHeightM * userHeightM) || 0;
  const isUnderweight = userBmi < 18.5;
  const requestedChange = Math.abs(Number(statsForm.currentWeightKg) - Number(statsForm.goalWeightKg));
  const requestedWeeks = Number(statsForm.durationDays) / 7;
  const calcWeeklyRate = requestedChange / (requestedWeeks || 1) || 0;
  const maxSafeRateVal = Number(statsForm.goalWeightKg) < Number(statsForm.currentWeightKg)
    ? Math.min(1.0, Number(statsForm.currentWeightKg) * 0.01)
    : 0.5;
  const isRateUnsafe = calcWeeklyRate > maxSafeRateVal + 0.01;

  return (
    <div className="container">
      {needsOnboarding && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ marginBottom: '1rem' }}>Complete Onboarding</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Please enter your baseline physiological measurements to initialize the safety checker and timeline dashboard.
            </p>
            <form onSubmit={handleSaveStats}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Age (Years)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.ageYears}
                    onChange={(e) => setStatsForm({ ...statsForm, ageYears: e.target.value })}
                    placeholder="e.g. 28"
                    min="1"
                    max="120"
                    step="1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select
                    className="form-select"
                    value={statsForm.gender}
                    onChange={(e) => setStatsForm({ ...statsForm, gender: e.target.value })}
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Height (cm)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.heightCm}
                    onChange={(e) => setStatsForm({ ...statsForm, heightCm: e.target.value })}
                    placeholder="e.g. 175"
                    min="50"
                    max="250"
                    step="1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Weight (kg)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.currentWeightKg}
                    onChange={(e) => setStatsForm({ ...statsForm, currentWeightKg: e.target.value })}
                    placeholder="e.g. 80.0"
                    min="10"
                    max="500"
                    step="0.1"
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Target Weight (kg)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.goalWeightKg}
                    onChange={(e) => setStatsForm({ ...statsForm, goalWeightKg: e.target.value })}
                    placeholder="e.g. 75.0"
                    min="10"
                    max="500"
                    step="0.1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (Days)</label>
                  <select
                    className="form-select"
                    value={statsForm.durationDays}
                    onChange={(e) => setStatsForm({ ...statsForm, durationDays: Number(e.target.value) })}
                  >
                    <option value={7}>7 days (1 Week)</option>
                    <option value={30}>30 days (1 Month)</option>
                    <option value={60}>60 days (2 Months)</option>
                    <option value={90}>90 days (3 Months)</option>
                    <option value={180}>180 days (6 Months)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Pre-existing Health Conditions (e.g. diabetes, heart issues)</label>
                <input
                  type="text"
                  className="form-input"
                  value={statsForm.healthConditions}
                  onChange={(e) => setStatsForm({ ...statsForm, healthConditions: e.target.value })}
                  placeholder="e.g. Asthma, High Blood Pressure or None"
                  maxLength="200"
                />
              </div>
              {errorMsg && <div className="alert-banner alert-danger" style={{ padding: '0.75rem' }}>{errorMsg}</div>}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary btn-block">Complete Setup</button>
                <button type="button" onClick={handleLogout} className="btn btn-secondary">Logout</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <p style={{ color: 'red', fontWeight: '700', textAlign: 'center' }}>
        This is a final year project so mistakes can be there and it is not tested yet
      </p>
      <div className="card flex-row" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span className="badge badge-info" style={{ marginBottom: '0.5rem' }}></span>
          <h1>SafeWell Weight Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Signed in as: <strong>{user?.name}</strong>
          </p>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
      </div>

      {errorMsg && <div className="alert-banner alert-danger">{errorMsg}</div>}
      {infoMsg && <div className="alert-banner alert-info">{infoMsg}</div>}

      <Dashboard
        user={user}
        userBmi={userBmi}
        isUnderweight={isUnderweight}
        statsForm={statsForm}
        setStatsForm={setStatsForm}
        calcWeeklyRate={calcWeeklyRate}
        isRateUnsafe={isRateUnsafe}
        checkins={checkins}
        progressSummary={progressSummary}
        loading={loading}
        handleSaveStats={handleSaveStats}
        enforceSafetyAdjustments={enforceSafetyAdjustments}
        handleCreateCheckin={handleCreateCheckin}
        handleUpdateCheckin={handleUpdateCheckin}
        handleDeleteCheckin={handleDeleteCheckin}
        handleExportCSV={handleExportCSV}
        fetchCheckins={fetchCheckins}
      />
    </div>
  );
}
