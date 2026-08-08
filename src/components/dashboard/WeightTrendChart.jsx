import React from "react";
import { formatKg } from "../../lib/safewell-helpers.js";

export default function WeightTrendChart({ points, targetWeight }) {
  if (points.length === 0) {
    return (
      <div style={{
        border: "2px dashed var(--border-color)",
        borderRadius: "8px",
        padding: "2rem 1rem",
        textAlign: "center",
        color: "var(--text-secondary)",
        fontSize: "0.85rem",
        marginTop: "1rem"
      }}>
        Add your scale weights to check-ins above and click "Save Setup" to visualize your progress history.
      </div>
    );
  }

  const padding = 8;
  const width = 100;
  const height = 56;
  const values = points.map((point) => point.value).concat(targetWeight);
  const minValue = Math.min(...values) - 1;
  const maxValue = Math.max(...values) + 1;
  const range = Math.max(maxValue - minValue, 1);
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const toY = (value) => height - padding - ((value - minValue) / range) * (height - padding * 2);
  
  const path = points
    .map((point, index) => {
      const x = padding + index * step;
      const y = toY(point.value);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
    
  const targetY = toY(targetWeight);

  return (
    <div style={{
      backgroundColor: "var(--bg-input)",
      border: "1px solid var(--border-color)",
      borderRadius: "8px",
      padding: "1.25rem",
      marginTop: "1.5rem"
    }}>
      <div className="flex-row" style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)" }}>
        <span>Weight progression</span>
        <span style={{ color: "var(--accent-secondary)" }}>Goal Line: {formatKg(targetWeight)} kg</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "200px", overflow: "visible", marginTop: "1rem" }}>
        {/* Goal line */}
        <line
          x1={padding}
          x2={width - padding}
          y1={targetY}
          y2={targetY}
          stroke="rgba(245, 158, 11, 0.5)"
          strokeDasharray="2 2"
          strokeWidth="0.75"
        />
        {/* Progress line path */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent-color)"
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Data points */}
        {points.map((point, index) => {
          const x = padding + index * step;
          const y = toY(point.value);
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="1.2"
              fill="#fff"
              stroke="var(--accent-color)"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "0.5rem",
        marginTop: "1rem",
        fontSize: "0.75rem",
        color: "var(--text-secondary)",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        paddingTop: "0.75rem"
      }}>
        <span>Latest Entry: <strong>{formatKg(points[points.length - 1].value)} kg</strong></span>
        <span>Target: <strong>{formatKg(targetWeight)} kg</strong></span>
        <span>Min Saved: {formatKg(Math.min(...points.map((p) => p.value)))} kg</span>
        <span>Max Saved: {formatKg(Math.max(...points.map((p) => p.value)))} kg</span>
      </div>
    </div>
  );
}
