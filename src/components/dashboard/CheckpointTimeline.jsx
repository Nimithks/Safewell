import React from "react";
import { completionLabel, emptyCheckIn } from "../../lib/safewell-helpers.js";

export default function CheckpointTimeline({
  form,
  checkpoints,
  checkIns,
  completedCount,
  progressPercent,
  isLoadingCheckpoints,
  updateCheckIn,
}) {
  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="flex-row">
        <div>
          <span className="badge badge-info" style={{ marginBottom: "0.25rem" }}>Timeline Plan</span>
          <h2>
            {form.durationDays === 7 ? "Daily Log Checklist" : "Plan Milestones"}
          </h2>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {isLoadingCheckpoints && (
            <span style={{ fontSize: "0.85rem", color: "var(--accent-color)", animation: "pulse 1.5s infinite" }}>
              Updating milestones...
            </span>
          )}
          <span className="badge badge-info">
            {completedCount} of {checkpoints.length} Logged
          </span>
        </div>
      </div>

      {/* Progress tracker */}
      <div className="progress-container">
        <div className="progress-labels">
          <span>{completionLabel(completedCount, checkpoints.length)}</span>
          <span style={{ fontWeight: "700" }}>{progressPercent}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Timeline items */}
      <div className="timeline-grid">
        {checkpoints.map((checkpoint) => {
          const entry = checkIns[checkpoint.id] || emptyCheckIn(checkpoint);

          return (
            <article key={checkpoint.id} className="timeline-card">
              <div>
                <div className="timeline-header">
                  <div>
                    <span className="badge badge-info" style={{ fontSize: "0.65rem", padding: "0.15rem 0.35rem" }}>
                      {checkpoint.window}
                    </span>
                    <h3 style={{ fontSize: "1.1rem", marginTop: "0.4rem", color: "#fff" }}>
                      {checkpoint.label}
                    </h3>
                  </div>
                  
                  <label style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)"
                  }}>
                    <input
                      type="checkbox"
                      checked={!!entry.completed}
                      onChange={(e) => updateCheckIn(checkpoint, { completed: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                    Done
                  </label>
                </div>

                <p className="timeline-desc">{checkpoint.focus}</p>

                <div className="checkpoint-lists">
                  <div className="checkpoint-sublist">
                    <div className="sublist-title">Dietary Focus</div>
                    <ul className="checkpoint-items">
                      {checkpoint.food.map((item, index) => (
                        <li key={index}>· {item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="checkpoint-sublist">
                    <div className="sublist-title">Activity</div>
                    <ul className="checkpoint-items">
                      {checkpoint.exercise.map((item, index) => (
                        <li key={index}>· {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="recovery-text">
                  <strong>Guidance:</strong> {checkpoint.recovery}
                </div>
              </div>

              {/* Input section for check-in data */}
              <div className="checkpoint-inputs" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
                <div>
                  <label className="form-label" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>Weight (kg)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Optional"
                    style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}
                    value={entry.weight || ""}
                    onChange={(e) => updateCheckIn(checkpoint, { weight: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: "0.7rem", marginBottom: "0.25rem" }}>Notes</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="E.g. energy level"
                    style={{ padding: "0.35rem 0.5rem", fontSize: "0.8rem" }}
                    value={entry.note || ""}
                    onChange={(e) => updateCheckIn(checkpoint, { note: e.target.value })}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
