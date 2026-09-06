"""
SafeWell Metabolic Engine & Trajectory Analysis Module
=====================================================
Calculates Basal Metabolic Rate (Mifflin-St Jeor), Total Daily Energy Expenditure (TDEE),
macronutrient distribution targets, clinical boundary clamping (safety floors),
and progress trajectory safety corridors.
"""

from typing import Any, Dict, List, Tuple
from pydantic import BaseModel, Field
from datetime import datetime


class MetabolicProfile(BaseModel):
    bmr: float = Field(description="Basal Metabolic Rate in kcal/day")
    tdee: float = Field(description="Total Daily Energy Expenditure in kcal/day")
    target_calories: int = Field(description="Prescribed daily calorie target")
    calorie_delta: int = Field(description="Caloric deficit (-) or surplus (+)")
    mode: str = Field(description="Metabolic mode: 'loss', 'gain', or 'maintenance'")
    protein_g: int = Field(description="Daily protein target in grams")
    carbs_g: int = Field(description="Daily carbohydrate target in grams")
    fat_g: int = Field(description="Daily fat target in grams")
    max_safe_weekly_rate: float = Field(description="Maximum safe weekly weight velocity (kg/week)")
    is_underweight: bool = Field(description="True if BMI < 18.5")
    was_capped: bool = Field(default=False, description="True if target pace was capped to safe maximum rate")
    actual_days_needed: int = Field(default=0, description="Clinically safe days needed to reach target weight")
    notes: List[str] = Field(default_factory=list, description="Safety boundary notes")


def calculate_bmr_mifflin_st_jeor(
    weight_kg: float,
    height_cm: float,
    age_years: int,
    gender: str
) -> float:
    """
    Calculates Basal Metabolic Rate using the Mifflin-St Jeor equation:
      BMR (male)   = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) + 5
      BMR (female) = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(y) - 161
    """
    base = (10.0 * weight_kg) + (6.25 * height_cm) - (5.0 * age_years)
    if gender.strip().lower() == "female":
        return round(base - 161.0, 2)
    return round(base + 5.0, 2)


def calculate_calorie_delta(weight_kg: float, goal_weight_kg: float, duration_days: int) -> Dict[str, Any]:
    """
    Calculates prescribed caloric intake delta based on target weight goal and duration.
    Applies dynamic safety ceilings:
      - Weight loss: 1.0% starting body weight/week ceiling, capped at max 1,000 kcal/day deficit.
      - Weight gain: 0.5% starting body weight/week ceiling, capped at max 500 kcal/day surplus.
    Returns calorie_delta (negative for deficit, positive for surplus, 0 for maintenance),
    was_capped boolean, and actual_days_needed for safe progress.
    """
    days = max(1, duration_days)
    weeks = days / 7.0
    
    if abs(goal_weight_kg - weight_kg) < 0.01:
        return {
            "calorie_delta": 0,
            "was_capped": False,
            "actual_days_needed": days
        }

    if goal_weight_kg < weight_kg:
        # Weight Loss Mode
        total_weight_to_lose = weight_kg - goal_weight_kg
        required_weekly_loss = total_weight_to_lose / weeks
        
        # 1.0% starting body weight safety ceiling per week for weight loss
        max_safe_weekly_loss = weight_kg * 0.01
        safe_weekly_loss = min(max_safe_weekly_loss, required_weekly_loss)
        
        # Convert weekly weight loss (kg) to daily calorie deficit (7,700 kcal / kg)
        safe_daily_deficit = (safe_weekly_loss * 7700.0) / 7.0
        
        # Absolute medical floor: Never allow a deficit greater than 1,000 kcal/day
        safe_daily_deficit = min(1000.0, safe_daily_deficit)
        
        calorie_delta = -int(round(safe_daily_deficit))
        
        required_daily_deficit = (required_weekly_loss * 7700.0) / 7.0
        was_capped = (safe_weekly_loss < required_weekly_loss) or (safe_daily_deficit < required_daily_deficit)
        actual_days_needed = int(round((total_weight_to_lose / max_safe_weekly_loss) * 7)) if was_capped else days
        
        return {
            "calorie_delta": calorie_delta,
            "was_capped": was_capped,
            "actual_days_needed": actual_days_needed
        }
    else:
        # Weight Gain Mode
        total_weight_to_gain = goal_weight_kg - weight_kg
        required_weekly_gain = total_weight_to_gain / weeks
        
        # 0.5% starting body weight safety ceiling per week for lean weight gain (0.005 * weight_kg)
        max_safe_weekly_gain = weight_kg * 0.005
        safe_weekly_gain = min(max_safe_weekly_gain, required_weekly_gain)
        
        # Convert weekly weight gain (kg) to daily calorie surplus (7,700 kcal / kg)
        safe_daily_surplus = (safe_weekly_gain * 7700.0) / 7.0
        
        # Absolute medical floor: Cap surplus at max 500 kcal/day to prevent rapid fat accumulation
        safe_daily_surplus = min(500.0, safe_daily_surplus)
        
        calorie_delta = int(round(safe_daily_surplus))
        
        required_daily_surplus = (required_weekly_gain * 7700.0) / 7.0
        was_capped = (safe_weekly_gain < required_weekly_gain) or (safe_daily_surplus < required_daily_surplus)
        actual_days_needed = int(round((total_weight_to_gain / max_safe_weekly_gain) * 7)) if was_capped else days
        
        return {
            "calorie_delta": calorie_delta,
            "was_capped": was_capped,
            "actual_days_needed": actual_days_needed
        }


def calculate_metabolic_profile(
    weight_kg: float,
    height_cm: float,
    age_years: int,
    gender: str,
    goal_weight_kg: float,
    duration_days: int,
    activity_multiplier: float = 1.375
) -> MetabolicProfile:
    """
    Computes BMR, TDEE, safe caloric budget, and macronutrient targets.
    Enforces clinical safety boundary clamping:
      - Max safe deficit: 1% starting body weight/week or max 1,000 kcal/day (weight loss)
      - Max safe surplus: 0.5% starting body weight/week or max 500 kcal/day (weight gain)
      - Minimum safe intake: 1200 kcal for females, 1500 kcal for males
      - Minors (<18) and Underweight (BMI < 18.5) are constrained to non-deficit intake
    """
    bmr = calculate_bmr_mifflin_st_jeor(weight_kg, height_cm, age_years, gender)
    tdee = round(bmr * activity_multiplier, 2)
    
    height_m = height_cm / 100.0
    bmi = weight_kg / (height_m * height_m)
    is_underweight = bmi < 18.5
    
    notes = []
    was_capped = False
    actual_days_needed = max(1, duration_days)
    
    if is_underweight:
        bmi_18_5_goal = round(18.5 * (height_m ** 2), 2)
        if goal_weight_kg < bmi_18_5_goal:
            goal_weight_kg = bmi_18_5_goal
            notes.append(
                f"Underweight safety floor active (BMI {round(bmi, 2)} < 18.5): "
                f"Goal weight automatically updated to {bmi_18_5_goal} kg to achieve healthy BMI of 18.5. Weight gain plan activated."
            )

    # Determine mode & calculate safe deficit/surplus
    if goal_weight_kg < weight_kg:
        mode = "loss"
        if age_years < 18:
            calorie_delta = 0
            mode = "maintenance"
            notes.append("Youth growth safety floor active: Caloric deficit prohibited under age 18.")
        else:
            delta_info = calculate_calorie_delta(weight_kg, goal_weight_kg, duration_days)
            calorie_delta = delta_info["calorie_delta"]
            was_capped = delta_info["was_capped"]
            actual_days_needed = delta_info["actual_days_needed"]
            if was_capped:
                notes.append(
                    f"Loss pace capped to safe limit (1% weight/week or 1000 kcal max deficit). "
                    f"Recommended safe duration: {actual_days_needed} days."
                )

    elif goal_weight_kg > weight_kg:
        mode = "gain"
        delta_info = calculate_calorie_delta(weight_kg, goal_weight_kg, duration_days)
        calorie_delta = delta_info["calorie_delta"]
        was_capped = delta_info["was_capped"]
        actual_days_needed = delta_info["actual_days_needed"]
        if was_capped:
            notes.append(
                f"Gain pace capped to safe limit (0.5% weight/week or 500 kcal max surplus). "
                f"Recommended safe duration: {actual_days_needed} days."
            )
    else:
        mode = "maintenance"
        calorie_delta = 0

    raw_target_calories = int(round(tdee + calorie_delta))
    
    # Enforce minimum clinical caloric intake floors
    min_floor = 1200 if gender.strip().lower() == "female" else 1500
    if raw_target_calories < min_floor and mode == "loss":
        raw_target_calories = min_floor
        notes.append(f"Minimum calorie intake floor active: Intake clamped to safe minimum of {min_floor} kcal/day.")

    target_calories = raw_target_calories
    
    # Macronutrient Distribution:
    # Protein: 1.8g/kg bodyweight (capped at 30% of total calories)
    # Fats: 28% of total calories (9 kcal/g)
    # Carbs: Remaining calories (4 kcal/g)
    protein_target_g = max(60, int(round(weight_kg * 1.8)))
    if (protein_target_g * 4) > (target_calories * 0.35):
        protein_target_g = int((target_calories * 0.30) / 4)

    fat_cals = target_calories * 0.28
    fat_target_g = max(35, int(round(fat_cals / 9.0)))
    
    remaining_cals = max(0, target_calories - (protein_target_g * 4) - (fat_target_g * 9))
    carbs_target_g = int(round(remaining_cals / 4.0))

    max_safe_rate = min(1.0, weight_kg * 0.01) if mode == "loss" else 0.5

    return MetabolicProfile(
        bmr=bmr,
        tdee=tdee,
        target_calories=target_calories,
        calorie_delta=calorie_delta,
        mode=mode,
        protein_g=protein_target_g,
        carbs_g=carbs_target_g,
        fat_g=fat_target_g,
        max_safe_weekly_rate=round(max_safe_rate, 2),
        is_underweight=is_underweight,
        was_capped=was_capped,
        actual_days_needed=actual_days_needed,
        notes=notes
    )


def analyze_user_progress(user: dict, rows: list) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Calculates expected target weight trajectory and safety corridor boundaries for each check-in.
    Evaluates both cumulative trajectory boundaries and interval step transition safety between
    consecutive check-in dates (same day, next day, or any day intervals).
    
    Evaluates status flags: 'on_track', 'losing_too_fast', 'gaining_too_fast', or 'behind_target'.
    """
    w_start = float(user.get("current_weight_kg") or 70.0)
    w_goal = float(user.get("goal_weight_kg") or w_start)
    duration = int(user.get("duration_days") or 30)
    created_at_str = user.get("created_at") or datetime.utcnow().isoformat()
    
    try:
        start_date = datetime.fromisoformat(created_at_str).date()
    except Exception:
        start_date = datetime.utcnow().date()
        
    height_cm = float(user.get("height_cm") or 170.0)
    height_m = height_cm / 100.0
    bmi_start = w_start / (height_m * height_m) if height_m > 0 else 0
    if bmi_start < 18.5:
        bmi_18_5_goal = round(18.5 * (height_m ** 2), 2)
        if w_goal < bmi_18_5_goal:
            w_goal = bmi_18_5_goal
            
    age_years = int(user.get("age_years") or 25)
    gender = str(user.get("gender") or "Male")
    
    profile = calculate_metabolic_profile(
        weight_kg=w_start,
        height_cm=height_cm,
        age_years=age_years,
        gender=gender,
        goal_weight_kg=w_goal,
        duration_days=duration
    )
    
    max_safe_daily_rate = profile.max_safe_weekly_rate / 7.0
    checkins = []
    
    has_start_date = any(r.get("logged_date") == start_date.isoformat() for r in rows)
    if not has_start_date:
        rows = [{"id": 0, "logged_date": start_date.isoformat(), "weight": w_start, "note": "Initial Baseline"}] + list(rows)
        
    def parse_date(item):
        try:
            return datetime.strptime(item["logged_date"], "%Y-%m-%d").date()
        except Exception:
            return start_date
            
    sorted_rows = sorted(rows, key=parse_date)
    
    for idx, r in enumerate(sorted_rows):
        try:
            c_date = datetime.strptime(r["logged_date"], "%Y-%m-%d").date()
        except Exception:
            c_date = start_date
            
        days_elapsed = max(0, (c_date - start_date).days)
        ratio = min(1.0, days_elapsed / max(1, duration))  
        expected_weight = round(w_start + ratio * (w_goal - w_start), 2)
        logged_w = float(r["weight"])
        
        cumulative_max_change = max_safe_daily_rate * days_elapsed

        # Calculate interval metrics from the last stored date entry
        if idx > 0:
            prev_r = sorted_rows[idx - 1]
            try:
                prev_date = datetime.strptime(prev_r["logged_date"], "%Y-%m-%d").date()
            except Exception:
                prev_date = start_date
            prev_w = float(prev_r["weight"])
            days_since_last = max(0, (c_date - prev_date).days)
            weight_change_from_last = round(logged_w - prev_w, 2)
        else:
            prev_date = start_date
            prev_w = logged_w
            days_since_last = 0
            weight_change_from_last = 0.0

        # Determine interval maximum safe change limit
        target_daily_rate = abs(w_goal - w_start) / max(1, duration)
        effective_safe_daily_rate = max(max_safe_daily_rate, target_daily_rate * 1.25)
        # Add 0.5 kg buffer for physiological daily water weight/glycogen fluctuations
        max_interval_safe_change = round((effective_safe_daily_rate * days_since_last) + 0.5, 2)

        if w_goal < w_start:
            steepest_safe_weight = round(w_start - cumulative_max_change, 2)
            
            step_loss = round(prev_w - logged_w, 2) if idx > 0 else 0.0
            is_step_unsafe = (idx > 0) and (step_loss > max_interval_safe_change)
            is_cum_unsafe = (logged_w < steepest_safe_weight - 0.2) and (days_elapsed > 1)
            
            if is_step_unsafe or is_cum_unsafe:
                status = "losing_too_fast"
                status_label = "⚠️ Unsafe Rapid Loss"
                if is_step_unsafe:
                    if days_since_last == 0:
                        status_msg = f"⚠️ Unsafe Same-Day Drop: Logged weight dropped by {abs(weight_change_from_last)}kg on same day (since entry on {prev_date.isoformat()}) exceeding safe limit ({max_interval_safe_change}kg)."
                    elif days_since_last == 1:
                        status_msg = f"⚠️ Unsafe Rapid Transition: Logged weight dropped by {abs(weight_change_from_last)}kg in 1 day (since entry on {prev_date.isoformat()}) exceeding safe 1-day rate ({max_interval_safe_change}kg)."
                    else:
                        status_msg = f"⚠️ Unsafe Rapid Transition: Logged weight dropped by {abs(weight_change_from_last)}kg over {days_since_last} days (since entry on {prev_date.isoformat()}) exceeding safe limit ({max_interval_safe_change}kg)."
                else:
                    status_msg = f"Cumulative weight loss ({round(w_start - logged_w, 1)}kg) exceeds maximum safe cumulative rate ({round(cumulative_max_change, 1)}kg)."
            elif logged_w > expected_weight + 0.8 and days_elapsed > 3:
                status = "behind_target"
                status_label = "⚠️ Stagnant / Off-Track"
                status_msg = f"Current weight ({logged_w}kg) is above expected target path ({expected_weight}kg)."
            else:
                status = "on_track"
                status_label = "✓ Clinically Safe & On Track"
                status_msg = "Progress aligns with target safety corridor."

        elif w_goal > w_start:
            steepest_safe_weight = round(w_start + cumulative_max_change, 2)
            
            step_gain = round(logged_w - prev_w, 2) if idx > 0 else 0.0
            is_step_unsafe = (idx > 0) and (step_gain > max_interval_safe_change)
            is_cum_unsafe = (logged_w > steepest_safe_weight + 0.2) and (days_elapsed > 1)
            
            if is_step_unsafe or is_cum_unsafe:
                status = "gaining_too_fast"
                status_label = "⚠️ Unsafe Rapid Gain"
                if is_step_unsafe:
                    if days_since_last == 0:
                        status_msg = f"⚠️ Unsafe Same-Day Spike: Logged weight gained {weight_change_from_last}kg on same day (since entry on {prev_date.isoformat()}) exceeding safe limit ({max_interval_safe_change}kg)."
                    elif days_since_last == 1:
                        status_msg = f"⚠️ Unsafe Rapid Transition: Logged weight gained {weight_change_from_last}kg in 1 day (since entry on {prev_date.isoformat()}) exceeding safe 1-day rate ({max_interval_safe_change}kg)."
                    else:
                        status_msg = f"⚠️ Unsafe Rapid Transition: Logged weight gained {weight_change_from_last}kg over {days_since_last} days (since entry on {prev_date.isoformat()}) exceeding safe limit ({max_interval_safe_change}kg)."
                else:
                    status_msg = f"Cumulative weight gain ({round(logged_w - w_start, 1)}kg) exceeds maximum safe cumulative rate ({round(cumulative_max_change, 1)}kg)."
            elif logged_w < expected_weight - 0.8 and days_elapsed > 3:
                status = "behind_target"
                status_label = "⚠️ Stagnant / Off-Track"
                status_msg = f"Current weight ({logged_w}kg) is below expected target path ({expected_weight}kg)."
            else:
                status = "on_track"
                status_label = "✓ Clinically Safe & On Track"
                status_msg = "Progress aligns with target safety corridor."

        else: # maintenance
            steepest_safe_weight = w_start
            step_change = abs(weight_change_from_last) if idx > 0 else 0.0
            is_step_unsafe = (idx > 0) and (step_change > max_interval_safe_change)
            
            if is_step_unsafe or abs(logged_w - w_start) > 2.0:
                status = "behind_target"
                status_label = "⚠️ Fluctuating"
                status_msg = f"Weight fluctuation of {step_change}kg over {days_since_last} days exceeds stable maintenance range."
            else:
                status = "on_track"
                status_label = "✓ On Maintenance Target"
                status_msg = "Weight is stable within maintenance range."

        checkins.append({
            "id": r.get("id", idx),
            "logged_date": r["logged_date"],
            "weight": logged_w,
            "expected_weight": expected_weight,
            "safety_boundary_weight": steepest_safe_weight,
            "days_elapsed": days_elapsed,
            "days_since_last": days_since_last,
            "weight_change_from_last": weight_change_from_last,
            "max_interval_safe_change": max_interval_safe_change,
            "status": status,
            "status_label": status_label,
            "status_message": status_msg,
            "status_msg": status_msg,
            "note": r.get("note") or ""
        })
        
    latest_checkin = checkins[-1] if checkins else {}
    summary = {
        "startWeightKg": w_start,
        "goalWeightKg": w_goal,
        "durationDays": duration,
        "startDate": start_date.isoformat(),
        "starting_weight_kg": w_start,
        "target_weight_kg": w_goal,
        "latest_weight_kg": latest_checkin.get("weight", w_start),
        "total_days_tracked": latest_checkin.get("days_elapsed", 0),
        "current_status": latest_checkin.get("status", "on_track"),
        "current_status_label": latest_checkin.get("status_label", "✓ Ready"),
        "current_status_msg": latest_checkin.get("status_message", "No baseline deviations detected."),
        "bmr": profile.bmr,
        "tdee": profile.tdee,
        "targetCalories": profile.target_calories,
        "calorieDelta": profile.calorie_delta,
        "proteinG": profile.protein_g,
        "carbsG": profile.carbs_g,
        "fatG": profile.fat_g,
        "maxSafeWeeklyRate": profile.max_safe_weekly_rate,
        "wasCapped": profile.was_capped,
        "actualDaysNeeded": profile.actual_days_needed,
        "metabolic_profile": profile.dict() if hasattr(profile, "dict") else (profile.__dict__ if hasattr(profile, "__dict__") else profile)
    }
    
    return checkins, summary
