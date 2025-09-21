// pages/index.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import * as Constants from "../utils/constants";
import {
  RecordRow,
  Profile,
  TeamBonus,
  memberPoints,
  computeTeam,
  computeTeamAcrossWeeks,
  TeamName,
} from "../utils/points";
import { SITE_NAME } from "../utils/constants";

/* ------------------------- Config & helpers ------------------------- */

// Weeks (1..24) fallback
const WEEKS_SAFE = Constants?.WEEKS ?? Array.from({ length: 24 }, (_, i) => i + 1);
const POINTS_SAFE = Constants?.POINTS ?? {
  perKm: 10,
  per1000Calories: 100,
  perWorkout: 20,
  perHealthyMeal: 20,
  bonusAllMinWorkouts: 200,
};

// Admin toggle reasons
const HABITS_REASON = "Healthy Habits Bonus /week";
const EXERCISE_REASON = "Full Team Participation in an exercise";

// Exact dates for each week (your list)
const WEEK_DATES: Record<number, string> = {
  1: "20/7/25",
  2: "27/7/25",
  3: "3/8/25",
  4: "10/8/25",
  5: "17/8/25",
  6: "24/8/25",
  7: "31/8/25",
  8: "7/9/25",
  9: "14/9/25",
  10: "21/9/25",
  11: "28/9/25",
  12: "5/10/25",
  13: "12/10/25",
  14: "19/10/25",
  15: "26/10/25",
  16: "2/11/25",
  17: "9/11/25",
  18: "16/11/25",
  19: "23/11/25",
  20: "30/11/25",
  21: "7/12/25",
  22: "14/12/25",
  23: "21/12/25",
  24: "28/12/25",
};
const weekLabel = (w: number) => `Week ${w} - ${WEEK_DATES[w] ?? ""}`;

// 2-decimal formatter
const fmt2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");

// Parse magic-link tokens from URL hash (client only)
function parseHashTokens(): { access_token?: string; refresh_token?: string; type?: string } {
  if (typeof window === "undefined") return {};
  const h = window.location.hash || "";
  if (!h.includes("access_token")) return {};
  const p = new URLSearchParams(h.replace(/^#/, ""));
  return {
    access_token: p.get("access_token") || undefined,
    refresh_token: p.get("refresh_token") || undefined,
    type: p.get("type") || undefined,
  };
}

/* ----------------------- Small presentational UI ----------------------- */

function Field({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        className="input"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function MembersTable({ rows }: { rows: RecordRow[] }) {
  if (!rows?.length)
    return <p className="text-sm text-gray-600">No entries yet for this week.</p>;
  const ordered = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600">
            <th className="py-2 pr-4">Member</th>
            <th className="py-2 pr-4">KM</th>
            <th className="py-2 pr-4">Calories</th>
            <th className="py-2 pr-4">Workouts</th>
            <th className="py-2 pr-4">Meals</th>
            <th className="py-2 pr-4">Pts</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((r) => (
            <tr key={`${r.user_id}-${r.week}`} className="border-t border-gray-100">
              <td className="py-2 pr-4 font-medium">{r.name}</td>
              <td className="py-2 pr-4">{fmt2(Number(r.km || 0))}</td>
              <td className="py-2 pr-4">{fmt2(Number(r.calories || 0))}</td>
              <td className="py-2 pr-4">{r.workouts}</td>
              <td className="py-2 pr-4">{r.meals}</td>
              <td className="py-2 pr-4">{fmt2(memberPoints(r))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: 0 | 1;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm">{label}</div>
      <div className="flex items-center gap-2">
        <button className="btn btn-compact" onClick={onMinus} disabled={value <= 0} title="Decrease to 0">
          −
        </button>
        <span className="w-8 text-center font-semibold">{value}</span>
        <button className="btn btn-compact" onClick={onPlus} disabled={value >= 1} title="Increase to 1">
          +
        </button>
      </div>
    </div>
  );
}

/* ----------------- Season Panel with per-person totals ----------------- */

type SeasonData = {
  totals: { km: number; calories: number; workouts: number; meals: number; basePoints: number };
  bonuses: { weeksAll2Count: number; manualSum: number };
  totalPoints: number;
};

type SeasonMemberRow = {
  user_id: string;
  name: string;
  km: number;
  calories: number;
  workouts: number;
  meals: number;
  points: number; // base points across all weeks
};

function aggregateSeasonMembers(rows: RecordRow[]): SeasonMemberRow[] {
  const map = new Map<string, SeasonMemberRow>();
  for (const r of rows) {
    const key = r.user_id;
    const cur = map.get(key) || {
      user_id: r.user_id,
      name: r.name,
      km: 0,
      calories: 0,
      workouts: 0,
      meals: 0,
      points: 0,
    };
    cur.km += Number(r.km) || 0;
    cur.calories += Number(r.calories) || 0;
    cur.workouts += Number(r.workouts) || 0;
    cur.meals += Number(r.meals) || 0;
    cur.points += memberPoints(r); // sum of base points across weeks
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function SeasonMembersTable({ rowsAllWeeks }: { rowsAllWeeks: RecordRow[] }) {
  const data = useMemo(() => aggregateSeasonMembers(rowsAllWeeks), [rowsAllWeeks]);
  if (!data.length) return <p className="text-sm text-gray-600">No entries yet this season.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600">
            <th className="py-2 pr-4">Member</th>
            <th className="py-2 pr-4">KM (Total)</th>
            <th className="py-2 pr-4">Calories (Total)</th>
            <th className="py-2 pr-4">Workouts (Total)</th>
            <th className="py-2 pr-4">Meals (Total)</th>
            <th className="py-2 pr-4">Pts (Total)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.user_id} className="border-t border-gray-100">
              <td className="py-2 pr-4 font-medium">{r.name}</td>
              <td className="py-2 pr-4">{fmt2(r.km)}</td>
              <td className="py-2 pr-4">{fmt2(r.calories)}</td>
              <td className="py-2 pr-4">{r.workouts}</td>
              <td className="py-2 pr-4">{r.meals}</td>
              <td className="py-2 pr-4">{fmt2(r.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonPanelWithMembers({
  title,
  seasonData,
  rowsAllWeeks,
}: {
  title: string;
  seasonData: SeasonData;
  rowsAllWeeks: RecordRow[];
}) {
  const { totals, totalPoints } = seasonData;
  return (
    <div className="card">
      <div className="text-lg font-semibold mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="KM Walked/Run (Total)" value={fmt2(totals.km)} />
        <Stat label="Calories Burned (Total)" value={fmt2(totals.calories)} />
        <Stat label="Number of Workouts" value={String(totals.workouts)} />
        <Stat label="Number of Healthy Meals" value={String(totals.meals)} />
      </div>
      <div className="card mb-4">
        <div className="text-sm text-gray-700">Total team points</div>
        <div className="mt-1 text-3xl font-bold">{fmt2(totalPoints)}</div>
      </div>
      <SeasonMembersTable rowsAllWeeks={rowsAllWeeks} />
    </div>
  );
}

/* ---------------------- Weekly Team panel ---------------------- */

function TeamPanel({
  title,
  week,
  totals,
  totalPoints,
  rows,
  isAdmin,
  habitsActive,
  exerciseActive,
  showAll2,
  onSetHabits,
  onSetExercise,
}: {
  title: string;
  week: number | null;
  totals: {
    km: number;
    calories: number;
    workouts: number;
    meals: number;
    basePoints: number;
  };
  totalPoints: number;
  rows: RecordRow[];
  isAdmin: boolean;
  habitsActive: boolean;
  exerciseActive: boolean;
  showAll2: boolean;
  onSetHabits: (desired: 0 | 1) => void;
  onSetExercise: (desired: 0 | 1) => void;
}) {
  const anyWeeklyBonus = showAll2 || habitsActive || exerciseActive;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {title} {week ? `(Week ${week} - ${WEEK_DATES[week] || ""})` : ""}
        </h2>
      </div>

      {!week ? (
        <p className="text-sm text-gray-600">Pick a week.</p>
      ) : (
        <>
          {isAdmin && (
            <div className="card mb-4">
              <div className="text-sm font-medium mb-2">Admin bonuses (0–1 each)</div>
              <div className="grid grid-cols-1 gap-3">
                <ToggleRow
                  label="Healthy Habits Bonus /week (+200)"
                  value={habitsActive ? 1 : 0}
                  onMinus={() => onSetHabits(0)}
                  onPlus={() => onSetHabits(1)}
                />
                <ToggleRow
                  label="Full Team Participation in an exercise (+200)"
                  value={exerciseActive ? 1 : 0}
                  onMinus={() => onSetExercise(0)}
                  onPlus={() => onSetExercise(1)}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat label="Total KM" value={fmt2(totals.km)} />
            <Stat label="Total Calories" value={fmt2(totals.calories)} />
            <Stat label="Total Workouts" value={String(totals.workouts)} />
            <Stat label="Total Healthy Meals" value={String(totals.meals)} />
          </div>

          {anyWeeklyBonus && (
            <div className="card mb-4">
              <div className="text-sm font-medium mb-2">Weekly Bonuses</div>
              <div className="flex flex-wrap gap-2">
                {showAll2 && (
                  <span className="badge badge-yes">
                    ✓ All members completed ≥ 2 workouts +{POINTS_SAFE.bonusAllMinWorkouts}
                  </span>
                )}
                {habitsActive && <span className="badge badge-yes">✓ Healthy Habits Bonus +200</span>}
                {exerciseActive && (
                  <span className="badge badge-yes">✓ Full Team Participation in an exercise +200</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="card">
              <div className="text-sm text-gray-700">Total Team Points This Week</div>
              <div className="mt-1 text-3xl font-bold">{fmt2(totalPoints)}</div>
            </div>
          </div>

          <MembersTable rows={rows} />
        </>
      )}
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

export default function Home() {
  const router = useRouter();

  // Auth/session
  const [userId, setUserId] = useState<string>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // UI
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  // My record
  const [myRecord, setMyRecord] = useState<RecordRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Rosters
  const [arthurRoster, setArthurRoster] = useState<Profile[]>([]);
  const [jimmyRoster, setJimmyRoster] = useState<Profile[]>([]);

  // Weekly data
  const [arthurRows, setArthurRows] = useState<RecordRow[]>([]);
  const [jimmyRows, setJimmyRows] = useState<RecordRow[]>([]);
  const [arthurBonuses, setArthurBonuses] = useState<TeamBonus[]>([]);
  const [jimmyBonuses, setJimmyBonuses] = useState<TeamBonus[]>([]);

  // All-weeks data
  const [arthurAllRows, setArthurAllRows] = useState<RecordRow[]>([]);
  const [jimmyAllRows, setJimmyAllRows] = useState<RecordRow[]>([]);
  const [arthurAllBonuses, setArthurAllBonuses] = useState<TeamBonus[]>([]);
  const [jimmyAllBonuses, setJimmyAllBonuses] = useState<TeamBonus[]>([]);

  // Keep ?week in URL shareable
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.week;
    const w = Number(Array.isArray(q) ? q[0] : q);
    if (!Number.isNaN(w) && w >= 1 && w <= 24) {
      setWeek(w);
    }
  }, [router.isReady, router.query.week]);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.week;
    const current = q ? Number(Array.isArray(q) ? q[0] : q) : null;
    if (week && current !== week) {
      router.replace({ pathname: router.pathname, query: { ...router.query, week } }, undefined, {
        shallow: true,
      });
    }
    if (!week && q) {
      const { week: _omit, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [week, router]);

  // Session init (magic-link friendly: setSession from hash FIRST; no SSR redirect)
  useEffect(() => {
    (async () => {
      // 1) Recover from magic-link hash and set session (client only)
      const { access_token, refresh_token } = parseHashTokens();
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        // Clean the hash but keep query (?week=)
        const url = new URL(window.location.href);
        url.hash = "";
        window.history.replaceState({}, "", url.toString());
        if (error) console.error("setSession error", error);
      }

      // 2) Now check session normally
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) {
        const next =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/";
        return router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
      setUserId(uid);

      // Load profile
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      setProfile((prof as Profile) ?? null);
      setLoadingSession(false);
    })();

    const sub = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) {
        const next =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    });
    return () => sub.data.subscription.unsubscribe();
  }, [router]);

  // Load roster
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*");
      const list = (data || []) as Profile[];
      setArthurRoster(list.filter((p) => p.team === "Arthur"));
      setJimmyRoster(list.filter((p) => p.team === "Jimmy"));
    })();
  }, []);

  // Load my record when week changes
  useEffect(() => {
    if (!userId || !profile || !week) return;
    (async () => {
      setError(undefined);
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .eq("user_id", userId)
        .eq("week", week)
        .maybeSingle();
      if (error) {
        setError(error.message);
        return;
      }
      if (!data) {
        setMyRecord({
          user_id: userId,
          name: profile.name,
          team: profile.team,
          week,
          km: 0,
          calories: 0,
          workouts: 0,
          meals: 0,
        });
      } else {
        setMyRecord(data as RecordRow);
      }
    })();
  }, [userId, profile, week]);

  // Fetch team data for selected week
  const fetchTeams = async (wk = week) => {
    if (!wk) return;
    const { data: recs } = await supabase.from("records").select("*").eq("week", wk);
    const list = (recs || []) as RecordRow[];
    setArthurRows(list.filter((r) => r.team === "Arthur"));
    setJimmyRows(list.filter((r) => r.team === "Jimmy"));

    const { data: bons } = await supabase.from("team_bonuses").select("*").eq("week", wk);
    const bonsList = (bons || []) as TeamBonus[];
    setArthurBonuses(bonsList.filter((b) => b.team === "Arthur"));
    setJimmyBonuses(bonsList.filter((b) => b.team === "Jimmy"));
  };
  useEffect(() => {
    fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  // Fetch ALL-WEEKS data
  async function refreshAllTotals() {
    const { data: recs } = await supabase.from("records").select("*");
    const list = (recs || []) as RecordRow[];
    setArthurAllRows(list.filter((r) => r.team === "Arthur"));
    setJimmyAllRows(list.filter((r) => r.team === "Jimmy"));

    const { data: bons } = await supabase.from("team_bonuses").select("*");
    const bList = (bons || []) as TeamBonus[];
    setArthurAllBonuses(bList.filter((b) => b.team === "Arthur"));
    setJimmyAllBonuses(bList.filter((b) => b.team === "Jimmy"));
  }
  useEffect(() => {
    refreshAllTotals();
  }, []);

  // Realtime listeners
  useEffect(() => {
    if (!week) return;
    const recCh = supabase
      .channel(`records-w${week}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "records", filter: `week=eq.${week}` },
        () => fetchTeams(week)
      )
      .subscribe();
    const bonCh = supabase
      .channel(`bonuses-w${week}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_bonuses", filter: `week=eq.${week}` },
        () => fetchTeams(week)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(recCh);
      supabase.removeChannel(bonCh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  useEffect(() => {
    const ch = supabase
      .channel("all-weeks")
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, refreshAllTotals)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bonuses" }, refreshAllTotals)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Points / aggregates
  const myPointsRaw = useMemo(() => (myRecord ? memberPoints(myRecord) : 0), [myRecord]);

  const arthurWeek = useMemo(
    () => computeTeam(arthurRoster, arthurRows, arthurBonuses),
    [arthurRows, arthurRoster, arthurBonuses]
  );
  const jimmyWeek = useMemo(
    () => computeTeam(jimmyRoster, jimmyRows, jimmyBonuses),
    [jimmyRows, jimmyRoster, jimmyBonuses]
  );

  const arthurAll = useMemo(
    () => computeTeamAcrossWeeks(arthurRoster, arthurAllRows, arthurAllBonuses),
    [arthurRoster, arthurAllRows, arthurAllBonuses]
  );
  const jimmyAll = useMemo(
    () => computeTeamAcrossWeeks(jimmyRoster, jimmyAllRows, jimmyAllBonuses),
    [jimmyRoster, jimmyAllRows, jimmyAllBonuses]
  );

  async function save() {
    if (!myRecord || !profile) return;
    setSaving(true);
    setError(undefined);
    const payload = {
      user_id: myRecord.user_id,
      name: profile.name,
      team: profile.team,
      week: myRecord.week,
      km: Number(myRecord.km) || 0,
      calories: Number(myRecord.calories) || 0,
      workouts: Number(myRecord.workouts) || 0,
      meals: Number(myRecord.meals) || 0,
    };
    const { data, error } = await supabase
      .from("records")
      .upsert([payload], { onConflict: "user_id,week" })
      .select()
      .maybeSingle();
    if (error) setError(error.message);
    else setMyRecord(data as RecordRow);
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    const next =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  // Admin toggles 0/1
  const isAdmin = profile?.role === "admin";
  const arthurHabits = arthurBonuses.some((b) => b.reason.startsWith(HABITS_REASON));
  const arthurExercise = arthurBonuses.some((b) => b.reason.startsWith(EXERCISE_REASON));
  const jimmyHabits = jimmyBonuses.some((b) => b.reason.startsWith(HABITS_REASON));
  const jimmyExercise = jimmyBonuses.some((b) => b.reason.startsWith(EXERCISE_REASON));

  async function setToggle(team: TeamName, reason: string, desired: 0 | 1) {
    if (!week || !isAdmin) return;
    const list = team === "Arthur" ? arthurBonuses : jimmyBonuses;
    const has = list.some((b) => b.reason.startsWith(reason));
    if (desired === 1 && !has) {
      const { error } = await supabase
        .from("team_bonuses")
        .insert({ team, week, points: 200, reason, created_by: userId });
      if (error) setError(error.message);
    } else if (desired === 0 && has) {
      const { error } = await supabase
        .from("team_bonuses")
        .delete()
        .eq("team", team)
        .eq("week", week)
        .like("reason", `${reason}%`);
      if (error) setError(error.message);
    }
    await fetchTeams(week);
  }

  if (loadingSession) {
    return (
      <>
        <Head>
          <title>{SITE_NAME}</title>
        </Head>
        <main className="min-h-screen grid place-items-center px-4">
          <div className="card text-sm text-gray-700">Loading your session…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{SITE_NAME}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">{SITE_NAME}</h1>
          {userId && (
            <button className="btn btn-primary btn-compact" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>

        {!profile ? (
          <div className="card max-w-lg">
            <h2 className="text-lg font-semibold mb-2">Complete your profile</h2>
            <Onboarding onDone={(p) => setProfile(p)} />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="card">
                <div className="text-xs text-gray-500">You are</div>
                <div className="text-lg font-semibold">{profile.name}</div>
                <div className="badge mt-2">
                  {profile.team === "Arthur" ? "Team Arthur" : "Team Jimmy"}
                </div>
                {isAdmin && <div className="badge badge-yes ml-2">Admin</div>}
              </div>
              <div className="card">
                <label className="label">Week (1–24)</label>
                <select
                  className="input"
                  value={week ?? ""}
                  onChange={(e) => setWeek(Number(e.target.value) || null)}
                >
                  <option value="">Select…</option>
                  {WEEKS_SAFE.map((w) => (
                    <option key={w} value={w}>
                      {weekLabel(w)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="card">
                <div className="text-sm font-medium">Scoring</div>
                <div className="text-xs text-gray-600 mt-1 space-y-1">
                  <div>Every 1 km logged 10 pts</div>
                  <div>Every 1,000 calories burned 100 pts</div>
                  <div>Number of workout 20 pts</div>
                  <div>No of healthy meal 20 pts</div>
                  <div>All members complete ≥ 2 workouts/week 200 pts</div>
                  <div className="pt-1 border-t border-gray-100" />
                  <div>Healthy Habits Bonus /week 200 pts</div>
                  <div>Full Team Participation in an exercise 200 pts</div>
                </div>
              </div>
            </div>

            {/* My editor */}
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Your Weekly Entry</h2>
                {!week && <span className="text-xs text-gray-500">Pick a week</span>}
              </div>

              {!week ? null : !myRecord ? (
                <p className="text-sm text-gray-600">Preparing your entry…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field
                      label="KM walked/run"
                      value={myRecord.km}
                      step={0.01}
                      onChange={(v) => setMyRecord((r) => r && { ...r, km: v })}
                    />
                    <Field
                      label="Calories burned"
                      value={myRecord.calories}
                      step={0.01}
                      onChange={(v) => setMyRecord((r) => r && { ...r, calories: v })}
                    />
                    <Field
                      label="Workouts"
                      value={myRecord.workouts}
                      step={1}
                      onChange={(v) => setMyRecord((r) => r && { ...r, workouts: v })}
                    />
                    <Field
                      label="Healthy meals"
                      value={myRecord.meals}
                      step={1}
                      onChange={(v) => setMyRecord((r) => r && { ...r, meals: v })}
                    />
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">
                      Your points this week: <span className="font-semibold">{fmt2(myPointsRaw)}</span>
                    </div>
                    <button className="btn btn-primary btn-compact mt-3 w-full md:w-auto" onClick={save} disabled={saving}>
                      {saving ? "Saving…" : "Save / Update"}
                    </button>
                  </div>
                </>
              )}
              {error && <p className="mt-3 text-sm text-red-600">Error: {error}</p>}
            </div>

            {/* Team panels (selected week) with admin toggles and weekly bonuses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TeamPanel
                title="Team Arthur"
                week={week}
                totals={arthurWeek.totals}
                totalPoints={arthurWeek.totalPoints}
                rows={arthurRows}
                isAdmin={isAdmin}
                habitsActive={arthurHabits}
                exerciseActive={arthurExercise}
                showAll2={arthurWeek.bonuses.everyHas2Workouts}
                onSetHabits={(desired) => setToggle("Arthur", HABITS_REASON, desired)}
                onSetExercise={(desired) => setToggle("Arthur", EXERCISE_REASON, desired)}
              />
              <TeamPanel
                title="Team Jimmy"
                week={week}
                totals={jimmyWeek.totals}
                totalPoints={jimmyWeek.totalPoints}
                rows={jimmyRows}
                isAdmin={isAdmin}
                habitsActive={jimmyHabits}
                exerciseActive={jimmyExercise}
                showAll2={jimmyWeek.bonuses.everyHas2Workouts}
                onSetHabits={(desired) => setToggle("Jimmy", HABITS_REASON, desired)}
                onSetExercise={(desired) => setToggle("Jimmy", EXERCISE_REASON, desired)}
              />
            </div>

            {/* Season Totals (All Weeks) WITH per-person table */}
            <div className="card mb-6">
              <h2 className="text-lg font-semibold mb-3">Season Total (All Weeks)</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SeasonPanelWithMembers
                  title="Team Arthur"
                  seasonData={arthurAll}
                  rowsAllWeeks={arthurAllRows}
                />
                <SeasonPanelWithMembers
                  title="Team Jimmy"
                  seasonData={jimmyAll}
                  rowsAllWeeks={jimmyAllRows}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Onboarding({ onDone }:{ onDone:(p:any)=>void }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState<"Arthur"|"Jimmy">("Arthur");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined); setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) { setError("Not signed in."); return; }

      // enforce lowercase username (optional)
      const handle = username.trim().toLowerCase();

      const { data, error: insErr } = await supabase
        .from("profiles")
        .insert({ id: uid, name, team, username: handle })
        .select("*")
        .single();

      if (insErr) {
        // unique violations for name or username
        if (/(duplicate|unique)/i.test(insErr.message)) {
          setError("Display name or username already taken. Please choose a different one.");
          return;
        }
        // If row exists, try updating missing fields (e.g., adding username)
        const { data: existing } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
        if (!existing) { setError(insErr.message || "Could not save profile."); return; }

        const patch: any = {};
        if (!existing.name) patch.name = name;
        if (!existing.username && handle) patch.username = handle;
        if (existing.team !== team) patch.team = team;

        if (Object.keys(patch).length) {
          const { data: updated, error: upErr } = await supabase.from("profiles").update(patch).eq("id", uid).select("*").single();
          if (upErr) { setError(upErr.message); return; }
          onDone(updated); return;
        }
        onDone(existing); return;
      }
      onDone(data);
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3">
      <div>
        <label className="label">Display name</label>
        <input className="input" required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
      </div>
      <div>
        <label className="label">Username</label>
        <input className="input" required value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="yourhandle" />
        <p className="text-xs text-gray-500 mt-1">Lowercase letters/numbers recommended. Must be unique.</p>
      </div>
      <div>
        <label className="label">Team</label>
        <select className="input" value={team} onChange={(e)=>setTeam(e.target.value as "Arthur"|"Jimmy")}>
          <option value="Arthur">Team Arthur</option>
          <option value="Jimmy">Team Jimmy</option>
        </select>
      </div>
      <button className="btn btn-primary btn-compact" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save profile"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

