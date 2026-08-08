import React from "react";

export default function HydrationTracker({ waterIntake, setWaterIntakePersistent }) {
  const percentage = Math.min(100, Math.round((waterIntake / 2500) * 100));

  return (
    <div className="card">
      <div className="flex-row" style={{ marginBottom: "1rem" }}>
        <div>
          <span className="badge badge-info" style={{ marginBottom: "0.25rem" }}>Hydration</span>
          <h2>Daily Water Log</h2>
        </div>
        <span className="badge badge-success">Target: 2500 ml</span>
      </div>

      <div className="water-section">
        {/* Buttons and numeric progress */}
        <div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Current Intake
          </div>
          <div style={{ fontSize: "2.25rem", fontWeight: "700", margin: "0.25rem 0" }}>
            {waterIntake} <span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>ml</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--accent-color)", fontWeight: "600" }}>
            {percentage}% of daily goal completed
          </div>

          <div className="water-buttons">
            <button
              type="button"
              onClick={() => setWaterIntakePersistent((prev) => prev + 250)}
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.5rem" }}
            >
              💧 +250 ml
            </button>
            <button
              type="button"
              onClick={() => setWaterIntakePersistent((prev) => prev + 500)}
              className="btn btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.5rem" }}
            >
              🥤 +500 ml
            </button>
          </div>
          
          <button
            type="button"
            onClick={() => setWaterIntakePersistent(0)}
            className="btn btn-secondary btn-block"
            style={{ fontSize: "0.75rem", padding: "0.4rem" }}
          >
            Reset Log
          </button>
        </div>

        {/* Visual glass illustration */}
        <div className="glass-wrapper">
          <div className="glass-container">
            <div
              className="water-fill"
              style={{ height: `${percentage}%` }}
            >
              <div className="water-sparkle" />
            </div>
          </div>
          <span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-secondary)", marginTop: "0.5rem", letterSpacing: "0.05em" }}>
            Glass Level
          </span>
        </div>
      </div>

      <div className="footnote" style={{ marginTop: "1rem" }}>
        Drinking sufficient water supports metabolic rate, digestion, and physical performance.
      </div>
    </div>
  );
}
