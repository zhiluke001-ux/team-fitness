// utils/points.ts
export type TeamName = "Arthur" | "Jimmy";

export interface RecordRow {
  user_id: string;
  name: string;
  team: TeamName;
  week: number;
  km: number;
  calories: number;
  workouts: number;
  meals: number;
}

export interface Profile {
  id: string;
  name: string;
  team: TeamName;
  role?: "admin" | "member";
  username?: string | null; 
  email?: string | null;  
}

export interface TeamBonus {
  id?: number;
  team: TeamName;
  week: number;
  points: number; // 200 each
  reason: string; // e.g., "Healthy Habits Bonus /week"
  created_by?: string;
}

export const DEFAULT_POINTS = {
  perKm: 10,
  per1000Calories: 100,
  perWorkout: 20,
  perHealthyMeal: 20,
  bonusAllMinWorkouts: 200,
};

export function memberPoints(
  r: RecordRow,
  P = DEFAULT_POINTS
): number {
  const fromKm = (Number(r.km) || 0) * P.perKm;
  const fromCalories = ((Number(r.calories) || 0) / 1000) * P.per1000Calories;
  const fromWorkouts = (Number(r.workouts) || 0) * P.perWorkout;
  const fromMeals = (Number(r.meals) || 0) * P.perHealthyMeal;
  return fromKm + fromCalories + fromWorkouts + fromMeals; // precise float
}

function sum<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + (Number(pick(x)) || 0), 0);
}

export function computeTeam(
  roster: Profile[],
  rows: RecordRow[],
  bonuses: TeamBonus[],
  P = DEFAULT_POINTS
) {
  const totals = {
    km: sum(rows, r => r.km),
    calories: sum(rows, r => r.calories),
    workouts: sum(rows, r => r.workouts),
    meals: sum(rows, r => r.meals),
    basePoints: sum(rows, r => memberPoints(r, P)),
  };

  // Everyone >= 2 workouts this week?
  const byUserId = new Map(rows.map(r => [r.user_id, r]));
  const everyHas2Workouts =
    roster.length > 0 &&
    roster.every(p => (byUserId.get(p.id)?.workouts || 0) >= 2);

  const manualSum = sum(bonuses, b => b.points);
  const totalPoints =
    totals.basePoints +
    (everyHas2Workouts ? P.bonusAllMinWorkouts : 0) +
    manualSum;

  return {
    totals,
    bonuses: { everyHas2Workouts, manualSum },
    totalPoints,
  };
}

export function computeTeamAcrossWeeks(
  roster: Profile[],
  rowsAllWeeks: RecordRow[],
  bonusesAllWeeks: TeamBonus[],
  P = DEFAULT_POINTS
) {
  const totals = {
    km: sum(rowsAllWeeks, r => r.km),
    calories: sum(rowsAllWeeks, r => r.calories),
    workouts: sum(rowsAllWeeks, r => r.workouts),
    meals: sum(rowsAllWeeks, r => r.meals),
    basePoints: sum(rowsAllWeeks, r => memberPoints(r, P)),
  };

  // Count weeks where everyone has >=2 workouts
  const weeks = [...new Set(rowsAllWeeks.map(r => r.week))].sort((a, b) => a - b);
  const rowsByWeek = new Map<number, RecordRow[]>();
  weeks.forEach(w => rowsByWeek.set(w, rowsAllWeeks.filter(r => r.week === w)));
  let weeksAll2Count = 0;
  for (const w of weeks) {
    const rows = rowsByWeek.get(w) || [];
    const byUserId = new Map(rows.map(r => [r.user_id, r]));
    const ok =
      roster.length > 0 &&
      roster.every(p => (byUserId.get(p.id)?.workouts || 0) >= 2);
    if (ok) weeksAll2Count++;
  }

  const manualSum = sum(bonusesAllWeeks, b => b.points);
  const totalPoints =
    totals.basePoints +
    weeksAll2Count * P.bonusAllMinWorkouts +
    manualSum;

  return {
    totals,
    bonuses: { weeksAll2Count, manualSum },
    totalPoints,
  };
}
