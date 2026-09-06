import unittest
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine import (
    calculate_bmr_mifflin_st_jeor,
    calculate_calorie_delta,
    calculate_metabolic_profile,
    analyze_user_progress
)


class TestMetabolicCalculations(unittest.TestCase):
    def test_mifflin_st_jeor_male(self):
        # Male, 80kg, 175cm, 28 years
        # BMR = 10*80 + 6.25*175 - 5*28 + 5 = 800 + 1093.75 - 140 + 5 = 1758.75
        bmr = calculate_bmr_mifflin_st_jeor(weight_kg=80.0, height_cm=175.0, age_years=28, gender="Male")
        self.assertEqual(bmr, 1758.75)

    def test_mifflin_st_jeor_female(self):
        # Female, 65kg, 165cm, 30 years
        # BMR = 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25
        bmr = calculate_bmr_mifflin_st_jeor(weight_kg=65.0, height_cm=165.0, age_years=30, gender="Female")
        self.assertEqual(bmr, 1370.25)

    def test_calculate_calorie_delta_87kg_to_84kg_30days(self):
        # 87kg to 84kg in 30 days => 3kg loss in 4.285 weeks => 0.7 kg/week
        # 1% bodyweight limit = 0.87 kg/week. Required is 0.7 kg/week <= 0.87 kg/week.
        # Safe daily deficit = (0.7 * 7700) / 7 = 770 kcal/day => calorie_delta = -770
        res = calculate_calorie_delta(weight_kg=87.0, goal_weight_kg=84.0, duration_days=30)
        self.assertEqual(res["calorie_delta"], -770)
        self.assertFalse(res["was_capped"])
        self.assertEqual(res["actual_days_needed"], 30)

    def test_calculate_calorie_delta_aggressive_capped(self):
        # 70kg user attempting to lose 10kg in 14 days (extreme 5kg/week demand)
        # 1% bodyweight limit = 0.7 kg/week => max daily deficit = 770 kcal
        res = calculate_calorie_delta(weight_kg=70.0, goal_weight_kg=60.0, duration_days=14)
        self.assertEqual(res["calorie_delta"], -770)
        self.assertTrue(res["was_capped"])
        self.assertEqual(res["actual_days_needed"], 100)

    def test_calculate_calorie_delta_weight_gain(self):
        # 70kg user attempting to gain 4kg in 30 days (0.93 kg/week demand)
        # 0.5% bodyweight ceiling = 0.35 kg/week => safe daily surplus = (0.35 * 7700) / 7 = +385 kcal/day
        res = calculate_calorie_delta(weight_kg=70.0, goal_weight_kg=74.0, duration_days=30)
        self.assertEqual(res["calorie_delta"], 385)
        self.assertTrue(res["was_capped"])
        self.assertEqual(res["actual_days_needed"], 80)

    def test_metabolic_profile_weight_loss_safe_deficit(self):
        profile = calculate_metabolic_profile(
            weight_kg=80.0,
            height_cm=175.0,
            age_years=28,
            gender="Male",
            goal_weight_kg=75.0,
            duration_days=30
        )
        self.assertEqual(profile.mode, "loss")
        self.assertTrue(-1000 <= profile.calorie_delta <= 0)
        self.assertGreaterEqual(profile.target_calories, 1500)
        self.assertGreater(profile.protein_g, 0)
        self.assertGreater(profile.carbs_g, 0)
        self.assertGreater(profile.fat_g, 0)

    def test_underweight_boundary_clamping(self):
        # Underweight user (BMI < 18.5): 45kg at 170cm => BMI = 15.57
        # Target weight for BMI 18.5 is 18.5 * (1.7^2) = 53.47 kg
        profile = calculate_metabolic_profile(
            weight_kg=45.0,
            height_cm=170.0,
            age_years=25,
            gender="Female",
            goal_weight_kg=40.0,
            duration_days=30
        )
        self.assertTrue(profile.is_underweight)
        self.assertEqual(profile.mode, "gain")
        self.assertGreater(profile.calorie_delta, 0)  # Weight gain surplus active
        self.assertEqual(profile.target_calories, round(profile.tdee + profile.calorie_delta))
        self.assertTrue(any("Underweight safety floor active" in note for note in profile.notes))

    def test_youth_boundary_clamping(self):
        # Minor (age 16) attempting weight loss
        profile = calculate_metabolic_profile(
            weight_kg=70.0,
            height_cm=175.0,
            age_years=16,
            gender="Male",
            goal_weight_kg=65.0,
            duration_days=30
        )
        self.assertEqual(profile.calorie_delta, 0)  # Deficit prohibited for youth under 18
        self.assertTrue(any("Youth growth safety floor active" in note for note in profile.notes))


class TestTrajectoryAnalysis(unittest.TestCase):
    def setUp(self):
        self.user = {
            "id": 1,
            "name": "Test User",
            "age_years": 30,
            "gender": "Male",
            "height_cm": 175.0,
            "current_weight_kg": 80.0,
            "goal_weight_kg": 74.0,
            "duration_days": 30,
            "created_at": "2026-09-01T00:00:00"
        }

    def test_trajectory_on_track(self):
        # Baseline start: 80.0kg. On Day 15 (halfway), target expected is 77.0kg. Logged 77.2kg => On Track
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Start"},
            {"id": 2, "logged_date": "2026-09-16", "weight": 77.2, "note": "Halfway check-in"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        self.assertEqual(len(checkins), 2)
        halfway_entry = checkins[1]
        self.assertEqual(halfway_entry["status"], "on_track")

    def test_trajectory_losing_too_fast(self):
        # Logged 70.0kg on Day 5 (losing 10kg in 5 days is way below the max safe rate) => losing_too_fast
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Start"},
            {"id": 2, "logged_date": "2026-09-06", "weight": 70.0, "note": "Crash diet"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        entry = checkins[1]
        self.assertEqual(entry["status"], "losing_too_fast")

    def test_trajectory_behind_target(self):
        # Logged 81.0kg on Day 20 (gained weight instead of losing) => behind_target
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Start"},
            {"id": 2, "logged_date": "2026-09-21", "weight": 81.0, "note": "Stagnant"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        entry = checkins[1]
        self.assertEqual(entry["status"], "behind_target")

    def test_same_day_unsafe_drop(self):
        # Logged 80.0kg and 76.0kg on the same day (2026-09-01) => 4.0kg drop in 0 days => losing_too_fast
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Morning"},
            {"id": 2, "logged_date": "2026-09-01", "weight": 76.0, "note": "Evening"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        self.assertEqual(len(checkins), 2)
        entry = checkins[1]
        self.assertEqual(entry["days_since_last"], 0)
        self.assertEqual(entry["weight_change_from_last"], -4.0)
        self.assertEqual(entry["status"], "losing_too_fast")
        self.assertIn("Same-Day Drop", entry["status_message"])

    def test_next_day_unsafe_drop(self):
        # Logged 80.0kg on Day 1, 75.0kg on Day 2 (5.0kg drop in 1 day) => losing_too_fast
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Day 1"},
            {"id": 2, "logged_date": "2026-09-02", "weight": 75.0, "note": "Day 2"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        entry = checkins[1]
        self.assertEqual(entry["days_since_last"], 1)
        self.assertEqual(entry["weight_change_from_last"], -5.0)
        self.assertEqual(entry["status"], "losing_too_fast")
        self.assertIn("1 day", entry["status_message"])

    def test_next_day_safe_transition(self):
        # Logged 80.0kg on Day 1, 79.8kg on Day 2 (0.2kg drop in 1 day) => on_track
        rows = [
            {"id": 1, "logged_date": "2026-09-01", "weight": 80.0, "note": "Day 1"},
            {"id": 2, "logged_date": "2026-09-02", "weight": 79.8, "note": "Day 2"}
        ]
        checkins, summary = analyze_user_progress(self.user, rows)
        entry = checkins[1]
        self.assertEqual(entry["days_since_last"], 1)
        self.assertEqual(entry["weight_change_from_last"], -0.2)
        self.assertEqual(entry["status"], "on_track")


if __name__ == "__main__":
    unittest.main()
