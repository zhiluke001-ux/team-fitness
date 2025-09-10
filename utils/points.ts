// utils/points.ts
import { POINTS, WEEKS } from "./constants";

export type TeamName = "Arthur" | "Jimmy";

export type Profile = {
  id: string;
  name: string;
  team: TeamName;
  role?: string | null;
};

export type RecordRow = {
  user_id: string;
  name: string;
  team: TeamName;
  week: number;
  km: number;
  calories: number;
  workouts: number;
  meals: number;
};

export type TeamBonus = {
  id?: string;
  team: TeamName;
  week: number;
  points: number;
  reason: string;
  created_at?: string;
};

export function memberPoints(row: RecordRow): number {
  const km = Number(row.km) || 0;
  const cal = Number(row.calories) || 0;
  const wo = Number(row.workouts) || 0;
  const meals = Number(row.meals) || 0;

  return (
    km * POINTS.perKm +
    (cal / 1000) * POINTS.per1000Calories +
    wo * POINTS.perWorkout +
    meals * POINTS.perHealthyMeal
  );
}

function sumBasePoints(rows: RecordRow[]): number {
  return rows.reduce((acc, r) => acc + memberPoints(r), 0);
}

/**
 * Compute totals for a single WEEK (rows are already filtered to that week & team).
 * Returns totals, bonus flags/sums, and totalPoints for that week.
 */
export function computeTeam(
  roster: Profile[],
  rows: RecordRow[],
  bonuses: TeamBonus[]
) {
  const totals = {
    km: rows.reduce((a, r) => a + (Number(r.km) || 0), 0),
    calories: rows.reduce((a, r) => a + (Number(r.calories) || 0), 0),
    workouts: rows.reduce((a, r) => a + (Number(r.workouts) || 0), 0),
    meals: rows.reduce((a, r) => a + (Number(r.meals) || 0), 0),
    basePoints: sumBasePoints(rows),
  };

  // All members completed >= 2 workouts (for THIS week)?
  const rosterIds = new Set(roster.map((p) => p.id));
  const byUser = new Map<string, RecordRow>();
  rows.forEach((r) => byUser.set(r.user_id, r));

  const everyHas2Workouts =
    roster.length > 0 &&
    Array.from(rosterIds).every(
      (uid) => (byUser.get(uid)?.workouts ?? 0) >= 2
    );

  const manualSum = bonuses.reduce((a, b) => a + (Number(b.points) || 0), 0);

  const totalPoints =
    totals.basePoints +
    (everyHas2Workouts ? POINTS.bonusAllMinWorkouts : 0) +
    manualSum;

  return {
    totals,
    bonuses: { everyHas2Workouts, manualSum },
    totalPoints,
  };
}

/**
 * Compute totals ACROSS ALL WEEKS for a team.
 * Counts how many weeks all members hit >= 2 workouts, sums manual bonuses across all weeks,
 * and returns overall totalPoints.
 */
export function computeTeamAcrossWeeks(
  roster: Profile[],
  rowsAllWeeks: RecordRow[],
  bonusesAllWeeks: TeamBonus[]
) {
  // Aggregate raw totals across every row
  const totals = {
    km: rowsAllWeeks.reduce((a, r) => a + (Number(r.km) || 0), 0),
    calories: rowsAllWeeks.reduce((a, r) => a + (Number(r.calories) || 0), 0),
    workouts: rowsAllWeeks.reduce((a, r) => a + (Number(r.workouts) || 0), 0),
    meals: rowsAllWeeks.reduce((a, r) => a + (Number(r.meals) || 0), 0),
    basePoints: sumBasePoints(rowsAllWeeks),
  };

  // Group rows by week
  const rowsByWeek = new Map<number, RecordRow[]>();
  for (const r of rowsAllWeeks) {
    const arr = rowsByWeek.get(r.week) || [];
    arr.push(r);
    rowsByWeek.set(r.week, arr);
  }

  // Count weeks where EVERY roster member has workouts >= 2
  const rosterIds = roster.map((p) => p.id);
  let weeksAll2Count = 0;

  if (rosterIds.length > 0) {
    for (const wk of WEEKS) {
      const weekRows = rowsByWeek.get(wk) || [];
      const byUser = new Map<string, RecordRow>();
      weekRows.forEach((r) => byUser.set(r.user_id, r));

      const ok = rosterIds.every(
        (uid) => (byUser.get(uid)?.workouts ?? 0) >= 2
      );
      if (ok) weeksAll2Count++;
    }
  }

  // Sum all admin-added bonuses across all weeks
  const manualSum = bonusesAllWeeks.reduce(
    (a, b) => a + (Number(b.points) || 0),
    0
  );

  const totalPoints =
    totals.basePoints + weeksAll2Count * POINTS.bonusAllMinWorkouts + manualSum;

  return {
    totals,
    bonuses: { weeksAll2Count, manualSum },
    totalPoints,
  };
}
