import React, { useEffect, useState } from "react";
import {
  defaultForm,
  authHeaders,
  toNumber,
  formatKg,
  formatBmi,
  formatDate,
  analyzePlan,
  emptyCheckIn,
  mapCheckIns,
  toCheckInPayload,
  toProfileForm,
} from "../lib/safewell-helpers.js";

// Sub-components
import StatCard from "./dashboard/StatCard.jsx";
import PlanInput from "./dashboard/PlanInput.jsx";
import PlanSummary from "./dashboard/PlanSummary.jsx";
import CaloricEstimator from "./dashboard/CaloricEstimator.jsx";
import HydrationTracker from "./dashboard/HydrationTracker.jsx";
import CheckpointTimeline from "./dashboard/CheckpointTimeline.jsx";
import WeightTrendChart from "./dashboard/WeightTrendChart.jsx";
import RecentActivity from "./dashboard/RecentActivity.jsx";
import ProfileSnapshot from "./dashboard/ProfileSnapshot.jsx";
import OnboardingModal from "./dashboard/OnboardingModal.jsx";

const API_BASE = ""; // Handled automatically by Vite dev proxy

export default function SafeWellDashboard({ onSignOut }) {
  // Authentication & Profile States
  const [form, setForm] = useState(defaultForm);
  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isOnboardingSaving, setIsOnboardingSaving] = useState(false);
  
  const [onboardingForm, setOnboardingForm] = useState({
    ageYears: "",
    gender: "Male",
    healthConditions: "",
    heightCm: "",
    currentWeightKg: "",
  });
  
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(() => {
    return window.sessionStorage.getItem("safewell-active-profile") ?? "";
  });
  
  const [profileDraftName, setProfileDraftName] = useState("New profile");
  const [checkIns, setCheckIns] = useState({});
  const [history, setHistory] = useState([]);
  const [syncMessage, setSyncMessage] = useState("Create a profile to store progress in the database.");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Water Tracker State
  const [waterIntake, setWaterIntake] = useState(0);
  
  // Timeline State
  const [checkpoints, setCheckpoints] = useState([]);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(false);

  // Load water intake from storage
  useEffect(() => {
    const saved = window.sessionStorage.getItem("safewell-water-intake");
    if (saved) {
      setWaterIntake(Number(saved));
    }
  }, []);

  const setWaterIntakePersistent = (value) => {
    setWaterIntake((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      window.sessionStorage.setItem("safewell-water-intake", `${next}`);
      return next;
    });
  };

  const analysis = analyzePlan(form);

  // Calorie & Macro calculations
  const caloricAnalysis = (() => {
    const heightNum = toNumber(form.heightCm);
    const weightNum = toNumber(form.currentWeightKg);
    const ageNum = currentUser?.ageYears || 30;
    const gender = currentUser?.gender || "Male";
    const planMode = analysis.planMode;
    
    if (heightNum <= 0 || weightNum <= 0) {
      return { bmr: 0, tdee: 0, target: 0, isCapped: false, protein: 0, fat: 0, carbs: 0, proteinPct: 0, fatPct: 25, carbPct: 0 };
    }
    
    // Mifflin-St Jeor Equation
    let bmr = 0;
    if (gender === "Female") {
      bmr = 10 * weightNum + 6.25 * heightNum - 5 * ageNum - 161;
    } else if (gender === "Male") {
      bmr = 10 * weightNum + 6.25 * heightNum - 5 * ageNum + 5;
    } else {
      bmr = 10 * weightNum + 6.25 * heightNum - 5 * ageNum - 78;
    }
    
    const tdee = bmr * 1.2;
    let target = planMode === "loss" ? tdee - 500 : tdee;
    
    const safetyFloor = gender === "Female" ? 1200 : 1500;
    let isCapped = false;
    if (target < safetyFloor) {
      target = safetyFloor;
      isCapped = true;
    }
    
    const roundedTarget = Math.round(target);
    const proteinGrams = Math.round(weightNum * 2.0);
    const proteinKcal = proteinGrams * 4;
    const fatKcal = Math.round(target * 0.25);
    const fatGrams = Math.round(fatKcal / 9);
    const carbKcal = Math.max(0, roundedTarget - proteinKcal - fatKcal);
    const carbGrams = Math.round(carbKcal / 4);
    
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      target: roundedTarget,
      isCapped,
      protein: proteinGrams,
      fat: fatGrams,
      carbs: carbGrams,
      proteinPct: Math.round((proteinKcal / roundedTarget) * 100),
      fatPct: 25,
      carbPct: Math.round((carbKcal / roundedTarget) * 100)
    };
  })();

  const completedCount = checkpoints.filter((checkpoint) => checkIns[checkpoint.id]?.completed).length;
  const progressPercent = checkpoints.length === 0 ? 0 : Math.round((completedCount / checkpoints.length) * 100);
  const recommendedGoalText =
    analysis.recommendedGoalWeightKg === null ? "--" : `${formatKg(analysis.recommendedGoalWeightKg)} kg`;

  const safetyLabel =
    analysis.status === "blocked"
      ? "Blocked for Safety"
      : analysis.status === "adjusted"
        ? "Target Safety Adjusted"
        : analysis.status === "maintenance"
          ? "Maintenance Plan"
          : "Within Guidelines";

  // Check auth tokens on mount
  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("safewell-session-token") ?? "";
    if (!storedToken) {
      if (onSignOut) onSignOut();
      return;
    }
    setAuthToken(storedToken);
  }, [onSignOut]);

  // Load Current User Details
  useEffect(() => {
    if (!authToken) return;
    let active = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: authHeaders(authToken),
        });
        if (!response.ok) {
          throw new Error("Unable to load user profile");
        }
        const data = await response.json();
        if (!active) return;
        
        setCurrentUser(data.user);

        if (data.user.heightCm && data.user.currentWeightKg) {
          setForm((current) => ({
            ...current,
            heightCm: `${data.user.heightCm ?? current.heightCm}`,
            currentWeightKg: `${data.user.currentWeightKg ?? current.currentWeightKg}`,
          }));
        }

        if (!data.user.onboarded) {
          setOnboardingForm({
            ageYears: data.user.ageYears ? `${data.user.ageYears}` : "",
            gender: data.user.gender ? `${data.user.gender}` : "Male",
            healthConditions: data.user.healthConditions ? `${data.user.healthConditions}` : "",
            heightCm: data.user.heightCm ? `${data.user.heightCm}` : "",
            currentWeightKg: data.user.currentWeightKg ? `${data.user.currentWeightKg}` : "",
          });
          setShowOnboarding(true);
        }
        setIsAuthReady(true);
      } catch (err) {
        if (active && onSignOut) {
          onSignOut();
        }
      }
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, [authToken, onSignOut]);

  // Save active profile ID to session storage
  useEffect(() => {
    if (activeProfileId) {
      window.sessionStorage.setItem("safewell-active-profile", activeProfileId);
    } else {
      window.sessionStorage.removeItem("safewell-active-profile");
    }
  }, [activeProfileId]);

  // Load Profiles list
  useEffect(() => {
    if (!isAuthReady || !authToken) return;
    let active = true;

    async function loadProfiles() {
      try {
        const response = await fetch(`${API_BASE}/api/profiles/?token=${encodeURIComponent(authToken)}`, {
          headers: authHeaders(authToken),
        });
        if (!response.ok) {
          throw new Error("Unable to load profiles");
        }
        const data = await response.json();
        if (!active) return;
        setProfiles(data.profiles ?? []);
        if (!activeProfileId && (data.profiles?.length ?? 0) > 0) {
          setActiveProfileId(data.profiles[0].id);
        }
      } catch (err) {
        if (active) {
          setSyncMessage("Could not connect to database.");
        }
      }
    }

    loadProfiles();
    return () => {
      active = false;
    };
  }, [authToken, isAuthReady, activeProfileId]);

  // Load Active Profile Details
  useEffect(() => {
    if (!isAuthReady || !authToken) return;
    let active = true;

    async function loadProfile() {
      if (!activeProfileId) {
        setProfileDraftName("New profile");
        setCheckIns({});
        setHistory([]);
        return;
      }

      setIsLoadingProfile(true);
      try {
        const response = await fetch(`${API_BASE}/api/profiles/${activeProfileId}?token=${encodeURIComponent(authToken)}`, {
          headers: authHeaders(authToken),
        });
        if (!response.ok) {
          throw new Error("Profile not found");
        }
        const snapshot = await response.json();
        if (!active) return;
        setProfileDraftName(snapshot.profile.name);
        setForm(toProfileForm(snapshot.profile));
        setCheckIns(mapCheckIns(snapshot.checkIns));
        setHistory(snapshot.history ?? []);
        setSyncMessage(`Profile Loaded: "${snapshot.profile.name}"`);
      } catch (err) {
        if (active) {
          setSyncMessage("Failed to retrieve profile data.");
        }
      } finally {
        if (active) {
          setIsLoadingProfile(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [activeProfileId, authToken, isAuthReady]);

  // Load Timeline checkpoints
  useEffect(() => {
    if (!isAuthReady || !authToken) return;
    let active = true;
    const height = toNumber(form.heightCm);
    const weight = toNumber(form.currentWeightKg);
    const goal = toNumber(form.goalWeightKg);
    const duration = form.durationDays;

    if (height <= 0 || weight <= 0 || goal <= 0 || duration <= 0) {
      setCheckpoints([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoadingCheckpoints(true);
      try {
        const params = new URLSearchParams({
          token: authToken,
          heightCm: `${height}`,
          currentWeightKg: `${weight}`,
          goalWeightKg: `${goal}`,
          durationDays: `${duration}`,
        });
        const response = await fetch(`${API_BASE}/api/profiles/checkpoints?${params.toString()}`, {
          headers: authHeaders(authToken),
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (active) {
          setCheckpoints(data.checkpoints ?? []);
        }
      } catch (err) {
        console.error("Timeline retrieval error", err);
      } finally {
        if (active) {
          setIsLoadingCheckpoints(false);
        }
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.heightCm, form.currentWeightKg, form.goalWeightKg, form.durationDays, authToken, isAuthReady]);

  function updateCheckIn(checkpoint, patch) {
    setCheckIns((current) => ({
      ...current,
      [checkpoint.id]: {
        ...(current[checkpoint.id] ?? emptyCheckIn(checkpoint)),
        ...patch,
      },
    }));
  }

  async function persistSnapshot(profileId) {
    const payload = {
      name: profileDraftName.trim() || "New profile",
      heightCm: toNumber(form.heightCm),
      currentWeightKg: toNumber(form.currentWeightKg),
      goalWeightKg: toNumber(form.goalWeightKg),
      durationDays: form.durationDays,
      checkIns: checkpoints.map((checkpoint) =>
        toCheckInPayload(checkIns[checkpoint.id] ?? emptyCheckIn(checkpoint)),
      ),
    };

    const response = await fetch(`${API_BASE}/api/profiles/${profileId}?token=${encodeURIComponent(authToken)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(authToken),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Save error");
    }

    const snapshot = await response.json();
    setProfiles((current) => {
      const withoutCurrent = current.filter((entry) => entry.id !== snapshot.profile.id);
      return [snapshot.profile, ...withoutCurrent].sort((l, r) => r.updatedAt.localeCompare(l.updatedAt));
    });
    setProfileDraftName(snapshot.profile.name);
    setHistory(snapshot.history ?? []);
    setCheckIns(mapCheckIns(snapshot.checkIns));
    setSyncMessage(`Saved profile "${snapshot.profile.name}" to SQLite.`);
  }

  async function handleSaveProfile() {
    setIsSaving(true);
    try {
      if (!activeProfileId) {
        const createResponse = await fetch(`${API_BASE}/api/profiles/?token=${encodeURIComponent(authToken)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(authToken),
          },
          body: JSON.stringify({
            name: profileDraftName.trim() || "New profile",
            heightCm: toNumber(form.heightCm),
            currentWeightKg: toNumber(form.currentWeightKg),
            goalWeightKg: toNumber(form.goalWeightKg),
            durationDays: form.durationDays,
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Create profile error");
        }

        const created = await createResponse.json();
        setActiveProfileId(created.profile.id);
        setProfileDraftName(created.profile.name);
        setHistory(created.history ?? []);
        setCheckIns(mapCheckIns(created.checkIns ?? []));
        await persistSnapshot(created.profile.id);
        return;
      }
      await persistSnapshot(activeProfileId);
    } catch (err) {
      setSyncMessage("Save failed. Connection error.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveOnboarding() {
    setIsOnboardingSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(authToken),
        },
        body: JSON.stringify({
          ageYears: Number(onboardingForm.ageYears),
          gender: onboardingForm.gender,
          healthConditions: onboardingForm.healthConditions,
          heightCm: Number(onboardingForm.heightCm),
          currentWeightKg: Number(onboardingForm.currentWeightKg),
        }),
      });

      if (!response.ok) {
        throw new Error("Onboarding error");
      }

      const data = await response.json();
      setCurrentUser(data.user);
      setShowOnboarding(false);
      setSyncMessage(`Welcome ${data.user.name}. Basics saved.`);

      if (data.user.heightCm && data.user.currentWeightKg) {
        setForm((current) => ({
          ...current,
          heightCm: `${data.user.heightCm}`,
          currentWeightKg: `${data.user.currentWeightKg}`,
        }));
      }
    } catch (err) {
      setSyncMessage("Could not update onboarding setup.");
    } finally {
      setIsOnboardingSaving(false);
    }
  }

  function handleSignOutClick() {
    if (onSignOut) {
      onSignOut();
    }
  }

  if (!isAuthReady) {
    return (
      <main style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <h3>Initializing Dashboard...</h3>
        </div>
      </main>
    );
  }

  const latestWeightPoints = history
    .filter((entry) => entry.weightKg !== null)
    .slice(0, 12)
    .reverse();

  return (
    <main className="container">
      {/* Onboarding Dialog */}
      <OnboardingModal
        showOnboarding={showOnboarding}
        currentUser={currentUser}
        onboardingForm={onboardingForm}
        setOnboardingForm={setOnboardingForm}
        isOnboardingSaving={isOnboardingSaving}
        handleSaveOnboarding={handleSaveOnboarding}
        handleSignOut={handleSignOutClick}
      />

      {/* Main Header / Top section */}
      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="flex-row" style={{ alignItems: "flex-start" }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: "0.5rem" }}>Medical Guardrails</span>
              <h1>SafeWell Weight Planner</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                A conservative weight planning tool that tracks progress using safety thresholds.
              </p>
            </div>

            {/* Profile switcher box */}
            <div style={{
              backgroundColor: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              padding: "1rem",
              minWidth: "260px"
            }}>
              <div className="flex-row" style={{ marginBottom: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Logged In User</div>
                  <strong style={{ fontSize: "1rem" }}>{currentUser?.name}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                >
                  Logout
                </button>
              </div>

              <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Profile Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileDraftName}
                  onChange={(e) => setProfileDraftName(e.target.value)}
                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                  placeholder="Profile Name"
                />
              </div>

              <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                <label className="form-label" style={{ fontSize: "0.7rem" }}>Load Profile</label>
                <select
                  className="form-select"
                  value={activeProfileId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setActiveProfileId(nextId);
                    if (!nextId) {
                      setForm(defaultForm);
                      setProfileDraftName("New profile");
                      setCheckIns({});
                      setHistory([]);
                      setSyncMessage("Provide new profile parameters below.");
                    }
                  }}
                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
                >
                  <option value="">+ Create New Profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSaving || isLoadingProfile}
                className="btn btn-primary btn-block"
                style={{ fontSize: "0.8rem", padding: "0.5rem" }}
              >
                {isSaving ? "Saving to Database..." : "Save to Database"}
              </button>

              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem", textAlign: "center" }}>
                {syncMessage}
              </div>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="stats-grid">
            <StatCard
              label="Current BMI"
              value={formatBmi(analysis.bmi)}
              helper={analysis.bmiLabel}
            />
            <StatCard
              label="Recommended Rate"
              value={analysis.safeWeeklyLossKg === null ? "--" : `${formatKg(analysis.safeWeeklyLossKg)} kg/week`}
              helper="Rate Cap"
            />
            <StatCard
              label="Calculated Target"
              value={recommendedGoalText}
              helper={safetyLabel}
            />
          </div>
        </div>
      </section>

      {/* Grids for inputs and summaries */}
      <div className="grid-2-col" style={{ marginBottom: "1.5rem" }}>
        <PlanInput
          form={form}
          setForm={setForm}
          analysis={analysis}
          isSaving={isSaving}
          isLoadingProfile={isLoadingProfile}
          needsBiweeklyWeightUpdate={form.durationDays >= 14 && toNumber(form.goalWeightKg) !== toNumber(form.currentWeightKg)}
          handleSaveProfile={handleSaveProfile}
        />
        
        <PlanSummary analysis={analysis} />
      </div>

      {/* Daily Logs section */}
      <div className="grid-2-col" style={{ marginBottom: "1.5rem" }}>
        <CaloricEstimator
          currentUser={currentUser}
          caloricAnalysis={caloricAnalysis}
        />
        <HydrationTracker
          waterIntake={waterIntake}
          setWaterIntakePersistent={setWaterIntakePersistent}
        />
      </div>

      {/* Timeline view */}
      <CheckpointTimeline
        form={form}
        checkpoints={checkpoints}
        checkIns={checkIns}
        completedCount={completedCount}
        progressPercent={progressPercent}
        isLoadingCheckpoints={isLoadingCheckpoints}
        updateCheckIn={updateCheckIn}
      />

      {/* History and details segment */}
      <div className="grid-2-col" style={{ marginTop: "1.5rem" }}>
        <div className="card">
          <h2>Weight Metrics Trend</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Visualizes scale updates logged across different checkpoints.
          </p>
          
          <WeightTrendChart
            points={latestWeightPoints.map((entry) => ({
              label: formatDate(entry.loggedAt),
              value: entry.weightKg,
            }))}
            targetWeight={toNumber(form.goalWeightKg)}
          />

          <RecentActivity history={history} />
        </div>

        <ProfileSnapshot
          profileDraftName={profileDraftName}
          currentUser={currentUser}
          form={form}
          completedCount={completedCount}
          checkpointsLength={checkpoints.length}
        />
      </div>
    </main>
  );
}
