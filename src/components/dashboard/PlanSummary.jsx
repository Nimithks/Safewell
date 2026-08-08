import React from "react";
import { formatBmi, formatKg } from "../../lib/safewell-helpers.js";

export default function PlanSummary({ analysis }) {
  const recommendedGoalText =
    analysis.recommendedGoalWeightKg === null ? "--" : `${formatKg(analysis.recommendedGoalWeightKg)} kg`;
  const healthyMinimumText =
    analysis.healthyMinimumWeight === null ? "--" : `${formatKg(analysis.healthyMinimumWeight)} kg`;

  return (
    <div className="card">
      <span className="badge badge-info" style={{ marginBottom: "0.5rem" }}>Metrics</span>
      <h2>Plan Calculations</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
        Safe thresholds calculated based on standard physiological guidelines.
      </p>

      <div className="summary-list">
        <SummaryRow label="Calculated BMI" value={formatBmi(analysis.bmi)} />
        <SummaryRow label="BMI Range Classification" value={analysis.bmiLabel} />
        <SummaryRow label="Safer Minimum Weight" value={`${healthyMinimumText}`} />
        <SummaryRow
          label="Requested Loss Target"
          value={analysis.requestedLossKg === null ? "--" : `${formatKg(analysis.requestedLossKg)} kg`}
        />
        <SummaryRow
          label="Max Safe Weekly Rate"
          value={analysis.safeLossCapKg === null ? "--" : `${formatKg(analysis.safeLossCapKg)} kg total`}
        />
        <SummaryRow label="Recommended Target weight" value={recommendedGoalText} />
      </div>

      <div className="footnote" style={{ marginTop: "1.5rem" }}>
        <strong>Important:</strong> SafeWell is a final year demo dashboard. Please seek professional dietitian guidance before starting any intensive calorie restriction program.
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
