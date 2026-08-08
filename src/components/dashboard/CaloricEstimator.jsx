import React from "react";

export default function CaloricEstimator({ currentUser, caloricAnalysis }) {
  return (
    <div className="card">
      <div className="flex-row" style={{ marginBottom: "1rem" }}>
        <div>
          <span className="badge badge-info" style={{ marginBottom: "0.25rem" }}>Caloric targets</span>
          <h2>Nutritional Estimator</h2>
        </div>
        <span className="badge badge-success">Mifflin-St Jeor</span>
      </div>

      {caloricAnalysis.bmr > 0 ? (
        <div>
          {/* Main Calorie Card */}
          <div style={{
            backgroundColor: "var(--bg-input)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "1.25rem",
            textAlign: "center",
            marginBottom: "1.5rem"
          }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Target Daily Intake
            </div>
            <div style={{ fontSize: "2.25rem", fontWeight: "700", margin: "0.5rem 0" }}>
              {caloricAnalysis.target.toLocaleString()} <span style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>kcal</span>
            </div>

            {caloricAnalysis.isCapped && (
              <div className="alert-box alert-amber" style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", display: "inline-block", margin: "0 auto" }}>
                 Target adjusted to safety floor minimum
              </div>
            )}

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              marginTop: "1rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              paddingTop: "0.75rem"
            }}>
              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)" }}>BMR (Basal Rate)</span>
                <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>{caloricAnalysis.bmr} kcal</span>
              </div>
              <div>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)" }}>TDEE (Maintenance)</span>
                <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>{caloricAnalysis.tdee} kcal</span>
              </div>
            </div>
          </div>

          {/* Macro Split Progress Bars */}
          <div className="macro-group">
            <h3 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Estimated Macronutrients
            </h3>

            {/* Protein */}
            <div className="macro-row">
              <div className="macro-header">
                <span>Protein (2.0g/kg)</span>
                <span style={{ fontWeight: "600" }}>{caloricAnalysis.protein}g · {caloricAnalysis.proteinPct}%</span>
              </div>
              <div className="macro-track">
                <div className="macro-fill macro-protein" style={{ width: `${caloricAnalysis.proteinPct}%` }} />
              </div>
            </div>

            {/* Fats */}
            <div className="macro-row">
              <div className="macro-header">
                <span>Fats (25%)</span>
                <span style={{ fontWeight: "600" }}>{caloricAnalysis.fat}g · {caloricAnalysis.fatPct}%</span>
              </div>
              <div className="macro-track">
                <div className="macro-fill macro-fat" style={{ width: `${caloricAnalysis.fatPct}%` }} />
              </div>
            </div>

            {/* Carbs */}
            <div className="macro-row">
              <div className="macro-header">
                <span>Carbohydrates</span>
                <span style={{ fontWeight: "600" }}>{caloricAnalysis.carbs}g · {caloricAnalysis.carbPct}%</span>
              </div>
              <div className="macro-track">
                <div className="macro-fill macro-carb" style={{ width: `${caloricAnalysis.carbPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          border: "2px dashed var(--border-color)",
          borderRadius: "8px",
          padding: "2rem 1rem",
          textAlign: "center",
          color: "var(--text-secondary)",
          fontSize: "0.85rem"
        }}>
          Please complete your plan setup under "Configure Weight Plan" to generate personalized macronutrient requirements.
        </div>
      )}

      <div className="footnote" style={{ marginTop: "1rem" }}>
        Sedentary baseline calculated for {currentUser?.gender || "Male"} biological profile, age {currentUser?.ageYears || 30}.
      </div>
    </div>
  );
}
