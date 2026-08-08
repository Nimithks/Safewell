export const durationOptions = [
  { value: 7, label: "1 week", detail: "Daily check-ins from day 1 to day 7." },
  { value: 30, label: "1 month", detail: "Weekly checkpoints with a final review." },
  { value: 60, label: "2 months", detail: "Eight-week plan with weekly targets and progressive resistance." },
  { value: 90, label: "3 months", detail: "Three-month phased blocks focusing on adaptation and consolidation." },
  { value: 180, label: "6 months", detail: "Monthly milestones and habit consolidation." },
  { value: 365, label: "1 year", detail: "Long-term progress with quarterly reviews and maintenance planning." },
  { value: 730, label: "2 years", detail: "Sustained lifestyle changes with annual assessment." },
];

export const defaultForm = {
  heightCm: "170",
  currentWeightKg: "75",
  goalWeightKg: "70",
  durationDays: 30,
};

export const healthyBmiFloor = 18.5;
export const bodyWeightLossCap = 0.01;
export const absoluteWeeklyCapKg = 1;

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatKg(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatBmi(value) {
  if (value === null || value === undefined) {
    return "--";
  }
  return value.toFixed(1);
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function classifyBmi(bmi) {
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

export function analyzePlan(form) {
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
      alert: "Because the BMI is in the underweight range, the app should not recommend further weight loss. A clinician or dietitian should review this goal.",
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
      alert: "This app focuses on conservative loss planning. For gain or maintenance, it keeps the routine steady and avoids aggressive calorie cuts.",
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
      alert: "The app will recommend the safest realistic target within the chosen timeframe instead of chasing the full requested loss.",
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

export function emptyCheckIn(checkpoint) {
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

export function mapCheckIns(checkIns) {
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

export function toCheckInPayload(checkIn) {
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

export function toProfileForm(profile) {
  return {
    heightCm: `${profile.heightCm}`,
    currentWeightKg: `${profile.currentWeightKg}`,
    goalWeightKg: `${profile.goalWeightKg}`,
    durationDays: profile.durationDays,
  };
}

export function latestTrackedWeight(history, fallbackWeight) {
  const latestWeight = history.find((entry) => entry.weightKg !== null)?.weightKg;
  return latestWeight === undefined || latestWeight === null ? fallbackWeight : `${latestWeight}`;
}

export function completionLabel(completed, total) {
  if (total === 0) {
    return "No checkpoints";
  }
  return `${Math.round((completed / total) * 100)}% complete`;
}
