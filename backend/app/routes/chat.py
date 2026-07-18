import os
import json
import asyncio
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import google.generativeai as genai

from .. import safewell_db

router = APIRouter()

def _db_path() -> str:
    return str(Path(__file__).resolve().parents[2] / "data" / "safewell.db")

def _safe_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        parsed = float(value)
        return parsed if parsed == parsed else None
    except Exception:
        return None

def _get_local_fallback_response(user: dict, profile_data: dict | None, user_message: str) -> str:
    """Generates a high-quality local fallback response if Gemini is unavailable."""
    msg = user_message.lower()
    username = user.get("name", "User")
    
    # Extract stats
    height = None
    weight = None
    age = user.get("age_years") or user.get("ageYears")
    gender = user.get("gender")
    health_conditions = user.get("health_conditions") or user.get("healthConditions")
    
    if profile_data:
        profile = profile_data.get("profile", {})
        height = _safe_float(profile.get("heightCm"))
        weight = _safe_float(profile.get("currentWeightKg"))
    
    if height is None:
        height = _safe_float(user.get("height_cm")) or _safe_float(user.get("heightCm"))
    if weight is None:
        weight = _safe_float(user.get("current_weight_kg")) or _safe_float(user.get("currentWeightKg"))
        
    bmi = None
    bmi_band = "unknown"
    if height and weight and height > 0:
        height_m = height / 100.0
        bmi = weight / (height_m * height_m)
        if bmi < 18.5:
            bmi_band = "underweight"
        elif bmi < 25:
            bmi_band = "healthy"
        elif bmi < 30:
            bmi_band = "overweight"
        else:
            bmi_band = "higher-risk"
            
    # Check what user is asking about
    if "food" in msg or "eat" in msg or "diet" in msg or "meal" in msg or "calorie" in msg or "recipe" in msg:
        if bmi_band == "underweight":
            return (
                f"Hi {username}, looking at your profile, your BMI is in the underweight range ({bmi:.1f} if calculated). "
                "For food, focus on nutrient-dense meals and regular snacks rather than restriction. "
                "Prioritize protein (eggs, dairy, fish, nuts, tofu) and healthy fats (olive oil, avocados) to support muscle and tissue recovery. "
                "Please do not restrict calories and consider talking with a doctor or dietitian."
            )
        elif bmi_band == "healthy":
            return (
                f"Hi {username}. For a healthy range weight target, aim for regular, protein-forward meals (e.g. 1.2-1.6g of protein per kg of bodyweight). "
                "Combine lean protein with high-fiber vegetables and complex carbohydrates (oats, brown rice, sweet potatoes) to support satiety. "
                "Avoid crash diets and keep your daily caloric intake close to maintenance or in a very mild deficit."
            )
        else:
            return (
                f"Hi {username}. For a safe and sustainable plan, build meals around lean protein and high-fiber vegetables. "
                "This helps protect muscle mass and manage hunger. Try to swap refined sugary foods for whole foods (fruit, nuts, oats). "
                "Keep a consistent meal structure and drink plenty of water (at least 2-3 liters daily) to support metabolic health and energy."
            )
            
    elif "exercise" in msg or "workout" in msg or "training" in msg or "walk" in msg or "cardio" in msg or "strength" in msg:
        if bmi_band == "underweight":
            return (
                f"Hi {username}. With a BMI in the underweight range, we want to shift activity away from intense calorie-burning cardio. "
                "Focus instead on gentle walking, mobility exercises, and light strength training to maintain muscle and bone health. "
                "Allow plenty of recovery days and always refuel with adequate food after moving."
            )
        elif bmi_band == "higher-risk":
            return (
                f"Hi {username}. For exercise, prioritize low-impact activities like walking, cycling, or swimming to protect your joints. "
                "Start with 10-15 minute daily walks and build duration slowly. Adding 1-2 light bodyweight strength sessions per week "
                "(squats against a chair, wall pushups) will help preserve muscle. Keep it at a moderate intensity where you can hold a conversation."
            )
        else:
            return (
                f"Hi {username}. A balanced movement routine includes both cardiovascular conditioning and resistance training. "
                "Aim for a consistent daily step count (e.g., 8,000-10,000 steps) and 2-3 resistance training sessions per week. "
                "Always progress slowly: increase your walking time or weight load gradually to avoid injury."
            )
            
    elif "trend" in msg or "progress" in msg or "chart" in msg or "lost" in msg or "weight" in msg:
        if profile_data:
            checkins = profile_data.get("checkIns", [])
            completed = sum(1 for ch in checkins if ch.get("completed"))
            total = len(checkins)
            history = profile_data.get("history", [])
            
            summary = f"You have logged {completed} out of {total} checkpoints so far."
            if history:
                latest = history[0]
                summary += f" Your latest logged weight check is {latest.get('weightKg')} kg."
                if len(history) >= 2:
                    diff = history[0].get("weightKg", 0) - history[-1].get("weightKg", 0)
                    summary += f" Over your logged history, your weight has changed by {diff:.1f} kg."
            return (
                f"Here is your progress overview, {username}:\n"
                f"- {summary}\n"
                "- Keep updating your checkpoints and scale checks regularly.\n"
                "Remember, the weight trend is non-linear and normal daily fluctuations (due to hydration, salt, stress) are expected. "
                "Focus on the weekly average rather than any single daily number!"
            )
        else:
            return f"Hi {username}. Once you create a profile and log some check-ins, I will be able to analyze your weight trend and progress data right here."
            
    elif "safety" in msg or "unsafe" in msg or "sick" in msg or "dizzy" in msg or "hurt" in msg:
        return (
            "Safety is our absolute number one priority. If you are experiencing symptoms like persistent dizziness, fatigue, "
            "nausea, or muscle pain, please pause any calorie deficit or intense workouts immediately. "
            "Make sure you are drinking enough fluids and eating balanced meals. We strongly recommend seeking professional medical advice "
            "or consulting a clinical dietitian to ensure your plan is safe for your body."
        )

    # General fallback
    welcome_msg = f"Hello {username}! "
    if bmi:
        gender_str = f" {gender.lower()}" if gender and gender.lower() in ["male", "female", "non-binary"] else ""
        welcome_msg += f"Based on your calculated BMI of {bmi:.1f} ({bmi_band}) for a{gender_str} profile, "
    if health_conditions:
        welcome_msg += f"considering your health conditions ({health_conditions}), "
    welcome_msg += "I am here to guide you with safety-first advice on nutrition, exercise, sleep, and recovery. "
    welcome_msg += "Ask me anything about your weight goals, meal plans, or how to stay safe during your tracking window."
    return welcome_msg

@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket, token: str | None = Query(None)):
    await websocket.accept()
    
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
        
    db_path = _db_path()
    user = safewell_db.get_user_by_token(db_path, token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    username = user.get("name", "User")
    user_id = int(user["id"])
    
    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                data = json.loads(data_str)
                user_message = data.get("message", "").strip()
                profile_id_str = data.get("profileId")
            except Exception:
                await websocket.send_text(json.dumps({"type": "error", "content": "Invalid JSON format"}))
                continue
                
            if not user_message:
                continue

            # Load latest profile snapshot if profile_id provided
            profile_data = None
            if profile_id_str:
                try:
                    profile_id = int(profile_id_str)
                    profile_data = safewell_db.get_profile(db_path, user_id, profile_id)
                except Exception:
                    pass
            
            # If no active profile, try to load their first profile
            if not profile_data:
                profiles = safewell_db.list_profiles(db_path, user_id)
                if profiles:
                    profile_data = safewell_db.get_profile(db_path, user_id, int(profiles[0]["id"]))
            
            api_key = os.environ.get("GEMINI_API_KEY")
            
            if api_key:
                # Call Gemini
                try:
                    genai.configure(api_key=api_key)
                    model = genai.GenerativeModel(
                        "gemini-2.5-flash",
                        system_instruction=(
                            "You are the SafeWell AI Health Coach, a friendly, supportive, and safety-conscious expert. "
                            "You help the user stay safe and healthy while tracking their weight and checkpoints. "
                            "Always prioritize physical and mental safety. "
                            "Incorporate their gender, age, height, weight, and especially any listed health conditions/diseases to give highly personalized, safety-first recommendations (such as nutritional needs, activity limitations, safety precautions, or hydration suggestions) suitable for their body. "
                            "If the user has medical conditions (e.g. heart issues, diabetes, hypertension, asthma), NEVER recommend activities, supplements, or foods that might be injurious or dangerous (e.g. high impact or high-sodium for cardiovascular conditions). Always prompt them to prioritize their doctor's instructions. "
                            "If the user is underweight (BMI < 18.5) and trying to lose weight, tell them it is unsafe and recommend they stop losing weight. "
                            "If they report dizziness, fatigue, or illness, advise them to stop dieting/exercising and see a healthcare provider. "
                            "Be concise, and focus on practical habits (sleep, hydration, protein, walking)."
                        )
                    )
                    
                    # Context assembly
                    context_str = f"User name: {username}\n"
                    if user.get("gender"):
                        context_str += f"Gender: {user.get('gender')}\n"
                    if user.get("age_years"):
                        context_str += f"Age: {user.get('age_years')} years\n"
                    health_conds = user.get("health_conditions") or user.get("healthConditions")
                    if health_conds:
                        context_str += f"User Health Conditions/Diseases: {health_conds}\n"
                        
                    if profile_data:
                        profile = profile_data.get("profile", {})
                        context_str += f"Active Plan: {profile.get('name')}\n"
                        context_str += f"Height: {profile.get('heightCm')} cm\n"
                        context_str += f"Starting Weight: {profile.get('currentWeightKg')} kg\n"
                        context_str += f"Goal Weight: {profile.get('goalWeightKg')} kg (Mode: {profile.get('planMode')}, Duration: {profile.get('durationDays')} days)\n"
                        
                        history = profile_data.get("history", [])
                        if history:
                            context_str += f"Latest weight reading: {history[0].get('weightKg')} kg\n"
                            
                        checkins = profile_data.get("checkIns", [])
                        completed = sum(1 for ch in checkins if ch.get("completed"))
                        context_str += f"Checkpoints Completed: {completed} out of {len(checkins)}\n"
                        
                    # Request stream from Gemini
                    prompt = f"Context:\n{context_str}\n\nUser Message: {user_message}\n\nResponse:"
                    response = model.generate_content(prompt, stream=True)
                    
                    for chunk in response:
                        await websocket.send_text(json.dumps({
                            "type": "token",
                            "content": chunk.text
                        }))
                        await asyncio.sleep(0.01)
                        
                    await websocket.send_text(json.dumps({"type": "done"}))
                    continue
                    
                except Exception as e:
                    print(f"Gemini API chat failed: {e}. Falling back to local responder.")
                    # Fall through to local fallback
                    
            # Local fallback responder (streams characters/words to simulate typing)
            fallback_text = _get_local_fallback_response(user, profile_data, user_message)
            
            # Stream the fallback text to simulate AI streaming
            words = fallback_text.split(" ")
            for i in range(0, len(words), 2):
                chunk = " ".join(words[i:i+2]) + " "
                await websocket.send_text(json.dumps({
                    "type": "token",
                    "content": chunk
                }))
                await asyncio.sleep(0.04) # simulated delay
                
            await websocket.send_text(json.dumps({"type": "done"}))
            
    except WebSocketDisconnect:
        print(f"User {username} disconnected from chat WebSocket.")
    except Exception as e:
        print(f"WebSocket error: {e}")
