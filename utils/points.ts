import { POINTS } from "./constants";

export type Team = "Arthur" | "Jimmy";

export type Profile = {
  id: string;
  name: string;
  team: Team;
  role?: "admin" | "member";
};

export type RecordRow = {
  user_id: string;
  name: string;
  team: Team;
  week: number;
  km: number;
  calories: number;
  workouts: number;
  meals: number;
  inserted_at?: string;
  updated_at?: string;
};

export type TeamBonus = { id: string; team: Team; week: number; points: number; reason: string };

export function memberPoints(r: Pick<RecordRow, "km" | "calories" | "workouts" | "meals">) {
  const kmPts = (Number(r.km) || 0) * POINTS.perKm;
  const calPts = ((Number(r.calories) || 0) / 1000) * POINTS.per1000Calories;
  const woPts = (Number(r.workouts) || 0) * POINTS.perWorkout;
  const mealPts = (Number(r.meals) || 0) * POINTS.perHealthyMeal;
  return kmPts + calPts + woPts + mealPts;
}

/**
 * Team total = basePoints + autoBonus(All ≥2 workouts) + manual bonuses sum
 * Manual bonuses = Arthur-approved items (e.g., Healthy Habits + Full Team Exercise)
 */
export function computeTeam(
  roster: Profile[],
  rows: RecordRow[],
  manualBonuses: TeamBonus[]
) {
  const byUser = new Map(rows.map(r => [r.user_id, r]));

  const totals = rows.reduce(
    (a, r) => {
      a.km += Number(r.km || 0);
      a.calories += Number(r.calories || 0);
      a.workouts += Number(r.workouts || 0);
      a.meals += Number(r.meals || 0);
      a.basePoints += memberPoints(r);
      return a;
    },
    { km: 0, calories: 0, workouts: 0, meals: 0, basePoints: 0 }
  );

  const everyHas2Workouts = roster.length > 0
    ? roster.every(p => (byUser.get(p.id)?.workouts ?? 0) >= 2)
    : false;

  const bonusAll2 = everyHas2Workouts ? POINTS.bonusAllMinWorkouts : 0;
  const manualSum = manualBonuses.reduce((s, b) => s + (b.points || 0), 0);

  return {
    totals,
    bonuses: {
      everyHas2Workouts,
      manualSum
    },
    totalPoints: totals.basePoints + bonusAll2 + manualSum
  };
}
