import React from "react";

export default function OnboardingModal({
  showOnboarding,
  currentUser,
  onboardingForm,
  setOnboardingForm,
  isOnboardingSaving,
  handleSaveOnboarding,
  handleSignOut,
}) {
  if (!showOnboarding || !currentUser) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <span className="badge badge-warning" style={{ marginBottom: "0.5rem" }}>First-time Setup</span>
        <h2 style={{ color: "#fff" }}>Tell us about yourself</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Provide your baseline physiological details. We use this information to configure safe rate calculators and database profiles.
        </p>

        <div className="form-group">
          <label className="form-label">Age (years)</label>
          <input
            type="number"
            className="form-input"
            value={onboardingForm.ageYears}
            onChange={(e) => setOnboardingForm((prev) => ({ ...prev, ageYears: e.target.value }))}
            placeholder="e.g. 25"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Gender</label>
          <select
            className="form-select"
            value={onboardingForm.gender}
            onChange={(e) => setOnboardingForm((prev) => ({ ...prev, gender: e.target.value }))}
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Medical Conditions / History</label>
          <textarea
            className="form-textarea"
            value={onboardingForm.healthConditions}
            onChange={(e) => setOnboardingForm((prev) => ({ ...prev, healthConditions: e.target.value }))}
            placeholder="E.g. Asthma, Hypertension, or write 'None'"
          />
          <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
            Helps verify safety thresholds for diet plans.
          </span>
        </div>

        <div className="form-group">
          <label className="form-label">Height (cm)</label>
          <input
            type="number"
            className="form-input"
            value={onboardingForm.heightCm}
            onChange={(e) => setOnboardingForm((prev) => ({ ...prev, heightCm: e.target.value }))}
            placeholder="e.g. 170"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Current Weight (kg)</label>
          <input
            type="number"
            className="form-input"
            value={onboardingForm.currentWeightKg}
            onChange={(e) => setOnboardingForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))}
            placeholder="e.g. 75"
          />
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveOnboarding}
            disabled={isOnboardingSaving}
            style={{ flex: 1 }}
          >
            {isOnboardingSaving ? "Saving..." : "Save Settings"}
          </button>
          
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSignOut}
            style={{ flex: 1 }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
