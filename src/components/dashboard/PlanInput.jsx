import React from "react";
import { durationOptions } from "../../lib/safewell-helpers.js";

export default function PlanInput({
  form,
  setForm,
  analysis,
  isSaving,
  isLoadingProfile,
  needsBiweeklyWeightUpdate,
  handleSaveProfile,
}) {
  // Map safety status to correct alert box styles
  const alertClass =
    analysis.status === "blocked"
      ? "alert-box" // red/danger
      : analysis.status === "adjusted"
        ? "alert-box alert-amber" // yellow/warning
        : analysis.status === "maintenance"
          ? "alert-box alert-success" // green/success
          : "alert-box alert-success";

  const badgeClass =
    analysis.status === "blocked"
      ? "badge badge-danger"
      : analysis.status === "adjusted"
        ? "badge badge-warning"
        : analysis.status === "maintenance"
          ? "badge badge-info"
          : "badge badge-success";

  const safetyLabel =
    analysis.status === "blocked"
      ? "Safety Blocked"
      : analysis.status === "adjusted"
        ? "Adjusted Target"
        : analysis.status === "maintenance"
          ? "Maintenance Mode"
          : "Within Safety Limits";

  return (
    <div className="card">
      <div className="flex-row" style={{ marginBottom: "1rem" }}>
        <h2>Configure Weight Plan</h2>
        <span className={badgeClass}>{safetyLabel}</span>
      </div>
      
      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
        SafeWell dynamically caps weight loss rates and keeps goals aligned with healthy BMI minimums.
      </p>

      <form onSubmit={(e) => e.preventDefault()}>
        <div className="form-group">
          <label className="form-label">Height (cm)</label>
          <input
            type="number"
            className="form-input"
            value={form.heightCm}
            onChange={(e) => setForm((prev) => ({ ...prev, heightCm: e.target.value }))}
            placeholder="e.g. 170"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Current Weight (kg)</label>
          <input
            type="number"
            className="form-input"
            value={form.currentWeightKg}
            onChange={(e) => setForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))}
            placeholder="e.g. 75"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Goal Weight (kg)</label>
          <input
            type="number"
            className="form-input"
            value={form.goalWeightKg}
            onChange={(e) => setForm((prev) => ({ ...prev, goalWeightKg: e.target.value }))}
            placeholder="e.g. 70"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Timeframe / Duration</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {durationOptions.map((option) => {
              const isSelected = option.value === form.durationDays;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, durationDays: option.value }))}
                  className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                  style={{ textAlign: "left", display: "block", height: "auto", padding: "0.5rem 0.75rem" }}
                >
                  <div style={{ fontWeight: "700", fontSize: "0.8rem" }}>{option.label}</div>
                  <div style={{ fontSize: "0.65rem", opacity: 0.8, marginTop: "2px" }}>{option.detail}</div>
                </button>
              );
            })}
          </div>
        </div>
      </form>

      {/* Safety Assessment Box */}
      <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
        <div className="flex-row" style={{ marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "1rem" }}>Safety Assessment</h3>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={isSaving || isLoadingProfile}
            className="btn btn-primary"
            style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}
          >
            {isSaving ? "Saving..." : "Save Setup"}
          </button>
        </div>

        <h4 style={{ color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: "600" }}>
          {analysis.headline}
        </h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          {analysis.summary}
        </p>

        {analysis.alert && (
          <div className={alertClass} style={{ marginTop: "0.75rem" }}>
            {analysis.alert}
          </div>
        )}

        {needsBiweeklyWeightUpdate && (
          <div className="alert-box alert-amber" style={{ marginTop: "0.75rem" }}>
            Remember to update your scale weight at least once every two weeks so the target adjustments stay accurate.
          </div>
        )}
      </div>
    </div>
  );
}
