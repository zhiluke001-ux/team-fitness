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
  TeamName
} from "../utils/points";
import { SITE_NAME } from "../utils/constants";

// Fallbacks
const WEEKS_SAFE = Constants?.WEEKS ?? Array.from({ length: 24 }, (_, i) => i + 1);
const POINTS_SAFE = Constants?.POINTS ?? {
  perKm: 10, per1000Calories: 100, perWorkout: 20, perHealthyMeal: 20, bonusAllMinWorkouts: 200
};

// Toggle reasons
const HABITS_REASON = "Healthy Habits Bonus /week";
const EXERCISE_REASON = "Full Team Participation in an exercise";

/* ----------------------- Helper UI components ----------------------- */

function Field({ label, value, step = 0.1, onChange }:{
  label: string; value: number; step?: number; onChange: (v:number)=>void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" min={0} step={step} className="input" value={value} onChange={(e)=>onChange(Number(e.target.value))} />
    </div>
  );
}

function Stat({ label, value }:{ label:string; value:string }) {
  return (
    <div className="card">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function MembersTable({ rows }:{ rows: RecordRow[] }) {
  if (!rows?.length) return <p className="text-sm text-gray-600">No entries yet for this week.</p>;
  const ordered = [...rows].sort((a,b)=>a.name.localeCompare(b.name));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600">
            <th className="py-2 pr-4">Member</th>
            <th className="py-2 pr-4">KM</th>
            <th className="py-2 pr-4">Calories</th>
            <th className="py-2 pr-4">Workouts</th>
            <th className="py-2 pr-4">Healthy Meals</th>
            <th className="py-2 pr-4">Points</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(r=>(
            <tr key={`${r.user_id}-${r.week}`} className="border-t border-gray-100">
              <td className="py-2 pr-4 font-medium">{r.name}</td>
              <td className="py-2 pr-4">{Number(r.km||0).toFixed(1)}</td>
              <td className="py-2 pr-4">{Math.round(Number(r.calories||0))}</td>
              <td className="py-2 pr-4">{r.workouts}</td>
              <td className="py-2 pr-4">{r.meals}</td>
              <td className="py-2 pr-4">{Math.round(memberPoints(r))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToggleRow({
  label, value, onMinus, onPlus
}:{ label: string; value: 0|1; onMinus: ()=>void; onPlus: ()=>void; }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm">{label}</div>
      <div className="flex items-center gap-2">
        <button className="btn btn-compact" onClick={onMinus} disabled={value <= 0} title="Decrease to 0">−</button>
        <span className="w-8 text-center font-semibold">{value}</span>
        <button className="btn btn-compact" onClick={onPlus} disabled={value >= 1} title="Increase to 1">+</button>
      </div>
    </div>
  );
}

function SeasonPanelSimple({
  title,
  data
}:{ title: string; data: { totals:{ km:number; calories:number; workouts:number; meals:number; basePoints:number }; bonuses:{ weeksAll2Count:number; manualSum:number }; totalPoints:number; }; }) {
  const { totals, totalPoints } = data;
  return (
    <div className="card">
      <div className="text-lg font-semibold mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="KM Walked/Run (Total)" value={totals.km.toFixed(1)} />
        <Stat label="Calories Burned (Total)" value={Math.round(totals.calories).toString()} />
        <Stat label="Number of Workouts" value={totals.workouts.toString()} />
        <Stat label="Number of Healthy Meals" value={totals.meals.toString()} />
      </div>
      <div className="card">
        <div className="text-sm text-gray-700">Total team points</div>
        <div className="mt-1 text-3xl font-bold">{Math.round(totalPoints)}</div>
      </div>
    </div>
  );
}

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
  onSetExercise
}:{
  title: string;
  week: number | null;
  totals: { km:number; calories:number; workouts:number; meals:number; basePoints:number };
  totalPoints: number;
  rows: RecordRow[];
  isAdmin: boolean;
  habitsActive: boolean;
  exerciseActive: boolean;
  showAll2: boolean;
  onSetHabits: (desired:0|1)=>void;
  onSetExercise: (desired:0|1)=>void;
}) {
  const anyWeeklyBonus = showAll2 || habitsActive || exerciseActive;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title} {week ? `(Week ${week})` : ""}</h2>
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
            <Stat label="Total KM" value={totals.km.toFixed(1)} />
            <Stat label="Total Calories" value={Math.round(totals.calories).toString()} />
            <Stat label="Total Workouts" value={totals.workouts.toString()} />
            <Stat label="Total Healthy Meals" value={totals.meals.toString()} />
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
                {exerciseActive && <span className="badge badge-yes">✓ Full Team Participation in an exercise +200</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="card">
              <div className="text-sm text-gray-700">Total Team Points This Week</div>
              <div className="mt-1 text-3xl font-bold">{totalPoints}</div>
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

  // --- NEW: read week from URL on first load / navigation
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.week;
    const w = Number(Array.isArray(q) ? q[0] : q);
    if (!Number.isNaN(w) && w >= 1 && w <= 24) {
      setWeek(w);
    }
  }, [router.isReady, router.query.week]);

  // --- NEW: reflect selected week back into the URL for sharing
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.week;
    const current = q ? Number(Array.isArray(q) ? q[0] : q) : null;

    if (week && current !== week) {
      router.replace(
        { pathname: router.pathname, query: { ...router.query, week } },
        undefined,
        { shallow: true }
      );
    }
    if (!week && q) {
      const { week: _omit, ...rest } = router.query;
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [week, router]);

  // Session init
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) {
        const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setUserId(uid);
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      setProfile((prof as Profile) ?? null);
      setLoadingSession(false);
    })();

    const sub = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s?.user) {
        const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
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
      setArthurRoster(list.filter(p => p.team === "Arthur"));
      setJimmyRoster(list.filter(p => p.team === "Jimmy"));
    })();
  }, []);

  // Load my record when week changes
  useEffect(() => {
    if (!userId || !profile || !week) return;
    (async () => {
      setError(undefined);
      const { data, error } = await supabase
        .from("records").select("*")
        .eq("user_id", userId).eq("week", week)
        .maybeSingle();
      if (error) { setError(error.message); return; }
      if (!data) {
        setMyRecord({
          user_id: userId,
          name: profile.name,
          team: profile.team,
          week,
          km: 0, calories: 0, workouts: 0, meals: 0
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
    setArthurRows(list.filter(r => r.team === "Arthur"));
    setJimmyRows(list.filter(r => r.team === "Jimmy"));

    const { data: bons } = await supabase.from("team_bonuses").select("*").eq("week", wk);
    const bonsList = (bons || []) as TeamBonus[];
    setArthurBonuses(bonsList.filter(b => b.team === "Arthur"));
    setJimmyBonuses(bonsList.filter(b => b.team === "Jimmy"));
  };
  useEffect(() => { fetchTeams(); }, [week]);

  // Fetch ALL-WEEKS data
  async function refreshAllTotals() {
    const { data: recs } = await supabase.from("records").select("*");
    const list = (recs || []) as RecordRow[];
    setArthurAllRows(list.filter(r => r.team === "Arthur"));
    setJimmyAllRows(list.filter(r => r.team === "Jimmy"));

    const { data: bons } = await supabase.from("team_bonuses").select("*");
    const bList = (bons || []) as TeamBonus[];
    setArthurAllBonuses(bList.filter(b => b.team === "Arthur"));
    setJimmyAllBonuses(bList.filter(b => b.team === "Jimmy"));
  }
  useEffect(() => { refreshAllTotals(); }, []);

  // Realtime listeners
  useEffect(() => {
    if (!week) return;
    const recCh = supabase
      .channel(`records-w${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `week=eq.${week}` }, () => fetchTeams(week))
      .subscribe();
    const bonCh = supabase
      .channel(`bonuses-w${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bonuses", filter: `week=eq.${week}` }, () => fetchTeams(week))
      .subscribe();
    return () => { supabase.removeChannel(recCh); supabase.removeChannel(bonCh); };
  }, [week]);

  useEffect(() => {
    const ch = supabase
      .channel("all-weeks")
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, refreshAllTotals)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bonuses" }, refreshAllTotals)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Points / aggregates
  const myPoints = useMemo(() => (myRecord ? Math.round(memberPoints(myRecord)) : 0), [myRecord]);

  const arthurWeek = useMemo(() => computeTeam(arthurRoster, arthurRows, arthurBonuses), [arthurRows, arthurRoster, arthurBonuses]);
  const jimmyWeek  = useMemo(() => computeTeam(jimmyRoster, jimmyRows, jimmyBonuses), [jimmyRows, jimmyRoster, jimmyBonuses]);

  const arthurAll  = useMemo(() => computeTeamAcrossWeeks(arthurRoster, arthurAllRows, arthurAllBonuses), [arthurRoster, arthurAllRows, arthurAllBonuses]);
  const jimmyAll   = useMemo(() => computeTeamAcrossWeeks(jimmyRoster, jimmyAllRows, jimmyAllBonuses), [jimmyRoster, jimmyAllRows, jimmyAllBonuses]);

  async function save() {
    if (!myRecord || !profile) return;
    setSaving(true); setError(undefined);
    const payload = {
      user_id: myRecord.user_id, name: profile.name, team: profile.team, week: myRecord.week,
      km: Number(myRecord.km) || 0, calories: Number(myRecord.calories) || 0,
      workouts: Number(myRecord.workouts) || 0, meals: Number(myRecord.meals) || 0
    };
    const { data, error } = await supabase.from("records").upsert([payload], { onConflict: "user_id,week" }).select().maybeSingle();
    if (error) setError(error.message); else setMyRecord(data as RecordRow);
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  // Admin toggles 0/1
  const isAdmin = profile?.role === "admin";
  const arthurHabits   = arthurBonuses.some(b => b.reason.startsWith(HABITS_REASON));
  const arthurExercise = arthurBonuses.some(b => b.reason.startsWith(EXERCISE_REASON));
  const jimmyHabits    = jimmyBonuses.some(b => b.reason.startsWith(HABITS_REASON));
  const jimmyExercise  = jimmyBonuses.some(b => b.reason.startsWith(EXERCISE_REASON));

  async function setToggle(team: TeamName, reason: string, desired: 0 | 1) {
    if (!week || !isAdmin) return;
    const list = team === "Arthur" ? arthurBonuses : jimmyBonuses;
    const has = list.some(b => b.reason.startsWith(reason));
    if (desired === 1 && !has) {
      const { error } = await supabase.from("team_bonuses").insert({ team, week, points: 200, reason, created_by: userId });
      if (error) setError(error.message);
    } else if (desired === 0 && has) {
      const { error } = await supabase.from("team_bonuses").delete().eq("team", team).eq("week", week).like("reason", `${reason}%`);
      if (error) setError(error.message);
    }
    await fetchTeams(week);
  }

  if (loadingSession) {
    return (
      <>
        <Head><title>{SITE_NAME}</title></Head>
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
                <div className="badge mt-2">{profile.team === "Arthur" ? "Team Arthur" : "Team Jimmy"}</div>
                {isAdmin && <div className="badge badge-yes ml-2">Admin</div>}
              </div>
              <div className="card">
                <label className="label">Week (1–24)</label>
                <select className="input" value={week ?? ""} onChange={(e) => setWeek(Number(e.target.value) || null)}>
                  <option value="">Select…</option>
                  {WEEKS_SAFE.map((w) => <option key={w} value={w}>{w}</option>)}
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
                    <Field label="KM walked/run" value={myRecord.km} step={0.1} onChange={(v)=>setMyRecord(r=>r && ({...r, km:v}))} />
                    <Field label="Calories burned" value={myRecord.calories} step={10} onChange={(v)=>setMyRecord(r=>r && ({...r, calories:v}))} />
                    <Field label="Workouts" value={myRecord.workouts} step={1} onChange={(v)=>setMyRecord(r=>r && ({...r, workouts:v}))} />
                    <Field label="Healthy meals" value={myRecord.meals} step={1} onChange={(v)=>setMyRecord(r=>r && ({...r, meals:v}))} />
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">
                      Your points this week: <span className="font-semibold">{myPoints}</span>
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
                totalPoints={Math.round(arthurWeek.totalPoints)}
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
                totalPoints={Math.round(jimmyWeek.totalPoints)}
                rows={jimmyRows}
                isAdmin={isAdmin}
                habitsActive={jimmyHabits}
                exerciseActive={jimmyExercise}
                showAll2={jimmyWeek.bonuses.everyHas2Workouts}
                onSetHabits={(desired) => setToggle("Jimmy", HABITS_REASON, desired)}
                onSetExercise={(desired) => setToggle("Jimmy", EXERCISE_REASON, desired)}
              />
            </div>

            {/* Season Totals (All Weeks) */}
            <div className="card mb-6">
              <h2 className="text-lg font-semibold mb-3">Season Total (All Weeks)</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SeasonPanelSimple title="Team Arthur" data={arthurAll} />
                <SeasonPanelSimple title="Team Jimmy" data={jimmyAll} />
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
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) { setError("Not signed in."); return; }

      const { data, error: insErr } = await supabase
        .from("profiles")
        .insert({ id: uid, name, team })
        .select("*")
        .single();

      if (insErr) {
        if ((insErr as any).code === "23505" || /duplicate key|unique/i.test(insErr.message)) {
          setError("That display name is already taken. Please choose a different one.");
          return;
        }
        const { data: existing, error: selErr } = await supabase
          .from("profiles").select("*").eq("id", uid).single();
        if (selErr || !existing) {
          setError(insErr.message || "Could not save profile."); return;
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

/* ----------------------- Server-side auth guard ----------------------- */

import type { GetServerSidePropsContext, GetServerSideProps } from "next";
import { createServerSupabaseClient } from "../lib/supabaseServer";

export const getServerSideProps: GetServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const next = ctx.resolvedUrl || "/";
    return { redirect: { destination: `/login?next=${encodeURIComponent(next)}`, permanent: false } };
  }
  return { props: {} };
};
