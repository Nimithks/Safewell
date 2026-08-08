import React from "react";
import { formatDateTime, formatKg } from "../../lib/safewell-helpers.js";

export default function RecentActivity({ history }) {
  return (
    <div style={{
      backgroundColor: "var(--bg-input)",
      border: "1px solid var(--border-color)",
      borderRadius: "8px",
      padding: "1.25rem",
      marginTop: "1.5rem"
    }}>
      <h3 style={{ fontSize: "0.9rem", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
        Recent Log History
      </h3>
      
      <div className="history-feed">
        {history.slice(0, 6).map((entry) => (
          <div key={entry.id} className="history-card">
            <div className="history-header">
              <div>
                <strong>{entry.checkpointLabel}</strong> ({entry.checkpointWindow})
              </div>
              <div>{formatDateTime(entry.loggedAt)}</div>
            </div>
            <div className="history-body">
              {entry.weightKg === null ? (
                <span style={{ color: "var(--text-secondary)" }}>No weight logged</span>
              ) : (
                <span>Logged Weight: <strong>{formatKg(entry.weightKg)} kg</strong></span>
              )}
              {entry.note && (
                <span style={{ color: "var(--text-secondary)" }}> · Notes: "{entry.note}"</span>
              )}
            </div>
          </div>
        ))}

        {history.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "1.5rem 0",
            fontSize: "0.8rem",
            color: "var(--text-secondary)",
            fontStyle: "italic"
          }}>
            No database log history found. Save changes above to write your first checkpoint entry.
          </div>
        )}
      </div>
    </div>
  );
}
