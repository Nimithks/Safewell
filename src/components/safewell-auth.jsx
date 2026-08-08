import React, { useEffect, useState } from "react";

const API_BASE = ""; // Handled automatically by Vite dev proxy

export default function SafeWellAuthPage({ onLoginSuccess }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Sign up first, then log in.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = window.sessionStorage.getItem("safewell-session-token");
    if (token && onLoginSuccess) {
      onLoginSuccess();
    }
  }, [onLoginSuccess]);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const endpoint = mode === "signup" ? "signup" : "login";
      const response = await fetch(`${API_BASE}/api/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "Request failed");
      }

      if (mode === "signup") {
        setMessage("Account created. Please log in with your name and password.");
        setMode("login");
        setPassword("");
        return;
      }

      window.sessionStorage.setItem("safewell-session-token", payload.token);
      window.sessionStorage.setItem("safewell-active-profile", "");
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-container">
      <div className="auth-wrapper">
        
        {/* Info panel */}
        <section className="auth-info">
          <div>
            <span className="badge badge-info">SafeWell Portal</span>
            <h1 style={{ marginTop: "1rem" }}>Safety-First Weight Planner</h1>
            <p style={{ color: "var(--text-secondary)", marginTop: "1rem", fontSize: "0.95rem" }}>
              Welcome to SafeWell. This system is designed to check weight goals against medically safe thresholds, preventing extreme weight cuts.
            </p>
            <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem", fontSize: "0.95rem" }}>
              On your first login, you will fill in details like age and health history so that our algorithms can adapt your recommendations.
            </p>
          </div>

          <div style={{ marginTop: "2rem" }}>
            <h3 style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>How it works</h3>
            <ol style={{ paddingLeft: "1.25rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              <li style={{ marginBottom: "0.25rem" }}>Sign up with a unique username.</li>
              <li style={{ marginBottom: "0.25rem" }}>Log in to initialize your secure session.</li>
              <li>Provide onboarding metrics to configure safety checks.</li>
            </ol>
          </div>
        </section>

        {/* Form panel */}
        <section className="auth-form-card">
          <div className="flex-row" style={{ marginBottom: "1.5rem" }}>
            <h2>{mode === "signup" ? "Create Account" : "Welcome Back"}</h2>
            <span className="badge badge-success">Secure Login</span>
          </div>

          <div className="tab-group">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`tab-btn ${mode === "login" ? "active" : ""}`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`tab-btn ${mode === "signup" ? "active" : ""}`}
            >
              Sign Up
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="btn btn-primary btn-block"
            style={{ marginTop: "1rem" }}
          >
            {isSubmitting ? "Processing..." : mode === "signup" ? "Register" : "Log In"}
          </button>

          {message && (
            <div className="alert-box alert-success" style={{ marginTop: "1.25rem" }}>
              {message}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
