import React, { useState } from 'react';

export default function Dashboard({
  user,
  userBmi,
  isUnderweight,
  statsForm,
  setStatsForm,
  calcWeeklyRate,
  isRateUnsafe,
  checkins,
  progressSummary,
  loading,
  handleSaveStats,
  enforceSafetyAdjustments,
  handleCreateCheckin,
  handleUpdateCheckin,
  handleDeleteCheckin,
  handleExportCSV,
  fetchCheckins
}) {
  const metabolic = user?.metabolicProfile;

  const [showLogModal, setShowLogModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editingCheckin, setEditingCheckin] = useState(null);

  const [logForm, setLogForm] = useState({
    logged_date: new Date().toISOString().slice(0, 10),
    weight: '',
    note: ''
  });

  function openCreateModal() {
    setEditingCheckin(null);
    setLogForm({
      logged_date: new Date().toISOString().slice(0, 10),
      weight: statsForm.currentWeightKg || '',
      note: ''
    });
    setShowLogModal(true);
  }

  function openEditModal(c) {
    setEditingCheckin(c);
    setLogForm({
      logged_date: c.logged_date,
      weight: c.weight,
      note: c.note || ''
    });
    setShowLogModal(true);
  }

  function handleSubmitLog(e) {
    e.preventDefault();
    if (!logForm.logged_date || !logForm.weight || Number(logForm.weight) <= 0) {
      alert("Please enter a valid date and weight.");
      return;
    }
    if (editingCheckin) {
      handleUpdateCheckin(editingCheckin.id, logForm.logged_date, logForm.weight, logForm.note);
    } else {
      handleCreateCheckin(logForm.logged_date, logForm.weight, logForm.note);
    }
    setShowLogModal(false);
  }

  // Calculate SVG Chart Coordinates
  const chartWidth = 700;
  const chartHeight = 280;
  const padding = 40;

  const validCheckins = (checkins || []).filter(c => typeof c.weight === 'number');
  let chartPoints = [];
  let yMin = 40, yMax = 120;

  if (validCheckins.length > 0) {
    const allWeights = validCheckins.flatMap(c => [
      c.weight,
      c.expected_weight,
      c.safety_boundary_weight
    ]).filter(w => typeof w === 'number' && !isNaN(w));

    yMin = Math.floor(Math.min(...allWeights) - 2);
    yMax = Math.ceil(Math.max(...allWeights) + 2);
    if (yMin === yMax) { yMin -= 5; yMax += 5; }

    const xStep = (chartWidth - padding * 2) / Math.max(1, validCheckins.length - 1);
    const yScale = (val) => chartHeight - padding - ((val - yMin) / (yMax - yMin)) * (chartHeight - padding * 2);

    chartPoints = validCheckins.map((c, idx) => ({
      x: padding + idx * xStep,
      yActual: yScale(c.weight),
      yExpected: yScale(c.expected_weight),
      ySafety: yScale(c.safety_boundary_weight),
      data: c
    }));
  }

  const actualSvgPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yActual}`).join(' ');
  const expectedSvgPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yExpected}`).join(' ');
  const safetySvgPath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.ySafety}`).join(' ');

  return (
    <>
      {/* Metabolic Baseline & Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Body Mass Index (BMI)</div>
          <div className="stat-val">{userBmi.toFixed(1)}</div>
          <span className={`badge ${isUnderweight ? 'badge-danger' : 'badge-success'}`} style={{ marginTop: '0.25rem' }}>
            {isUnderweight ? 'Underweight (Risk)' : userBmi < 25 ? 'Normal weight' : userBmi < 30 ? 'Overweight' : 'Higher Risk'}
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-label">Basal Rate & TDEE</div>
          <div className="stat-val">
            {metabolic?.tdee ? `${Math.round(metabolic.tdee)} kcal` : 'Calculating...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            BMR: {metabolic?.bmr ? `${Math.round(metabolic.bmr)} kcal` : '--'} (Mifflin-St Jeor)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Prescribed Daily Target</div>
          <div className="stat-val" style={{ color: 'var(--accent-color)' }}>
            {metabolic?.targetCalories ? `${metabolic.targetCalories} kcal` : `${statsForm.goalWeightKg} kg target`}
          </div>
          {metabolic && (
            <div className="macro-pills-row">
              <span className="macro-pill">P: <strong>{metabolic.proteinG}g</strong></span>
              <span className="macro-pill">C: <strong>{metabolic.carbsG}g</strong></span>
              <span className="macro-pill">F: <strong>{metabolic.fatG}g</strong></span>
            </div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-label">Pace & Safety Corridor</div>
          <div className="stat-val">{calcWeeklyRate.toFixed(2)} kg/wk</div>
          <button 
            type="button"
            onClick={() => setShowEditProfileModal(true)} 
            className="btn btn-secondary"
          >
            ⚙️ Edit Profile Stats
          </button>
        </div>
      </div>

      {/* Underweight Safety Protocol Banner */}
      {isUnderweight && (
        <div className="alert-banner alert-warning" style={{ marginBottom: '1.5rem' }}>
          💡 <strong>Underweight Clinical Safety Plan Active (BMI {userBmi.toFixed(1)} &lt; 18.5):</strong> Your target weight is automatically set to achieve a healthy BMI of 18.5 (<strong>{statsForm.goalWeightKg} kg</strong>). A weight gain plan with daily caloric surplus and macronutrient targets is activated to help you build weight safely.
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ marginBottom: '1rem' }}>Update Baseline Physiological Stats</h3>
            <form onSubmit={(e) => { handleSaveStats(e); setShowEditProfileModal(false); }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Age (Years)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.ageYears}
                    onChange={(e) => setStatsForm({ ...statsForm, ageYears: e.target.value })}
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
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Baseline Weight (kg)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={statsForm.currentWeightKg}
                    onChange={(e) => setStatsForm({ ...statsForm, currentWeightKg: e.target.value })}
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
                <label className="form-label">Health Conditions</label>
                <input
                  type="text"
                  className="form-input"
                  value={statsForm.healthConditions}
                  onChange={(e) => setStatsForm({ ...statsForm, healthConditions: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary btn-block">Save Profile Changes</button>
                <button type="button" onClick={() => setShowEditProfileModal(false)} className="btn btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log / Edit Check-in Modal */}
      {showLogModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>{editingCheckin ? 'Edit Weigh-In Entry' : 'Log Weekly Weigh-In'}</h3>
            <form onSubmit={handleSubmitLog} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Weigh-In Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={logForm.logged_date}
                  onChange={(e) => setLogForm({ ...logForm, logged_date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Actual Logged Weight (kg)</label>
                <input
                  type="number"
                  className="form-input"
                  step="0.1"
                  min="10"
                  max="500"
                  placeholder="e.g. 78.5"
                  value={logForm.weight}
                  onChange={(e) => setLogForm({ ...logForm, weight: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Progress Comments</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Feeling energetic, completed 10k steps"
                  value={logForm.note}
                  onChange={(e) => setLogForm({ ...logForm, note: e.target.value })}
                  maxLength="200"
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary btn-block">
                  {editingCheckin ? 'Update Check-In' : 'Save Weigh-In'}
                </button>
                <button type="button" onClick={() => setShowLogModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DATA VISUALIZATION PROGRESS CHART (SVG) */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>📈 Weight Progress & Safety Corridor Chart</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Comparing Actual Logged Weight vs Ideal Target Path vs Safety Corridor Boundary
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#14b8a6', borderRadius: '2px' }}></span>
              Actual Logged
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></span>
              Target Path
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: '#f59e0b', borderRadius: '2px' }}></span>
              Safety Boundary
            </span>
          </div>
        </div>

        {validCheckins.length < 2 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
            📊 Add at least 2 weigh-in check-ins to visualize your progress curve and safety corridor tracking.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {/* Background Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padding + ratio * (chartHeight - padding * 2);
                const val = (yMax - ratio * (yMax - yMin)).toFixed(1);
                return (
                  <g key={idx}>
                    <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="var(--border-color)" strokeDasharray="3 3" opacity="0.4" />
                    <text x={padding - 6} y={y + 4} fill="var(--text-secondary)" fontSize="10" textAnchor="end">{val}kg</text>
                  </g>
                );
              })}

              {/* Safety Boundary Line */}
              <path d={safetySvgPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" opacity="0.8" />

              {/* Target Expected Line */}
              <path d={expectedSvgPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 6" />

              {/* Actual Logged Line */}
              <path d={actualSvgPath} fill="none" stroke="#14b8a6" strokeWidth="3" />

              {/* Data Points */}
              {chartPoints.map((pt, i) => (
                <g key={i}>
                  {/* Target Point */}
                  <circle cx={pt.x} cy={pt.yExpected} r="3" fill="#3b82f6" />
                  
                  {/* Safety Boundary Point */}
                  <circle cx={pt.x} cy={pt.ySafety} r="3" fill="#f59e0b" />

                  {/* Actual Point */}
                  <circle cx={pt.x} cy={pt.yActual} r="5" fill="#14b8a6" stroke="#0f172a" strokeWidth="2" />

                  {/* X-axis Date Labels */}
                  <text x={pt.x} y={chartHeight - 10} fill="var(--text-secondary)" fontSize="10" textAnchor="middle">
                    {pt.data.logged_date.slice(5)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* HISTORICAL CHECK-IN LOGGING TABLE & ACTIONS */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>🗓️ Historical Check-In Log & Progress Safety</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Track weigh-ins and verify if weight velocity stays within clinical safety limits.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={openCreateModal} className="btn btn-primary">
              + Log Weigh-In
            </button>
            <button onClick={handleExportCSV} className="btn btn-secondary">
              📥 Export Progress (CSV)
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading check-in history...</div>
        ) : (checkins || []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)', backgroundColor: 'rgba(255, 255, 255, 0.01)', borderRadius: '8px' }}>
            No weigh-in check-ins logged yet. Click <strong>"+ Log Weigh-In"</strong> to record your first progress entry!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem' }}>Date</th>
                  <th style={{ padding: '0.75rem' }}>Logged Weight</th>
                  <th style={{ padding: '0.75rem' }}>Interval Transition</th>
                  <th style={{ padding: '0.75rem' }}>Target Expected</th>
                  <th style={{ padding: '0.75rem' }}>Safety Limit</th>
                  <th style={{ padding: '0.75rem' }}>Progress Safety Status</th>
                  <th style={{ padding: '0.75rem' }}>Notes</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c, index) => {
                  let badgeClass = 'badge-success';
                  if (c.status === 'losing_too_fast' || c.status === 'gaining_too_fast') badgeClass = 'badge-danger';
                  else if (c.status === 'behind_target') badgeClass = 'badge-warning';

                  const days = c.days_since_last ?? 0;
                  const diff = c.weight_change_from_last ?? 0;
                  const durationText = index === 0 ? 'Baseline' : days === 0 ? 'Same day' : days === 1 ? '1 day' : `${days} days`;
                  const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
                  const intervalText = index === 0 ? 'Baseline' : `${diffSign} kg (${durationText})`;

                  return (
                    <tr key={c.id || c.logged_date} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: '600' }}>{c.logged_date}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--accent-color)', fontWeight: '700' }}>{c.weight} kg</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <span style={{ 
                          fontWeight: index === 0 ? '400' : '600',
                          color: index === 0 ? 'var(--text-secondary)' : diff > 0 ? '#f87171' : diff < 0 ? '#34d399' : 'var(--text-secondary)'
                        }}>
                          {intervalText}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.expected_weight} kg</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.safety_boundary_weight} kg</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge ${badgeClass}`} title={c.status_message}>
                          {c.status_label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.note || '--'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {c.id !== 0 && (
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button onClick={() => openEditModal(c)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                              Edit
                            </button>
                            <button onClick={() => handleDeleteCheckin(c.id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: '#fca5a5' }}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
