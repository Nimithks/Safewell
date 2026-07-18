"use client";

import { useEffect, useState } from "react";
import type { CheckInRecord, HistoryRecord, LibraryItem, ProfileRecord } from "@/lib/safewell-types";

type DurationDays = 7 | 30 | 60 | 90 | 180 | 365 | 730;

type FormState = {
  heightCm: string;
  currentWeightKg: string;
  goalWeightKg: string;
  durationDays: DurationDays;
};

type PlanStatus = "blocked" | "adjusted" | "safe" | "maintenance";

type Checkpoint = {
  id: string;
  label: string;
  window: string;
  focus: string;
  food: string[];
  exercise: string[];
  recovery: string;
};

type CheckInDraft = {
  checkpointId: string;
  checkpointLabel: string;
  checkpointWindow: string;
  sortIndex: number;
  completed: boolean;
  note: string;
  weight: string;
};

type Analysis = {
  status: PlanStatus;
  bmi: number | null;
  bmiLabel: string;
  healthyMinimumWeight: number | null;
  safeWeeklyLossKg: number | null;
  requestedLossKg: number | null;
  requestedWeeks: number | null;
  safeLossCapKg: number | null;
  recommendedGoalWeightKg: number | null;
  headline: string;
  summary: string;
  alert: string;
  planMode: "loss" | "maintenance";
};

type ProfileSnapshot = {
  profile: ProfileRecord;
  checkIns: CheckInRecord[];
  history: HistoryRecord[];
};

type AuthUser = {
  id: string;
  name: string;
  ageYears: number | null;
  gender: string | null;
  healthConditions: string | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  onboarded: boolean;
  createdAt: string;
  updatedAt: string;
};

type OnboardingForm = {
  ageYears: string;
  gender: string;
  healthConditions: string;
  heightCm: string;
  currentWeightKg: string;
};

const durationOptions: Array<{ value: DurationDays; label: string; detail: string }> = [
  { value: 7, label: "1 week", detail: "Daily check-ins from day 1 to day 7." },
  { value: 30, label: "1 month", detail: "Weekly checkpoints with a final review." },
  { value: 60, label: "2 months", detail: "Eight-week plan with weekly targets and progressive resistance." },
  { value: 90, label: "3 months", detail: "Three-month phased blocks focusing on adaptation and consolidation." },
  { value: 180, label: "6 months", detail: "Monthly milestones and habit consolidation." },
  { value: 365, label: "1 year", detail: "Long-term progress with quarterly reviews and maintenance planning." },
  { value: 730, label: "2 years", detail: "Sustained lifestyle changes with annual reassessment." },
];

const defaultForm: FormState = {
  heightCm: "170",
  currentWeightKg: "75",
  goalWeightKg: "70",
  durationDays: 30,
};

const healthyBmiFloor = 18.5;
const bodyWeightLossCap = 0.01;
const absoluteWeeklyCapKg = 1;

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string) || "";

function authHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatKg(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatBmi(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return value.toFixed(1);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function classifyBmi(bmi: number): string {
  if (bmi < 18.5) {
    return "Underweight";
  }

  if (bmi < 25) {
    return "Healthy range";
  }

  if (bmi < 30) {
    return "Overweight";
  }

  return "Higher-risk range";
}

// Checkpoint generation has been migrated to the backend API endpoint (/api/profiles/checkpoints)

function analyzePlan(form: FormState): Analysis {
  const heightCm = toNumber(form.heightCm);
  const currentWeightKg = toNumber(form.currentWeightKg);
  const goalWeightKg = toNumber(form.goalWeightKg);

  if (heightCm <= 0 || currentWeightKg <= 0 || goalWeightKg <= 0) {
    return {
      status: "blocked",
      bmi: null,
      bmiLabel: "--",
      healthyMinimumWeight: null,
      safeWeeklyLossKg: null,
      requestedLossKg: null,
      requestedWeeks: null,
      safeLossCapKg: null,
      recommendedGoalWeightKg: null,
      headline: "Enter valid height and weight values",
      summary: "Use positive numbers so the safety checks can calculate a reliable plan.",
      alert: "The app needs real measurements before it can validate the goal.",
      planMode: "maintenance",
    };
  }

  const heightM = heightCm / 100;
  const bmi = currentWeightKg / (heightM * heightM);
  const bmiLabel = classifyBmi(bmi);
  const healthyMinimumWeight = healthyBmiFloor * heightM * heightM;
  const requestedLossKg = Math.max(0, currentWeightKg - goalWeightKg);
  const requestedWeeks = form.durationDays / 7;
  const safeWeeklyLossKg = Math.min(absoluteWeeklyCapKg, currentWeightKg * bodyWeightLossCap);
  const safeLossCapKg = safeWeeklyLossKg * requestedWeeks;

  if (goalWeightKg < currentWeightKg && bmi < healthyBmiFloor) {
    return {
      status: "blocked",
      bmi,
      bmiLabel,
      healthyMinimumWeight,
      safeWeeklyLossKg,
      requestedLossKg,
      requestedWeeks,
      safeLossCapKg,
      recommendedGoalWeightKg: Math.max(currentWeightKg, healthyMinimumWeight),
      headline: "Weight-loss plan blocked for safety",
      summary: "This weight is already too low for safe loss guidance.",
      alert:
        "Because the BMI is in the underweight range, the app should not recommend further weight loss. A clinician or dietitian should review this goal.",
      planMode: "maintenance",
    };
  }

  if (goalWeightKg < healthyMinimumWeight) {
    return {
      status: "blocked",
      bmi,
      bmiLabel,
      healthyMinimumWeight,
      safeWeeklyLossKg,
      requestedLossKg,
      requestedWeeks,
      safeLossCapKg,
      recommendedGoalWeightKg: healthyMinimumWeight,
      headline: "Goal is below a safer weight range",
      summary: "The requested target falls below the minimum healthy BMI threshold.",
      alert: "The app will not plan a cut that moves the user below a medically safer range for their height.",
      planMode: goalWeightKg < currentWeightKg ? "loss" : "maintenance",
    };
  }

  if (goalWeightKg >= currentWeightKg) {
    return {
      status: "maintenance",
      bmi,
      bmiLabel,
      healthyMinimumWeight,
      safeWeeklyLossKg,
      requestedLossKg,
      requestedWeeks,
      safeLossCapKg,
      recommendedGoalWeightKg: goalWeightKg,
      headline: "Maintenance plan selected",
      summary: "The entered goal does not request weight loss, so the plan shifts to maintenance.",
      alert:
        "This app focuses on conservative loss planning. For gain or maintenance, it keeps the routine steady and avoids aggressive calorie cuts.",
      planMode: "maintenance",
    };
  }

  const recommendedGoalWeightKg = currentWeightKg - safeLossCapKg;
  const tooFast = requestedLossKg > safeLossCapKg + 0.01;

  if (tooFast) {
    return {
      status: "adjusted",
      bmi,
      bmiLabel,
      healthyMinimumWeight,
      safeWeeklyLossKg,
      requestedLossKg,
      requestedWeeks,
      safeLossCapKg,
      recommendedGoalWeightKg,
      headline: "Goal softened to a safer pace",
      summary: "The requested rate is faster than the conservative safety cap for this timeframe.",
      alert:
        "The app will recommend the safest realistic target within the chosen timeframe instead of chasing the full requested loss.",
      planMode: "loss",
    };
  }

  return {
    status: "safe",
    bmi,
    bmiLabel,
    healthyMinimumWeight,
    safeWeeklyLossKg,
    requestedLossKg,
    requestedWeeks,
    safeLossCapKg,
    recommendedGoalWeightKg: goalWeightKg,
    headline: "Goal is within conservative guardrails",
    summary: "The target is slow enough to plan around without pushing unrealistic loss speed.",
    alert: "Even a safe target should be reviewed against symptoms, medical history, and activity tolerance.",
    planMode: "loss",
  };
}

function emptyCheckIn(checkpoint: Checkpoint): CheckInDraft {
  return {
    checkpointId: checkpoint.id,
    checkpointLabel: checkpoint.label,
    checkpointWindow: checkpoint.window,
    sortIndex: Number(checkpoint.id.replace(/\D+/g, "")) || 0,
    completed: false,
    note: "",
    weight: "",
  };
}

function mapCheckIns(checkIns: CheckInRecord[]): Record<string, CheckInDraft> {
  return Object.fromEntries(
    checkIns.map((checkIn) => [
      checkIn.checkpointId,
      {
        checkpointId: checkIn.checkpointId,
        checkpointLabel: checkIn.checkpointLabel,
        checkpointWindow: checkIn.checkpointWindow,
        sortIndex: checkIn.sortIndex,
        completed: checkIn.completed,
        note: checkIn.note,
        weight: checkIn.weightKg === null ? "" : `${checkIn.weightKg}`,
      },
    ]),
  );
}

function toCheckInPayload(checkIn: CheckInDraft): {
  checkpointId: string;
  checkpointLabel: string;
  checkpointWindow: string;
  sortIndex: number;
  completed: boolean;
  note: string;
  weight: string;
} {
  return {
    checkpointId: checkIn.checkpointId,
    checkpointLabel: checkIn.checkpointLabel,
    checkpointWindow: checkIn.checkpointWindow,
    sortIndex: checkIn.sortIndex,
    completed: checkIn.completed,
    note: checkIn.note,
    weight: checkIn.weight,
  };
}

function toProfileForm(profile: ProfileRecord): FormState {
  return {
    heightCm: `${profile.heightCm}`,
    currentWeightKg: `${profile.currentWeightKg}`,
    goalWeightKg: `${profile.goalWeightKg}`,
    durationDays: profile.durationDays as DurationDays,
  };
}

function latestTrackedWeight(history: HistoryRecord[], fallbackWeight: string): string {
  const latestWeight = history.find((entry) => entry.weightKg !== null)?.weightKg;
  return latestWeight === undefined || latestWeight === null ? fallbackWeight : `${latestWeight}`;
}

function completionLabel(completed: number, total: number): string {
  if (total === 0) {
    return "No checkpoints";
  }

  return `${Math.round((completed / total) * 100)}% complete`;
}



export default function SafeWellDashboard() {
  // State for the entire dashboard
  const [form, setForm] = useState<FormState>(defaultForm);
  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isOnboardingSaving, setIsOnboardingSaving] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState<OnboardingForm>({
    ageYears: "",
    gender: "Male",
    healthConditions: "",
    heightCm: "",
    currentWeightKg: "",
  });
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return window.sessionStorage.getItem("safewell-active-profile") ?? "";
  });
  //temp storage of profile data before saving to database
  const [profileDraftName, setProfileDraftName] = useState("New profile");
  const [checkIns, setCheckIns] = useState<Record<string, CheckInDraft>>({});
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [syncMessage, setSyncMessage] = useState("Create a profile to store progress in the database.");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Hi! I am your SafeWell AI Health Coach. How can I help you support your wellness goals safely today?" }
  ]);
  //controlled components typed text
  const [chatInput, setChatInput] = useState("");
  const [isChatTyping, setIsChatTyping] = useState(false);
  const [websocket, setWebsocket] = useState<WebSocket | null>(null);

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isLoadingCheckpoints, setIsLoadingCheckpoints] = useState(false);

  // Water Tracker State
  const [waterIntake, setWaterIntake] = useState<number>(0);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.sessionStorage.getItem("safewell-water-intake");
      if (saved) {
        setWaterIntake(Number(saved));
      }
    }
  }, []);

  const setWaterIntakePersistent = (value: number | ((prev: number) => number)) => {
    setWaterIntake((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("safewell-water-intake", `${next}`);
      }
      return next;
    });
  };

  const analysis = analyzePlan(form);

  // Calorie & Macro calculations based on user profile and plan mode
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
//create func and store latest weight from checkIns or history, fallback to form.currentWeightKg
  const trackedCurrentWeight = (() => {
    const sortedDrafts = Object.values(checkIns).sort((a, b) => b.sortIndex - a.sortIndex);
    const latestWithWeight = sortedDrafts.find((d) => d.weight && toNumber(d.weight) > 0);
    return latestWithWeight ? latestWithWeight.weight : latestTrackedWeight(history, form.currentWeightKg);
  })();

  const progressPercent = checkpoints.length === 0 ? 0 : Math.round((completedCount / checkpoints.length) * 100);
  const recommendedGoalText =
    analysis.recommendedGoalWeightKg === null ? "--" : `${formatKg(analysis.recommendedGoalWeightKg)} kg`;
  const healthyMinimumText =
    analysis.healthyMinimumWeight === null ? "--" : `${formatKg(analysis.healthyMinimumWeight)} kg`;

  const safetyPillClass =
    analysis.status === "blocked"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
      : analysis.status === "adjusted"
        ? "border-amber-300/30 bg-amber-400/10 text-amber-50"
        : analysis.status === "maintenance"
          ? "border-sky-300/30 bg-sky-400/10 text-sky-50"
          : "border-emerald-300/30 bg-emerald-400/10 text-emerald-50";

  const safetyLabel =
    analysis.status === "blocked"
      ? "Blocked for safety"
      : analysis.status === "adjusted"
        ? "Target adjusted"
        : analysis.status === "maintenance"
          ? "Maintenance mode"
          : "Within guardrails";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedToken = window.sessionStorage.getItem("safewell-session-token") ?? "";
    if (!storedToken) {
      window.location.assign("/");
      return;
    }

    queueMicrotask(() => {
      setAuthToken(storedToken);
    });
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: authHeaders(authToken),
        });

        if (!response.ok) {
          throw new Error("Unable to load current user");
        }

        const data = (await response.json()) as { user: AuthUser };

        if (cancelled) {
          return;
        }

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
      } catch {
        if (!cancelled) {
          window.sessionStorage.removeItem("safewell-session-token");
          window.location.assign("/");
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (activeProfileId) {
      window.sessionStorage.setItem("safewell-active-profile", activeProfileId);
    } else {
      window.sessionStorage.removeItem("safewell-active-profile");
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (!isAuthReady || !authToken) {
      return;
    }

    let cancelled = false;

    async function loadProfiles() {
      try {
        const response = await fetch(`${API_BASE}/api/profiles/?token=${encodeURIComponent(authToken)}`, {
          headers: authHeaders(authToken),
        });
        if (!response.ok) {
          throw new Error("Unable to load profiles");
        }

        const data = (await response.json()) as { profiles: ProfileRecord[] };

        if (cancelled) {
          return;
        }

        setProfiles(data.profiles ?? []);

        if (!activeProfileId && (data.profiles?.length ?? 0) > 0) {
          setActiveProfileId(data.profiles[0].id);
        }
      } catch {
        if (!cancelled) {
          setSyncMessage("Database connection is unavailable right now.");
        }
      }
    }

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [authToken, isAuthReady]);

  useEffect(() => {
    if (!isAuthReady || !authToken) {
      return;
    }

    let cancelled = false;

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

        const snapshot = (await response.json()) as ProfileSnapshot;

        if (cancelled) {
          return;
        }

        setProfileDraftName(snapshot.profile.name);
        setForm(toProfileForm(snapshot.profile));
        setCheckIns(mapCheckIns(snapshot.checkIns));
        setHistory(snapshot.history ?? []);
        setSyncMessage(`Loaded ${snapshot.profile.name} from the database.`);
      } catch {
        if (!cancelled) {
          setSyncMessage("Could not load that profile.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [activeProfileId, authToken, isAuthReady]);

  // Load AI-powered Checkpoints
  useEffect(() => {
    if (!isAuthReady || !authToken) {
      return;
    }

    let cancelled = false;
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
          console.error("Unable to fetch checkpoints");
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setCheckpoints(data.checkpoints ?? []);
        }
      } catch (err) {
        console.error("Error loading checkpoints", err);
      } finally {
        if (!cancelled) {
          setIsLoadingCheckpoints(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.heightCm, form.currentWeightKg, form.goalWeightKg, form.durationDays, authToken, isAuthReady]);

  // WebSocket Chat Integration
  useEffect(() => {
    if (!isChatOpen || !authToken) {
      if (websocket) {
        websocket.close();
        setWebsocket(null);
      }
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let wsHost = API_BASE ? API_BASE.replace(/^http(s)?:\/\//, "") : window.location.host;
    if (!API_BASE && window.location.hostname === "localhost") {
      wsHost = "localhost:8001";
    }
    const wsUrl = `${protocol}//${wsHost}/api/chat/ws?token=${encodeURIComponent(authToken)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("Chat WebSocket connection opened.");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "token") {
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { role: "assistant", content: last.content + data.content }
              ];
            } else {
              return [
                ...prev,
                { role: "assistant", content: data.content }
              ];
            }
          });
        } else if (data.type === "done") {
          setIsChatTyping(false);
        }
      } catch (err) {
        console.error("WebSocket message parse error", err);
      }
    };

    ws.onclose = () => {
      console.log("Chat WebSocket connection closed.");
      setWebsocket(null);
      setIsChatTyping(false);
    };

    ws.onerror = () => {
      setIsChatTyping(false);
    };

    setWebsocket(ws);

    return () => {
      ws.close();
    };
  }, [isChatOpen, authToken]);

  function sendChatMessage(text: string) {
    if (!text.trim() || !websocket || isChatTyping) {
      return;
    }

    setChatMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" }
    ]);

    setIsChatTyping(true);
    websocket.send(JSON.stringify({
      message: text,
      profileId: activeProfileId
    }));

    setChatInput("");
  }

  function updateCheckIn(checkpoint: Checkpoint, patch: Partial<CheckInDraft>) {
    setCheckIns((current) => ({
      ...current,
      [checkpoint.id]: {
        ...(current[checkpoint.id] ?? emptyCheckIn(checkpoint)),
        ...patch,
      },
    }));
  }

  async function persistSnapshot(profileId: string): Promise<void> {
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
      throw new Error("Unable to save profile");
    }

    const snapshot = (await response.json()) as ProfileSnapshot;
    setProfiles((current) => {
      const withoutCurrent = current.filter((entry) => entry.id !== snapshot.profile.id);
      return [snapshot.profile, ...withoutCurrent].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
    setProfileDraftName(snapshot.profile.name);
    setHistory(snapshot.history ?? []);
    setCheckIns(mapCheckIns(snapshot.checkIns));
    setSyncMessage(`Saved ${snapshot.profile.name} to the database.`);
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
          throw new Error("Unable to create profile");
        }

        const created = (await createResponse.json()) as ProfileSnapshot;
        setActiveProfileId(created.profile.id);
        setProfileDraftName(created.profile.name);
        setHistory(created.history ?? []);
        setCheckIns(mapCheckIns(created.checkIns ?? []));
        await persistSnapshot(created.profile.id);
        return;
      }

      await persistSnapshot(activeProfileId);
    } catch {
      setSyncMessage("Saving failed. Check the connection and try again.");
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
        throw new Error("Unable to save onboarding data");
      }

      const data = (await response.json()) as { user: AuthUser };
      setCurrentUser(data.user);
      setShowOnboarding(false);
      setSyncMessage(`Welcome, ${data.user.name}. Your profile is ready.`);

      if (data.user.heightCm && data.user.currentWeightKg) {
        setForm((current) => ({
          ...current,
          heightCm: `${data.user.heightCm}`,
          currentWeightKg: `${data.user.currentWeightKg}`,
        }));
      }
    } catch {
      setSyncMessage("Could not save your profile details yet.");
    } finally {
      setIsOnboardingSaving(false);
    }
  }

  function handleSignOut() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("safewell-session-token");
      window.sessionStorage.removeItem("safewell-active-profile");
      window.location.assign("/");
    }
  }

  const needsBiweeklyWeightUpdate =
    form.durationDays >= 14 && toNumber(form.goalWeightKg) !== toNumber(form.currentWeightKg);

  if (!isAuthReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-slate-300">
          Loading your secure dashboard...
        </div>
      </main>
    );
  }

  const latestWeightPoints = history
    .filter((entry) => entry.weightKg !== null)
    .slice(0, 12)
    .reverse();
  const profileOptions = profiles.length > 0 ? profiles : [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.16),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(180deg,_#04111f_0%,_#08192c_50%,_#0b1320_100%)] text-slate-50">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35" />

      {showOnboarding && currentUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-950 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-teal-200">First-time setup</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Tell us your basics</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              We use age, height, and current weight to personalize safe recommendations and store your profile in the database.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Age</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="numeric"
                  value={onboardingForm.ageYears}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, ageYears: event.target.value }))}
                  placeholder="29"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Gender</span>
                <select
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-base text-white outline-none transition focus:border-teal-300/60 focus:bg-white/8"
                  value={onboardingForm.gender}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, gender: event.target.value }))}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Medical Conditions / Diseases</span>
                <textarea
                  className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8 h-20 resize-none"
                  value={onboardingForm.healthConditions}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, healthConditions: event.target.value }))}
                  placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma (or 'None')"
                />
                <span className="mt-1 block text-xs text-slate-400">If you have multiple conditions, list them all so our AI can personalize safety guardrails.</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Height (cm)</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="decimal"
                  value={onboardingForm.heightCm}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, heightCm: event.target.value }))}
                  placeholder="170"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Current weight (kg)</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="decimal"
                  value={onboardingForm.currentWeightKg}
                  onChange={(event) =>
                    setOnboardingForm((current) => ({ ...current, currentWeightKg: event.target.value }))
                  }
                  placeholder="75"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveOnboarding()}
                disabled={isOnboardingSaving}
                className="inline-flex items-center justify-center rounded-2xl bg-teal-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isOnboardingSaving ? "Saving..." : "Save profile"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.25em] text-teal-100">
                Safety-first planner
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                A medically conservative weight plan that refuses impossible goals.
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Enter height, current weight, goal weight, and timeframe. The app checks whether the target is realistic,
                blocks unsafe loss for low-weight users, and stores every saved account, check-in, and history row in SQLite.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4 sm:min-w-[320px]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Account</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{currentUser?.name ?? "Profile database"}</h2>
                  <p className="mt-1 text-xs text-slate-400">Database-backed login</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {profileOptions.length} saved
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Profile name</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                    value={profileDraftName}
                    onChange={(event) => setProfileDraftName(event.target.value)}
                    placeholder="New profile"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Switch account</span>
                  <select
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition focus:border-teal-300/60 focus:bg-white/8"
                    value={activeProfileId}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      setActiveProfileId(nextId);
                      if (!nextId) {
                        setForm(defaultForm);
                        setProfileDraftName("New profile");
                        setCheckIns({});
                        setHistory([]);
                        setSyncMessage("Create a new profile to start a fresh database record.");
                      }
                    }}
                  >
                    <option value="">Create new profile</option>
                    {profileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => void handleSaveProfile()}
                  disabled={isSaving || isLoadingProfile}
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Saving..." : activeProfileId ? "Save to database" : "Create account and save"}
                </button>

                <p className="text-sm leading-6 text-slate-300">{syncMessage}</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard label="Current BMI" value={formatBmi(analysis.bmi)} helper={analysis.bmiLabel} />
            <StatCard label="Safe weekly pace" value={analysis.safeWeeklyLossKg === null ? "--" : `${formatKg(analysis.safeWeeklyLossKg)} kg`} helper="Conservative cap" />
            <StatCard label="Recommended target" value={recommendedGoalText} helper={safetyLabel} />
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm font-medium text-slate-200">Guardrails used</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                <li>BMI check against a healthy minimum</li>
                <li>Loss capped at about 1% of body weight per week</li>
                <li>Maintenance mode if the request is not a weight-loss goal</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm font-medium text-slate-200">What the plan avoids</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                <li>Starvation or detox language</li>
                <li>Extreme calorie cuts</li>
                <li>Food advice that is not grounded in public-health guidance</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-sm font-medium text-slate-200">Database-backed history</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Progress, check-ins, and saved profiles are stored in SQLite, so the app can load them again later and show a full trend.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <aside className="rounded-[2rem] border border-cyan-300/20 bg-slate-950/55 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${safetyPillClass}`}>
                  {safetyLabel}
                </p>
                <h2 className="mt-4 text-2xl font-semibold text-white">Plan input</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  The app becomes more conservative when the target is too aggressive or the weight is already too low.
                </p>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => event.preventDefault()}>
              <Field label="Height (cm)">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="decimal"
                  value={form.heightCm}
                  onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))}
                  placeholder="170"
                />
              </Field>

              <Field label="Current weight (kg)">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="decimal"
                  value={form.currentWeightKg}
                  onChange={(event) => setForm((current) => ({ ...current, currentWeightKg: event.target.value }))}
                  placeholder="75"
                />
              </Field>

              <Field label="Goal weight (kg)">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60 focus:bg-white/8"
                  inputMode="decimal"
                  value={form.goalWeightKg}
                  onChange={(event) => setForm((current) => ({ ...current, goalWeightKg: event.target.value }))}
                  placeholder="70"
                />
              </Field>

              <Field label="Tracking window">
                <div className="grid gap-2 sm:grid-cols-2">
                  {durationOptions.map((option) => {
                    const selected = option.value === form.durationDays;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, durationDays: option.value }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-teal-300/60 bg-teal-400/15 text-white shadow-[0_0_0_1px_rgba(45,212,191,0.2)]"
                            : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/7"
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">{option.detail}</div>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </form>

            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-200">Plan verdict</p>
                <button
                  type="button"
                  onClick={() => void handleSaveProfile()}
                  disabled={isSaving || isLoadingProfile}
                  className="inline-flex items-center justify-center rounded-2xl border border-teal-300/30 bg-teal-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analysis.headline}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{analysis.summary}</p>
              <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm leading-6 text-slate-300">
                {analysis.alert}
              </p>
              {needsBiweeklyWeightUpdate ? (
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-sm leading-6 text-amber-50">
                  Reminder: when you are reducing or increasing weight over a 2+ week goal, update your weight at least once every
                  two weeks so the plan stays realistic.
                </p>
              ) : null}
            </div>
          </aside>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Plan summary</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Numeric guardrails</h3>

            <dl className="mt-6 space-y-4">
              <SummaryRow label="BMI" value={formatBmi(analysis.bmi)} />
              <SummaryRow label="BMI category" value={analysis.bmiLabel} />
              <SummaryRow label="Healthy minimum weight" value={`${healthyMinimumText} kg`} />
              <SummaryRow
                label="Requested loss"
                value={analysis.requestedLossKg === null ? "--" : `${formatKg(analysis.requestedLossKg)} kg`}
              />
              <SummaryRow
                label="Safe loss cap"
                value={analysis.safeLossCapKg === null ? "--" : `${formatKg(analysis.safeLossCapKg)} kg`}
              />
              <SummaryRow label="Recommended target" value={recommendedGoalText} />
            </dl>

            <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50">
              This app should not replace a doctor or dietitian. For pregnancy, diabetes, an eating disorder history, injuries,
              or unexplained weight loss, the plan should stop and the user should get clinical advice.
            </div>
          </div>
        </section>

        {/* Daily Tools & Calorie Goals Section */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Caloric & Macronutrient Estimator Card */}
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">Daily Targets</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Caloric & Macro Estimator</h3>
                </div>
                <div className="rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs text-teal-300">
                  Mifflin-St Jeor
                </div>
              </div>

              {caloricAnalysis.bmr > 0 ? (
                <>
                  <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-white/8 bg-white/5 p-5 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Recommended Daily Intake</p>
                    <p className="mt-2 text-4xl font-bold tracking-tight text-white">
                      {caloricAnalysis.target.toLocaleString()} <span className="text-lg font-medium text-slate-400">kcal/day</span>
                    </p>
                    {caloricAnalysis.isCapped && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-400/20">
                        ⚠️ Capped at health safety minimum
                      </span>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-300 border-t border-white/5 pt-3 w-full">
                      <div>
                        <span className="block text-slate-400">BMR (Basal)</span>
                        <span className="font-semibold">{caloricAnalysis.bmr} kcal</span>
                      </div>
                      <div>
                        <span className="block text-slate-400">TDEE (Maintenance)</span>
                        <span className="font-semibold">{caloricAnalysis.tdee} kcal</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Macronutrient Split</h4>
                    
                    {/* Protein bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-200">Protein (2.0g/kg)</span>
                        <span className="text-slate-400 font-semibold">{caloricAnalysis.protein}g · {caloricAnalysis.proteinPct}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${caloricAnalysis.proteinPct}%` }} />
                      </div>
                    </div>

                    {/* Fat bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-200">Fats (25%)</span>
                        <span className="text-slate-400 font-semibold">{caloricAnalysis.fat}g · {caloricAnalysis.fatPct}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${caloricAnalysis.fatPct}%` }} />
                      </div>
                    </div>

                    {/* Carbs bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-200">Carbohydrates</span>
                        <span className="text-slate-400 font-semibold">{caloricAnalysis.carbs}g · {caloricAnalysis.carbPct}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${caloricAnalysis.carbPct}%` }} />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-8 rounded-3xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                  Fill in your height and weight under Plan Input to calculate your customized calorie and macronutrient requirements.
                </div>
              )}
            </div>
            <div className="mt-6 text-[11px] leading-5 text-slate-400 italic border-t border-white/5 pt-3">
              Estimated based on {currentUser?.gender || "Male"} biological profile, {currentUser?.ageYears || 30} years old, at sedentary baseline. Target adjusts automatically based on Plan Mode (loss vs. maintenance).
            </div>
          </div>

          {/* Water Intake Tracker Card */}
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Hydration</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Daily Water Intake</h3>
                </div>
                <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                  Target: 2,500 ml
                </div>
              </div>

              <div className="mt-6 grid grid-cols-[1.5fr_1fr] gap-6 items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">Current Progress</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-white">
                    {waterIntake} <span className="text-lg font-medium text-slate-400">ml</span>
                  </p>
                  <p className="mt-1 text-sm text-cyan-300">
                    {Math.min(100, Math.round((waterIntake / 2500) * 100))}% of daily goal
                  </p>
                  
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWaterIntakePersistent((prev) => prev + 250)}
                      className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-center text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                      💧 +250 ml
                    </button>
                    <button
                      type="button"
                      onClick={() => setWaterIntakePersistent((prev) => prev + 500)}
                      className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-center text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                      🥤 +500 ml
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWaterIntakePersistent(0)}
                    className="mt-2 w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-2 text-center text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    Reset Counter
                  </button>
                </div>

                {/* Animated Glass UI */}
                <div className="flex flex-col items-center justify-center">
                  <div className="relative h-32 w-20 overflow-hidden rounded-b-2xl rounded-t-lg border-x-4 border-b-4 border-slate-300/40 bg-slate-900 shadow-inner">
                    {/* Water Level */}
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-600 to-cyan-400/80 transition-all duration-700 ease-out"
                      style={{ height: `${Math.min(100, (waterIntake / 2500) * 100)}%` }}
                    >
                      {/* Wave Effect */}
                      <div className="absolute -top-1 left-0 right-0 h-1.5 bg-cyan-300/50 animate-pulse rounded-full" />
                    </div>
                  </div>
                  <span className="mt-3 text-xs text-slate-400 uppercase tracking-widest">Glass status</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-[11px] leading-5 text-slate-400 italic border-t border-white/5 pt-3">
              Drinking enough water supports digestion, joint health, skin, and helps maintain high energy levels during calorie management.
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Tracked timeline</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {form.durationDays === 7 ? "Day-by-day tracking" : "Milestone tracking"}
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {isLoadingCheckpoints && (
                <div className="text-sm text-teal-300 animate-pulse font-medium">
                  AI generating timeline...
                </div>
              )}
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                {completedCount} of {checkpoints.length} logged
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>{completionLabel(completedCount, checkpoints.length)}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-300 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {checkpoints.map((checkpoint) => {
              const entry = checkIns[checkpoint.id] ?? emptyCheckIn(checkpoint);

              return (
                <article key={checkpoint.id} className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">{checkpoint.window}</p>
                      <h4 className="mt-2 text-lg font-semibold text-white">{checkpoint.label}</h4>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-200">
                      <input
                        className="size-4 rounded border-white/20 bg-white/10 text-teal-300 focus:ring-teal-300"
                        type="checkbox"
                        checked={entry.completed}
                        onChange={(event) => updateCheckIn(checkpoint, { completed: event.target.checked })}
                      />
                      Done
                    </label>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-300">{checkpoint.focus}</p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Food</p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                        {checkpoint.food.map((item, index) => (
                          <li key={`${checkpoint.id}-food-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Exercise</p>
                      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-300">
                        {checkpoint.exercise.map((item, index) => (
                          <li key={`${checkpoint.id}-exercise-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3 text-sm leading-6 text-slate-300">
                    {checkpoint.recovery}
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Scale check</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60"
                        inputMode="decimal"
                        placeholder="Optional weight"
                        value={entry.weight}
                        onChange={(event) => updateCheckIn(checkpoint, { weight: event.target.value })}
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Notes</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/60"
                        placeholder="Energy, hunger, or training note"
                        value={entry.note}
                        onChange={(event) => updateCheckIn(checkpoint, { note: event.target.value })}
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Weight trend</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Saved progress history</h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                {latestWeightPoints.length} weighted check-ins
              </div>
            </div>

            <WeightTrendChart
              points={latestWeightPoints.map((entry) => ({
                label: formatDate(entry.loggedAt),
                value: entry.weightKg as number,
              }))}
              targetWeight={toNumber(form.goalWeightKg)}
            />

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Recent activity</p>
              <div className="mt-4 space-y-3">
                {history.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{entry.checkpointLabel}</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{entry.checkpointWindow}</p>
                      </div>
                      <p className="text-xs text-slate-400">{formatDateTime(entry.loggedAt)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {entry.weightKg === null ? "No scale reading saved." : `${formatKg(entry.weightKg)} kg`}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>
                ))}

                {history.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm leading-6 text-slate-400">
                    Nothing saved yet. Use the check-ins above and press save to write your first database record.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">Profile snapshot</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {profileDraftName.trim() || "New profile"}
            </h3>

            <dl className="mt-6 space-y-4">
              <SummaryRow label="Gender" value={`${currentUser?.gender ?? "Unknown"}`} />
              <SummaryRow label="Age" value={currentUser?.ageYears ? `${currentUser.ageYears} years` : "Unknown"} />
              <SummaryRow label="Health Conditions" value={currentUser?.healthConditions || "None"} />
              <SummaryRow label="Height" value={`${form.heightCm} cm`} />
              <SummaryRow label="Current weight" value={`${form.currentWeightKg} kg`} />
              <SummaryRow label="Goal weight" value={`${form.goalWeightKg} kg`} />
              <SummaryRow
                label="Window"
                value={durationOptions.find((option) => option.value === form.durationDays)?.label ?? "1 month"}
              />
              <SummaryRow label="Progress" value={`${completedCount} / ${checkpoints.length} checkpoints`} />
            </dl>

            <div className="mt-6 rounded-2xl border border-sky-300/20 bg-sky-400/10 p-4 text-sm leading-6 text-sky-50">
              Saving writes the account, current plan inputs, and all checkpoints to SQLite. Reopening the profile restores the draft,
              the latest check-ins, and the saved history feed.
            </div>
          </div>
        </section>
      </div>

      {/* Floating AI Coach Trigger Button */}
      <button
        type="button"
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-teal-400 to-cyan-300 text-slate-950 shadow-[0_8px_30px_rgb(20,184,166,0.3)] transition-all duration-300 hover:scale-110 active:scale-95 hover:shadow-[0_12px_40px_rgb(20,184,166,0.5)] cursor-pointer border-none"
        aria-label="Open AI Health Coach Chat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* AI Coach Drawer Overlay */}
      <div 
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${isChatOpen ? "bg-slate-950/60 backdrop-blur-sm pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setIsChatOpen(false)}
      />

      {/* AI Coach Chat Drawer Panel */}
      <div 
        className={`fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-slate-950/95 shadow-[0_0_50px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 ease-in-out transform ${
          isChatOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-teal-400/10 text-teal-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-500 animate-ping" />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold text-white">SafeWell AI Coach</h3>
              <p className="text-xs text-slate-400">WebSocket connection online</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setIsChatOpen(false)}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white transition hover:bg-white/10 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Messages Log */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {chatMessages.map((msg, index) => {
            const isUser = msg.role === "user";
            return (
              <div key={`msg-${index}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 border ${
                    isUser 
                      ? "bg-teal-400/10 border-teal-400/20 text-teal-50 rounded-tr-none" 
                      : "bg-white/5 border-white/8 text-slate-100 rounded-tl-none"
                  }`}
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {msg.content === "" && !isUser ? (
                    <div className="flex items-center gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    </div>
                  ) : msg.content}
                </div>
              </div>
            );
          })}
        </div>

        {/* Suggestion Chips */}
        <div className="px-6 py-2 flex flex-wrap gap-2 border-t border-white/5 bg-slate-950/50">
          <button 
            type="button"
            onClick={() => sendChatMessage("Analyze my current weight trend and checkpoints progress.")}
            disabled={isChatTyping}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            📊 Analyze trend
          </button>
          <button 
            type="button"
            onClick={() => sendChatMessage("Suggest a safe, protein-forward meal layout for dinner.")}
            disabled={isChatTyping}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            🥗 Dinner ideas
          </button>
          <button 
            type="button"
            onClick={() => sendChatMessage("Give me a safety review of my weight plan.")}
            disabled={isChatTyping}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            ⚠️ Safety check
          </button>
        </div>

        {/* Input Form */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            sendChatMessage(chatInput);
          }}
          className="border-t border-white/10 bg-slate-950 px-6 py-4 flex gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isChatTyping}
            placeholder={isChatTyping ? "AI Coach is typing..." : "Ask your coach about meals, exercise, safety..."}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-teal-300/60 focus:bg-white/8 disabled:opacity-75"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isChatTyping}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400 text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer border-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      {children}
    </label>
  );
}

function StatCard({
  label,
  value,
  helper,
}: Readonly<{
  label: string;
  value: string;
  helper: string;
}>) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/6 p-4 backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-300">{helper}</p>
    </div>
  );
}

function RecommendationCard({ item }: Readonly<{ item: LibraryItem }>) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">{item.category}</p>
          <h4 className="mt-2 text-lg font-semibold text-white">{item.title}</h4>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs text-slate-300">{item.source}</span>
      </div>

      <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
        {item.tips.map((tip, index) => (
          <li key={`${item.id}-tip-${index}`} className="flex gap-3">
            <span className="mt-2 size-2 shrink-0 rounded-full bg-teal-300" />
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function SummaryRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function WeightTrendChart({
  points,
  targetWeight,
}: Readonly<{
  points: Array<{ label: string; value: number }>;
  targetWeight: number;
}>) {
  if (points.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-dashed border-white/12 bg-slate-950/35 px-4 py-8 text-sm leading-6 text-slate-400">
        Add weights to the check-ins above and save the profile to see a chart here.
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

  const toY = (value: number) => height - padding - ((value - minValue) / range) * (height - padding * 2);
  const path = points
    .map((point, index) => {
      const x = padding + index * step;
      const y = toY(point.value);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const targetY = toY(targetWeight);

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/35 p-4">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
        <span>Weight trend</span>
        <span>Goal line: {formatKg(targetWeight)} kg</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-64 w-full overflow-visible">
        <line x1={padding} x2={width - padding} y1={targetY} y2={targetY} stroke="rgba(251,191,36,0.55)" strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="rgba(45,212,191,0.95)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => {
          const x = padding + index * step;
          const y = toY(point.value);
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="1.8" fill="rgba(250,250,250,0.95)" />;
        })}
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4">
        <span>Latest: {formatKg(points[points.length - 1].value)} kg</span>
        <span>Lowest: {formatKg(Math.min(...points.map((point) => point.value)))} kg</span>
        <span>Highest: {formatKg(Math.max(...points.map((point) => point.value)))} kg</span>
        <span>{points.length} points</span>
      </div>
    </div>
  );
}
