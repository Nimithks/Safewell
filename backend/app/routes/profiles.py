import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Header, Request, Query
import google.generativeai as genai

from .. import safewell_db
from .auth import current_user

router = APIRouter()

def _db_path() -> str:
    return str(Path(__file__).resolve().parents[2] / "data" / "safewell.db")


@router.get("/")
def list_profiles(authorization: str | None = Header(default=None), token: str | None = None):
    user = current_user(authorization, token)
    profiles = safewell_db.list_profiles(_db_path(), int(user["id"]))
    return {"profiles": profiles}


@router.post("/")
async def create_profile(request: Request, authorization: str | None = Header(default=None), token: str | None = None):
    user = current_user(authorization, token)
    data = await request.json()
    snapshot = safewell_db.create_profile(_db_path(), int(user["id"]), data)
    return snapshot


@router.get("/checkpoints")
def get_checkpoints(
    heightCm: float,
    currentWeightKg: float,
    goalWeightKg: float,
    durationDays: int,
    authorization: str | None = Header(default=None),
    token: str | None = None
):
    user = current_user(authorization, token)
    user_age = user.get("age_years") or user.get("ageYears")
    user_gender = user.get("gender")
    user_health_conditions = user.get("health_conditions") or user.get("healthConditions")
    cps = generate_ai_checkpoints(heightCm, currentWeightKg, goalWeightKg, durationDays, user_age, user_gender, user_health_conditions)
    return {"checkpoints": cps}


@router.get("/{profile_id}")
def get_profile(profile_id: int, authorization: str | None = Header(default=None), token: str | None = None):
    user = current_user(authorization, token)
    p = safewell_db.get_profile(_db_path(), int(user["id"]), profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    return p


@router.put("/{profile_id}")
async def update_profile(profile_id: int, request: Request, authorization: str | None = Header(default=None), token: str | None = None):
    user = current_user(authorization, token)
    data = await request.json()
    p = safewell_db.get_profile(_db_path(), int(user["id"]), profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="Profile not found")
    return safewell_db.update_profile(_db_path(), int(user["id"]), profile_id, data)


@router.delete("/{profile_id}")
def delete_profile(profile_id: int, authorization: str | None = Header(default=None), token: str | None = None):
    user = current_user(authorization, token)
    ok = safewell_db.delete_profile(_db_path(), int(user["id"]), profile_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"deleted": True}


def generate_local_fallback_checkpoints(duration_days: int, plan_mode: str) -> list[dict]:
    if duration_days <= 0:
        return []
        
    checkpoints = []
    
    food_loss_short = ["Prioritize protein at each meal (e.g., eggs, dairy, legumes)", "Choose vegetables for volume and fiber to aid satiety", "Prefer water or unsweetened drinks to limit liquid calories"]
    food_loss_month = ["Aim for protein at every meal and a vegetable with each main meal", "Use portion control: consistent servings rather than skipping meals", "Limit sugary snacks; prefer whole-food carbohydrate sources"]
    food_loss_two_month = ["Distribute protein evenly across meals to preserve lean mass", "Introduce regular fibre-rich snacks to stabilize appetite", "Plan simple meal templates to reduce decision fatigue"]
    food_loss_three_month = ["Consolidate sustainable patterns: protein+veg+whole carb model", "Train meal timing for energy across training/resistance sessions", "Use small, consistent calorie adjustments rather than large cuts"]
    food_loss_six_month = ["Periodize caloric intake with planned maintenance phases to avoid metabolic adaptation", "Optimize micronutrient density to counter prolonged subtle deficits", "Refine intuitive portioning skills to lessen reliance on strict tracking"]
    food_loss_one_year = ["Transition toward a flexible dietary framework that accommodates social eating", "Adjust baseline macronutrient ratios to support increased physical adaptation and work capacity", "Focus on deeply ingrained behavioral habits rather than rigid dietary rules"]
    food_loss_two_year = ["Establish an permanent, individualized dietary pattern that supports long-term weight management", "Balance energy intake dynamically based on daily vs. weekly expenditure fluctuations", "Maintain a healthy relationship with food, viewing nutrition as fuel and long-term wellness"]

    food_maint_short = ["Balanced meals to avoid rapid fluctuations", "Keep hydration steady and monitor energy"]
    food_maint_month = ["Establish consistent portion sizes matching stable energy requirements", "Monitor hunger cues closely during the post-diet regulatory phase"]
    food_maint_two_month = ["Incorporate a wider variety of whole foods to expand micronutrient profiles", "Stabilize meal frequencies to regulate baseline metabolic rate"]
    food_maint_three_month = ["Anchor standard meal templates that require low cognitive overhead", "Ensure adequate carbohydrate intake to fully restore glycogen stores"]
    food_maint_six_month = ["Maintain nutritional variety and adequate calories to fully support daily activity", "Regular protein and micronutrient-rich foods to preserve optimal tissue function"]
    food_maint_one_year = ["Regularly audit micronutrient intake to prevent subtle long-term deficiencies", "Adapt macronutrient distribution dynamically to match seasonal training or lifestyle shifts"]
    food_maint_two_year = ["Cement an automated dietary baseline that maintains energy balance effortlessly", "Focus on systemic health markers and longevity-driven nutritional profiling"]

    ex_loss_short = ["Short brisk walks and gentle mobility sessions", "Two brief resistance-style sessions focused on major muscle groups"]
    ex_loss_month = ["3 low-to-moderate intensity cardio sessions plus 2 structured resistance sessions/week", "Prioritize movement after long sitting periods"]
    ex_loss_two_month = ["Progressive resistance twice weekly, increasing load slowly", "Include one moderate cardio session for endurance and recovery", "Use bodyweight strength work when equipment is limited"]
    ex_loss_three_month = ["Structured progressive resistance program (2–3x/week) with gradual overload", "Steady-state cardio 1–2x/week for cardiovascular health", "Add mobility work to support recovery and joint comfort"]
    ex_loss_six_month = ["Implement block periodization in resistance training to bust strength plateaus", "Integrate high-intensity interval metrics or varied cardio modalities to improve conditioning", "Incorporate deload weeks every 4–6 weeks to manage systemic fatigue and joints"]
    ex_loss_one_year = ["Focus on performance-based milestones (e.g., strength, speed) over scale weight", "Optimize training volume and intensity balance to safeguard lean mass at lower body weights", "Design an adaptable backup routine for travel or busy periods to preserve consistency"]
    ex_loss_two_year = ["Maintain an advanced physical work capacity that sustains a permanently higher baseline metabolic rate", "Prioritize long-term structural health, joint integrity, and injury prevention", "Rotate training focuses seasonally to keep workouts mentally fresh and physically challenging"]

    ex_maint_short = ["Gentle mobility and short walks to preserve function"]
    ex_maint_month = ["Maintain a regular baseline of non-exercise movement and daily step counts"]
    ex_maint_two_month = ["Execute two baseline full-body resistance sessions to sustain strength levels"]
    ex_maint_three_month = ["Incorporate consistent low-intensity steady-state cardio for cardiovascular health"]
    ex_maint_six_month = ["Regular resistance work to preserve lean mass and functional capacity", "Consistent aerobic movement to maintain fundamental metabolic fitness"]
    ex_maint_one_year = ["Introduce modern strength or endurance benchmarks to keep physical engagement high", "Periodize training volume to balance physical activity with long-term recovery metrics"]
    ex_maint_two_year = ["Solidify a permanent, lifetime fitness identity built around functional movement", "Optimize exercise programming strictly for systemic health, vitality, and skeletal longevity"]

    def food_for(band):
        if plan_mode == "loss":
            if band == "short": return food_loss_short
            if band == "month": return food_loss_month
            if band == "twoMonth": return food_loss_two_month
            if band == "threeMonth": return food_loss_three_month
            if duration_days <= 180: return food_loss_six_month
            if duration_days <= 365: return food_loss_one_year
            return food_loss_two_year
        else:
            if band == "short": return food_maint_short
            if band == "month": return food_maint_month
            if band == "twoMonth": return food_maint_two_month
            if band == "threeMonth": return food_maint_three_month
            if duration_days <= 180: return food_maint_six_month
            if duration_days <= 365: return food_maint_one_year
            return food_maint_two_year

    def exercise_for(band):
        if plan_mode == "loss":
            if band == "short": return ex_loss_short
            if band == "month": return ex_loss_month
            if band == "twoMonth": return ex_loss_two_month
            if band == "threeMonth": return ex_loss_three_month
            if duration_days <= 180: return ex_loss_six_month
            if duration_days <= 365: return ex_loss_one_year
            return ex_loss_two_year
        else:
            if band == "short": return ex_maint_short
            if band == "month": return ex_maint_month
            if band == "twoMonth": return ex_maint_two_month
            if band == "threeMonth": return ex_maint_three_month
            if duration_days <= 180: return ex_maint_six_month
            if duration_days <= 365: return ex_maint_one_year
            return ex_maint_two_year

    def pick(arr, idx, take=2):
        if not arr: return []
        out = []
        seen = set()
        for i in range(len(arr)):
            if len(out) >= take:
                break
            val = arr[(idx + i) % len(arr)]
            if val not in seen:
                seen.add(val)
                out.append(val)
        return out

    if duration_days <= 7:
        for idx in range(duration_days):
            day = idx + 1
            checkpoints.append({
                "id": f"day-{day}",
                "label": f"Day {day}",
                "window": f"Day {day}",
                "focus": "Set baseline measurements." if day == 1 else "Review the week." if day == duration_days else "Keep habits consistent.",
                "food": pick(food_for("short"), idx, 2),
                "exercise": pick(exercise_for("short"), idx, 2),
                "recovery": "Aim for 7-9 hours sleep." if plan_mode == "loss" else "Stabilize meals and rest."
            })
    elif duration_days <= 30:
        weeks = int((duration_days + 6) / 7)
        for idx in range(weeks):
            week = idx + 1
            start = idx * 7 + 1
            end = min((idx + 1) * 7, duration_days)
            checkpoints.append({
                "id": f"week-{week}",
                "label": f"Week {week}",
                "window": f"Days {start}-{end}",
                "focus": "Establish consistent meals." if week == 1 else "Summarize trend lines." if week == weeks else "Maintain consistent habit targets.",
                "food": pick(food_for("month"), idx * 2, 3),
                "exercise": pick(exercise_for("month"), idx * 2, 2),
                "recovery": "Weigh 2-3 times this week." if plan_mode == "loss" else "Focus on steady meals."
            })
    elif duration_days <= 60:
        weeks = int((duration_days + 6) / 7)
        for idx in range(weeks):
            week = idx + 1
            start = idx * 7 + 1
            end = min((idx + 1) * 7, duration_days)
            checkpoints.append({
                "id": f"week-{week}",
                "label": f"Week {week}",
                "window": f"Days {start}-{end}",
                "focus": "Baseline week: track intake." if week == 1 else "Consolidation week: review trends." if week == weeks else f"Week {week}: gradually increase resistance effort.",
                "food": pick(food_for("twoMonth"), idx * 2, 3),
                "exercise": pick(exercise_for("twoMonth"), idx * 2, 3),
                "recovery": "Prioritize protein and sleep." if plan_mode == "loss" else "Keep resistance to preserve function."
            })
    elif duration_days <= 90:
        blocks = int((duration_days + 13) / 14)
        for idx in range(blocks):
            block = idx + 1
            start = idx * 14 + 1
            end = min((idx + 1) * 14, duration_days)
            focus = "Adaptation phase." if idx == 0 else "Consolidation phase." if idx == blocks - 1 else "Skill/volume phase."
            checkpoints.append({
                "id": f"block-{block}",
                "label": f"Block {block}",
                "window": f"Days {start}-{end}",
                "focus": focus,
                "food": pick(food_for("threeMonth"), idx * 3, 4),
                "exercise": pick(exercise_for("threeMonth"), idx * 2, 3),
                "recovery": "If fatigue or dizziness appears, pause." if plan_mode == "loss" else "Stabilize weight and focus on strength."
            })
    elif duration_days <= 180:
        months = int((duration_days + 29) / 30)
        for idx in range(months):
            month = idx + 1
            start = idx * 30 + 1
            end = min((idx + 1) * 30, duration_days)
            checkpoints.append({
                "id": f"month-{month}",
                "label": f"Month {month}",
                "window": f"Days {start}-{end}",
                "focus": "Build a safe routine." if month == 1 else "Review full trend." if month == months else "Stay consistent.",
                "food": pick(food_for("long"), idx * 4, 4),
                "exercise": pick(exercise_for("long"), idx * 3, 3),
                "recovery": "Do not chase extra loss." if plan_mode == "loss" else "Keep the plan steady."
            })
    else:
        quarters = int((duration_days + 89) / 90)
        for idx in range(quarters):
            quarter = idx + 1
            start = idx * 90 + 1
            end = min((idx + 1) * 90, duration_days)
            checkpoints.append({
                "id": f"quarter-{quarter}",
                "label": f"Quarter {quarter}",
                "window": f"Days {start}-{end}",
                "focus": "Long-term progress goals." if quarter == 1 else "Refine habits and maintain changes.",
                "food": pick(food_for("long"), idx * 6, 5),
                "exercise": pick(exercise_for("long"), idx * 4, 4),
                "recovery": "Prioritize medical follow-up."
            })
            
    return checkpoints


def generate_ai_checkpoints(height_cm: float, current_weight_kg: float, goal_weight_kg: float, duration_days: int, user_age: int | None, user_gender: str | None = None, user_health_conditions: str | None = None) -> list[dict]:
    api_key = os.environ.get("GEMINI_API_KEY")
    plan_mode = "loss" if current_weight_kg > goal_weight_kg else "maintenance"
    
    if not api_key:
        return generate_local_fallback_checkpoints(duration_days, plan_mode)
        
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        bmi = 0.0
        bmi_band = "unknown"
        if height_cm > 0 and current_weight_kg > 0:
            height_m = height_cm / 100.0
            bmi = current_weight_kg / (height_m * height_m)
            if bmi < 18.5:
                bmi_band = "underweight"
            elif bmi < 25:
                bmi_band = "healthy"
            elif bmi < 30:
                bmi_band = "overweight"
            else:
                bmi_band = "higher-risk"

        if duration_days <= 7:
            count = duration_days
            unit = "daily (e.g. Day 1, Day 2)"
        elif duration_days <= 30:
            count = int((duration_days + 6) / 7)
            unit = "weekly (e.g. Week 1, Week 2)"
        elif duration_days <= 60:
            count = int((duration_days + 6) / 7)
            unit = "weekly progressive (e.g. Week 1, Week 2)"
        elif duration_days <= 90:
            count = int((duration_days + 13) / 14)
            unit = "14-day block phases (e.g. Block 1, Block 2)"
        elif duration_days <= 180:
            count = int((duration_days + 29) / 30)
            unit = "monthly milestones (e.g. Month 1, Month 2)"
        else:
            count = int((duration_days + 89) / 90)
            unit = "quarterly checkpoints (e.g. Quarter 1, Quarter 2)"

        prompt = f"""
You are the SafeWell AI Plan Generator. Your task is to output a highly personalized, progressive health and weight management timeline plan as a JSON array of checkpoints.
Create exactly {count} checkpoints matching the {unit} structure for a {duration_days}-day plan.

User Stats:
- Age: {user_age if user_age else 'Unknown'} years
- Gender: {user_gender if user_gender else 'Unknown'}
- Height: {height_cm:.1f} cm
- Current Weight: {current_weight_kg:.1f} kg (BMI: {bmi:.1f} - {bmi_band})
- Goal Weight: {goal_weight_kg:.1f} kg (Plan Mode: {plan_mode})
- Plan Duration: {duration_days} days
- Health Conditions / Diseases: {user_health_conditions if user_health_conditions else 'None'}

Instructions for AI-Based Recommendation Timeline Plan:
1. Every checkpoint's recommendations (Food, Exercise, Recovery) must be highly personalized and specific to the user's BMI ({bmi:.1f}), age, gender, and specified health conditions/diseases.
2. CRITICAL SAFETY GUARDRAILS FOR HEALTH CONDITIONS: If the user lists any health conditions/diseases (e.g. heart patient, diabetes, high blood pressure, asthma, etc.), you MUST strictly personalize suggestions to avoid any risk. For instance, heart patients must not be prescribed high-intensity training or stimulants/foods that raise heart rates or blood pressure; diabetic users should have sugar/carb-conscious dietary guidance. Make sure warnings are prominent where appropriate.
2. The advice must be progressive and cohesive across the timeline. It must not feel random or generic:
   - Early phases (e.g. Day 1, Week 1, or Block 1): Focus on establishing a baseline, hydration, gentle habit mapping, and adapting.
   - Middle phases: Focus on increasing training volume/intensity (e.g. progressive resistance load), balancing energy intake, meal timing, and monitoring recovery.
   - Late phases: Focus on consolidating habits, reviewing weight trends, and transitioning to a sustainable maintenance baseline.
3. Medical Safety Constraints (CRITICAL):
   - Underweight (BMI < 18.5) and Gaining/Maintenance: Focus entirely on caloric density, protein distribution, joint mobility, and rest.
   - Underweight (BMI < 18.5) and Loss: The plan is UNSAFE. The focus field must declare this immediately and recommend stopping weight loss. Food and exercise advice must focus on caloric restoration and minimal activity.
   - Overweight/Higher-Risk: Focus on steady, low-impact exercise (e.g. walking, swimming) to protect joints, and high-protein, fiber-rich portion control.
   - If pace is aggressive (loss rate exceeds 1 kg/week): Focus checkpoints on recovery, hydration, and increasing intake slightly to avoid extreme deficits.

Output Format:
You must return a JSON object with the key "checkpoints" containing a list of dictionaries with this structure:
{{
  "checkpoints": [
    {{
      "id": "day-1",
      "label": "Day 1",
      "window": "Day 1",
      "focus": "Short focus summary for this phase",
      "food": [
        "Personalized food recommendation 1",
        "Personalized food recommendation 2"
      ],
      "exercise": [
        "Personalized exercise/movement recommendation 1",
        "Personalized exercise/movement recommendation 2"
      ],
      "recovery": "Personalized recovery note/tip"
    }}
  ]
}}
"""
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        cps = data.get("checkpoints", [])
        
        if isinstance(cps, list) and len(cps) > 0:
            first = cps[0]
            if "id" in first and "label" in first and "window" in first and "focus" in first:
                return cps
                
        return generate_local_fallback_checkpoints(duration_days, plan_mode)
        
    except Exception as e:
        print(f"Gemini AI checkpoints generation failed: {e}")
        return generate_local_fallback_checkpoints(duration_days, plan_mode)



