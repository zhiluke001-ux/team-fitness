export const SITE_NAME = "ATAG Team Fitness Challenge 2025";
export const WEEKS = Array.from({ length: 24 }, (_, i) => i + 1);

export const POINTS = {
  perKm: 10,                    // Every 1 km logged → 10 pts
  per1000Calories: 100,         // Every 1,000 calories burned → 100 pts
  perWorkout: 20,               // Each workout → 20 pts
  perHealthyMeal: 20,           // Each healthy meal → 20 pts
  bonusAllMinWorkouts: 200      // Auto team bonus: all members ≥2 workouts/week

  // - Healthy Habits (team-wide complete) +200
  // - Full Team Participation in an exercise +200
  // These are inserted via /admin (team_bonuses table) and summed separately.
};
