from __future__ import annotations

import os
import json
import google.generativeai as genai
from dataclasses import dataclass
from datetime import datetime
from fastapi import APIRouter, Header, Query
from pathlib import Path
from typing import Any

from .. import safewell_db
from .auth import current_user

router = APIRouter()


def _db_path() -> str:
    return str(Path(__file__).resolve().parents[2] / "data" / "safewell.db")


@dataclass
class TrendContext:
    height_cm: float | None
    current_weight_kg: float | None
    goal_weight_kg: float | None
    duration_days: int | None
    trend_kg_per_week: float | None
    recent_delta_kg: float | None
    bmi: float | None
    plan_mode: str
    gender: str | None = None
    health_conditions: str | None = None


def _safe_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
    except Exception:
        return None
    return parsed if parsed == parsed else None


def _latest_weights(history: list[dict[str, Any]]) -> list[tuple[datetime, float]]:
    points: list[tuple[datetime, float]] = []
    for row in history:
        weight = _safe_float(row.get("weightKg"))
        logged_at = row.get("loggedAt") or row.get("updatedAt")
        if weight is None or not logged_at:
            continue
        try:
            points.append((datetime.fromisoformat(str(logged_at).replace("Z", "+00:00")), weight))
        except Exception:
            continue
    return points


def _derive_trend(
    history: list[dict[str, Any]],
    height_cm: float | None,
    current_weight_kg: float | None,
    goal_weight_kg: float | None,
    duration_days: int | None,
) -> TrendContext:
    points = _latest_weights(history)
    trend_kg_per_week = None
    recent_delta_kg = None

    if len(points) >= 2:
        latest_time, latest_weight = points[0]
        previous_time, previous_weight = points[1]
        days = max((latest_time - previous_time).total_seconds() / 86_400, 1.0)
        recent_delta_kg = latest_weight - previous_weight
        trend_kg_per_week = recent_delta_kg / days * 7.0
        if current_weight_kg is None:
            current_weight_kg = latest_weight
    elif len(points) == 1:
        _, latest_weight = points[0]
        if current_weight_kg is None:
            current_weight_kg = latest_weight

    if height_cm is None:
        for row in history:
            height_cm = _safe_float(row.get("heightCm"))
            if height_cm:
                break

    if current_weight_kg is not None and height_cm is not None and height_cm > 0:
        height_m = height_cm / 100.0
        bmi = current_weight_kg / (height_m * height_m)
    else:
        bmi = None

    if current_weight_kg is not None and goal_weight_kg is not None and current_weight_kg > goal_weight_kg:
        plan_mode = "loss"
    else:
        plan_mode = "maintenance"

    return TrendContext(
        height_cm=height_cm,
        current_weight_kg=current_weight_kg,
        goal_weight_kg=goal_weight_kg,
        duration_days=duration_days,
        trend_kg_per_week=trend_kg_per_week,
        recent_delta_kg=recent_delta_kg,
        bmi=bmi,
        plan_mode=plan_mode,
        gender=None,
        health_conditions=None,
    )


def _personalize_items(rows: list[dict[str, Any]], context: TrendContext) -> list[dict[str, Any]]:
    current_weight = context.current_weight_kg or 0.0
    goal_weight = context.goal_weight_kg or current_weight
    gap_kg = max(0.0, current_weight - goal_weight)
    bmi = context.bmi or 0.0
    duration_days = context.duration_days or 30
    bmi_band = "unknown"
    if bmi and bmi > 0:
        if bmi < 18.5:
            bmi_band = "underweight"
        elif bmi < 25:
            bmi_band = "healthy"
        elif bmi < 30:
            bmi_band = "overweight"
        else:
            bmi_band = "higher-risk"

    if gap_kg <= 0:
        goal_state = "maintenance"
    elif context.trend_kg_per_week is not None and context.trend_kg_per_week > 0:
        goal_state = "gaining"
    elif context.trend_kg_per_week is not None and context.trend_kg_per_week < -1.0:
        goal_state = "too_fast"
    else:
        goal_state = "loss"

    pace_text = "steady"

    if context.trend_kg_per_week is not None:
        pace_text = f"{abs(context.trend_kg_per_week):.1f} kg/week"

    risk_notes: list[str] = []
    if context.bmi is not None and context.bmi < 18.5:
        risk_notes.append("BMI is already in the underweight range, so further loss should be blocked.")
    if context.trend_kg_per_week is not None and context.trend_kg_per_week < -1.0:
        risk_notes.append("The current trend is faster than the conservative weekly loss cap.")
    if gap_kg > 0 and context.trend_kg_per_week is not None and context.trend_kg_per_week >= 0:
        risk_notes.append("Weight is not trending down yet, so focus should shift to adherence and routine.")
    if bmi_band == "overweight":
        risk_notes.append("Use a moderate deficit, not a crash diet, because the plan should be sustainable.")
    if bmi_band == "higher-risk":
        risk_notes.append("Keep the pace conservative and prioritize medical review if symptoms appear.")

    library_notes = {
        "exercise": {
            "underweight": [
                "Shift exercise toward gentle walking, mobility, and light strength maintenance.",
                "Avoid trying to burn calories aggressively when BMI is already low.",
            ],
            "healthy": [
                "Use brisk walking plus two or three resistance sessions each week.",
                "Keep cardio moderate so the plan supports fat loss without overreaching.",
            ],
            "overweight": [
                "Build a walking base and add short strength sessions to protect muscle while losing weight.",
                "Use low-impact cardio on most days and keep intensity moderate.",
            ],
            "higher-risk": [
                "Choose low-impact cardio and short strength sessions while monitoring recovery.",
                "Keep exercise comfortable enough to repeat consistently.",
            ],
            "unknown": [
                "Use brisk walking or low-impact cardio until the plan has stable measurements.",
                f"Match the effort to the recent change: {pace_text}.",
            ],
        }.get(bmi_band, []),
        "food": {
            "underweight": [
                "Use regular meals with enough calories, protein, and snacks so weight does not drift lower.",
                "Prioritize nutrient-dense foods over restriction.",
            ],
            "healthy": [
                "Keep meals protein-forward and portion-aware to support a steady deficit.",
                "Use vegetables, lean protein, and consistent carbs to keep hunger manageable.",
            ],
            "overweight": [
                "Build each meal around protein and produce, then trim the extra calories from drinks and snacks.",
                "Use portion control and pre-planned meals to make the target realistic.",
            ],
            "higher-risk": [
                "Keep meals regular and avoid skipping meals or fasting patterns.",
                "Use a conservative food plan with enough energy to avoid fatigue.",
            ],
            "unknown": [
                "Keep meals regular and protein-forward so the plan is easier to sustain.",
                "Use portions, not guesswork, when the goal is to move the scale safely.",
            ],
        }.get(bmi_band, []),
        "recovery": {
            "underweight": [
                "Protect sleep and hydration and watch for fatigue, cold intolerance, or dizziness.",
                "Recovery matters more than pushing activity volume.",
            ],
            "healthy": [
                "Track the moving average instead of one noisy weigh-in.",
                "Sleep and hydration help the target stay realistic over the tracking window.",
            ],
            "overweight": [
                "Use weekly or biweekly averages so normal fluctuations do not hide real progress.",
                "Consistency matters more than a perfect day.",
            ],
            "higher-risk": [
                "Track weight gently and prioritize recovery if the pace changes suddenly.",
                "If symptoms appear, pause the cut and get clinical input.",
            ],
            "unknown": [
                "Track the moving average instead of one noisy weigh-in.",
                "Protect sleep, hydration, and stress recovery while the body adapts.",
            ],
        }.get(bmi_band, []),
        "safety": {
            "underweight": [
                "Do not pursue further weight loss below the healthy BMI floor.",
                "This plan should shift to maintenance and medical review.",
            ],
            "healthy": [
                "Keep the pace inside the conservative weekly cap and adjust if the trend gets too fast.",
                "If the plan starts feeling punishing, slow down rather than forcing progress.",
            ],
            "overweight": [
                "Aim for a modest loss rate, not a crash diet, so the plan can be sustained.",
                "Recalculate the target when the body weight changes materially.",
            ],
            "higher-risk": [
                "Keep the pace conservative and get clinical review for any ongoing symptoms.",
                "Do not ignore repeated dizziness, fatigue, or rapid losses.",
            ],
            "unknown": [
                "Do not push below the healthy BMI floor or ignore repeated dizziness, fatigue, or food restriction.",
                "If the trend becomes unstable, pause cuts and get clinical review.",
            ],
        }.get(bmi_band, []),
    }

    emphasis = {
        "exercise": 0.0,
        "food": 0.0,
        "recovery": 0.0,
        "safety": 0.0,
    }

    if bmi_band == "underweight":
        emphasis.update({"food": 4.0, "recovery": 3.5, "safety": 5.0, "exercise": 1.0})
    elif bmi_band == "healthy":
        emphasis.update({"exercise": 4.0, "food": 3.5, "recovery": 2.0, "safety": 2.5})
    elif bmi_band == "overweight":
        emphasis.update({"exercise": 4.5, "food": 4.5, "recovery": 2.0, "safety": 3.0})
    elif bmi_band == "higher-risk":
        emphasis.update({"exercise": 2.0, "food": 3.0, "recovery": 4.5, "safety": 5.5})
    else:
        emphasis.update({"exercise": 3.0, "food": 3.0, "recovery": 3.0, "safety": 3.0})

    if goal_state == "maintenance":
        emphasis["recovery"] += 2.0
        emphasis["food"] += 1.0
    elif goal_state == "too_fast":
        emphasis["safety"] += 3.0
        emphasis["recovery"] += 2.0
    elif goal_state == "gaining":
        emphasis["food"] += 3.0
        emphasis["recovery"] += 1.0

    if duration_days <= 7:
        window_focus = "Daily checkpoints and tight feedback"
    elif duration_days <= 30:
        window_focus = "Weekly rhythm with one recalculation per week"
    else:
        window_focus = "Biweekly checks and slower adaptation"

    scored_rows: list[tuple[float, dict[str, Any]]] = []
    for index, row in enumerate(rows):
        category = str(row.get("type") or "").lower()
        score = emphasis.get(category, 0.0)
        score += max(0, 10 - index) * 0.1
        if context.trend_kg_per_week is not None:
            if context.trend_kg_per_week < -1.0 and category == "safety":
                score += 4.0
            if context.trend_kg_per_week >= 0 and category in {"food", "exercise"}:
                score += 2.0
        scored_rows.append((score, row))

    scored_rows.sort(key=lambda item: item[0], reverse=True)

    items: list[dict[str, Any]] = []
    for sort_index, (_, row) in enumerate(scored_rows):
        category = str(row.get("type") or "general")
        base_tip = str(row.get("description") or "").strip()
        tips = list(library_notes.get(category, library_notes["recovery"]))
        tips.append(window_focus)
        if risk_notes:
            tips.extend(risk_notes[:2])
        if base_tip:
            tips.append(base_tip)

        goal_title_override = {
            "maintenance": {
                "exercise": "Maintenance movement rhythm",
                "food": "Stable meal pattern",
                "recovery": "Maintenance and trend review",
                "safety": "Maintenance guardrails",
            },
            "loss": {
                "exercise": {
                    "underweight": "Gentle movement and maintenance",
                    "healthy": "Fat-loss support movement",
                    "overweight": "Walking base plus strength",
                    "higher-risk": "Low-impact movement only",
                    "unknown": "Movement priorities",
                }.get(bmi_band, "Movement priorities"),
                "food": {
                    "underweight": "Food plan for restoration",
                    "healthy": "Balanced deficit meals",
                    "overweight": "Protein and portion control",
                    "higher-risk": "Regular meals and recovery fuel",
                    "unknown": "Nutrition priorities",
                }.get(bmi_band, "Nutrition priorities"),
                "recovery": {
                    "underweight": "Recovery and symptom watch",
                    "healthy": "Trend tracking and recovery",
                    "overweight": "Consistency and sleep",
                    "higher-risk": "Conservative recovery plan",
                    "unknown": "Recovery priorities",
                }.get(bmi_band, "Recovery priorities"),
                "safety": {
                    "underweight": "Stop-loss safety check",
                    "healthy": "Safe pace check",
                    "overweight": "Sustainable-loss guardrails",
                    "higher-risk": "Clinical review guardrails",
                    "unknown": "Safety checks",
                }.get(bmi_band, "Safety checks"),
            },
            "too_fast": {
                "exercise": "Slow the pace and recover",
                "food": "Stabilize the deficit",
                "recovery": "Recovery and trend control",
                "safety": "Too-fast loss warning",
            },
            "gaining": {
                "exercise": "Increase activity gradually",
                "food": "Supportive food structure",
                "recovery": "Growth and recovery checks",
                "safety": "Weight-gain guardrails",
            },
        }

        title = goal_title_override.get(goal_state, {}).get(category, str(row.get("title") or "Personalized recommendation"))

        items.append(
            {
                "id": row["id"],
                "category": category,
                "title": title,
                "source": "SafeWell Library + trend engine",
                "planMode": context.plan_mode,
                "durationBucket": "short" if (context.duration_days or 0) <= 7 else "medium" if (context.duration_days or 0) <= 60 else "long",
                "sortIndex": sort_index,
                "tips": tips[:4],
            }
        )

    return items


def _generate_ai_recommendations(
    rows: list[dict[str, Any]],
    context: TrendContext,
    user_age: int | None,
    completed_count: int,
    history: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return _personalize_items(rows, context)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        # Determine BMI band
        bmi = context.bmi or 0.0
        bmi_band = "unknown"
        if bmi > 0:
            if bmi < 18.5:
                bmi_band = "underweight"
            elif bmi < 25:
                bmi_band = "healthy"
            elif bmi < 30:
                bmi_band = "overweight"
            else:
                bmi_band = "higher-risk"

        gap_kg = (context.current_weight_kg or 0.0) - (context.goal_weight_kg or 0.0)

        age_info = f"{user_age} years old" if user_age else "Unknown age"
        trend_info = f"{context.trend_kg_per_week:.2f} kg/week" if context.trend_kg_per_week is not None else "No stable trend yet"
        delta_info = f"{context.recent_delta_kg:.2f} kg" if context.recent_delta_kg is not None else "No weight change delta yet"

        gender_info = f", Gender: {context.gender}" if context.gender else ""
        health_info = f"\n- Health Conditions / Diseases: {context.health_conditions}" if context.health_conditions else "\n- Health Conditions / Diseases: None"
        prompt = f"""
You are the SafeWell AI Recommendation Engine, an expert system for safety-first weight planning and progress tracking.
Generate exactly 4 highly personalized health and wellness recommendation cards (one for each category: 'food', 'exercise', 'recovery', 'safety') for the user based on their profile and tracking progress.

User Profile & Current Context:
- Age: {age_info}{gender_info}{health_info}
- Height: {context.height_cm if context.height_cm else 'Unknown'} cm
- Starting/Current Weight: {context.current_weight_kg if context.current_weight_kg else 'Unknown'} kg (BMI: {bmi:.1f} - {bmi_band})
- Target Weight: {context.goal_weight_kg if context.goal_weight_kg else 'Unknown'} kg (Plan Mode: {context.plan_mode})
- Plan Duration: {context.duration_days if context.duration_days else 'Unknown'} days
- Recent Weight Trend: {trend_info} (Recent delta: {delta_info})
- Total Checkpoints Completed: {completed_count}

Strict Medical Safety Rules (CRITICAL):
1. Tailor all recommendations (nutritional intake, physical conditioning, recovery timelines) specifically to the user's age, BMI, gender, and health conditions/diseases.
2. Health Conditions Personalization: If the user lists any medical conditions or diseases (e.g. heart issues, diabetes, asthma, hypertension), the recommendations MUST adapt strictly to keep them safe. For example, do not recommend intense resistance loading or specific foods (like high sodium) if it contradicts their medical profile. Ensure advice aligns with medical common sense.
3. Underweight (BMI < 18.5): If the user's BMI is underweight and they are trying to lose weight, the plan MUST be flagged as UNSAFE. The 'safety' card must be extremely prominent, advising to stop weight loss, switch to maintenance, and consult a clinician immediately.
2. Rapid Weight Loss: If the recent trend shows they are losing weight faster than 1.0 kg/week (or if the planned pace is too aggressive), the 'safety' and 'recovery' cards must prioritize slowing down, increasing calories slightly, and recovery to prevent muscle loss or metabolic issues.
3. If they are in 'maintenance' mode, avoid recommending calorie deficits. Focus on habit consistency, energy balance, and sleep.

Output Format:
You must output a JSON object with the following structure:
{{
  "recommendations": [
    {{
      "category": "food",
      "title": "Short descriptive title tailored to their profile/trend",
      "tips": [
        "Concrete, personalized nutrition tip 1.",
        "Concrete, personalized nutrition tip 2.",
        "Concrete, personalized nutrition tip 3."
      ]
    }},
    {{
      "category": "exercise",
      "title": "Short descriptive title tailored to their profile/trend",
      "tips": [
        "Concrete, personalized movement tip 1.",
        "Concrete, personalized movement tip 2.",
        "Concrete, personalized movement tip 3."
      ]
    }},
    {{
      "category": "recovery",
      "title": "Short descriptive title tailored to their profile/trend",
      "tips": [
        "Concrete, personalized recovery/monitoring tip 1.",
        "Concrete, personalized recovery/monitoring tip 2.",
        "Concrete, personalized recovery/monitoring tip 3."
      ]
    }},
    {{
      "category": "safety",
      "title": "Short descriptive title tailored to their profile/trend",
      "tips": [
        "Concrete, personalized safety/health guardrail check 1.",
        "Concrete, personalized safety/health guardrail check 2.",
        "Concrete, personalized safety/health guardrail check 3."
      ]
    }}
  ]
}}
"""
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        
        items = []
        duration_bucket = "short" if (context.duration_days or 0) <= 7 else "medium" if (context.duration_days or 0) <= 60 else "long"
        
        for idx, rec in enumerate(data.get("recommendations", [])):
            category = rec.get("category", "recovery")
            title = rec.get("title", f"AI {category.capitalize()} Tip")
            tips = rec.get("tips", [])
            if not isinstance(tips, list):
                tips = [str(tips)]
            items.append({
                "id": f"ai-rec-{category}-{idx}",
                "category": category,
                "title": title,
                "source": "SafeWell AI Recommendation",
                "planMode": context.plan_mode,
                "durationBucket": duration_bucket,
                "sortIndex": idx,
                "tips": tips[:4]
            })
            
        if len(items) == 4:
            return items
        
        return _personalize_items(rows, context)

    except Exception as e:
        print(f"Gemini API recommendations failed: {e}")
        return _personalize_items(rows, context)


@router.get("/")
def list_library(
    authorization: str | None = Header(default=None),
    token: str | None = None,
    profileId: int | None = Query(default=None, alias="profileId"),
    heightCm: float | None = Query(default=None, alias="heightCm"),
    currentWeightKg: float | None = Query(default=None, alias="currentWeightKg"),
    goalWeightKg: float | None = Query(default=None, alias="goalWeightKg"),
    durationDays: int | None = Query(default=None, alias="durationDays"),
):
    user = current_user(authorization, token)
    rows = safewell_db.list_library(_db_path())

    snapshot = None
    if profileId is not None:
        snapshot = safewell_db.get_profile(_db_path(), int(user["id"]), profileId)
    if snapshot is None:
        profiles = safewell_db.list_profiles(_db_path(), int(user["id"]))
        if profiles:
            snapshot = safewell_db.get_profile(_db_path(), int(user["id"]), int(profiles[0]["id"]))

    history = snapshot["history"] if snapshot else []
    checkins = snapshot["checkIns"] if snapshot else []
    completed_count = sum(1 for ch in checkins if ch.get("completed"))
    user_age = user.get("age_years") or user.get("ageYears")

    context = _derive_trend(history, _safe_float(heightCm), _safe_float(currentWeightKg), _safe_float(goalWeightKg), durationDays)
    context.gender = user.get("gender")
    context.health_conditions = user.get("health_conditions") or user.get("healthConditions")
    return {"items": _generate_ai_recommendations(rows, context, user_age, completed_count, history)}

