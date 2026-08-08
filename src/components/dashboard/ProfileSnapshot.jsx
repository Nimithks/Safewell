import React from "react";
import { durationOptions } from "../../lib/safewell-helpers.js";

export default function ProfileSnapshot({
  profileDraftName,
  currentUser,
  form,
  completedCount,
  checkpointsLength,
}) {
  const chosenWindow = durationOptions.find((opt) => opt.value === form.durationDays)?.label || "1 month";

  return (
    <div className="card">
      <span className="badge badge-info" style={{ marginBottom: "0.5rem" }}>Review</span>
      <h2>Active Profile Status</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
        Selected Profile: <strong>{profileDraftName || "New Profile"}</strong>
      </p>

      <div className="summary-list">
        <SummaryRow label="Biological Gender" value={currentUser?.gender || "Not specified"} />
        <SummaryRow label="Age" value={currentUser?.ageYears ? `${currentUser.ageYears} years` : "Not specified"} />
        <SummaryRow label="Reported Health Conditions" value={currentUser?.healthConditions || "None"} />
        <SummaryRow label="Height Metric" value={`${form.heightCm} cm`} />
        <SummaryRow label="Baseline Weight" value={`${form.currentWeightKg} kg`} />
        <SummaryRow label="Target Weight" value={`${form.goalWeightKg} kg`} />
        <SummaryRow label="Plan Timeframe" value={chosenWindow} />
        <SummaryRow label="Milestones Met" value={`${completedCount} / ${checkpointsLength}`} />
      </div>

      <div className="footnote" style={{ marginTop: "1.5rem" }}>
        All progress logs, scale updates, and daily checklists are stored persistently in the database.
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
    </div>
  );
}
