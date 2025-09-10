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
  computeTeamAcrossWeeks
} from "../utils/points";

const WEEKS_SAFE = Constants?.WEEKS ?? Array.from({ length: 24 }, (_, i) => i + 1);
const POINTS_SAFE = Constants?.POINTS ?? {
  perKm: 10, per1000Calories: 100, perWorkout: 20, perHealthyMeal: 20, bonusAllMinWorkouts: 200
};

type EvidenceRow = { team: "Arthur" | "Jimmy"; week: number; kind: "exercise" | "habits"; image_path: string };

export default function Home() {
  const router = useRouter();
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";

  // Session & profile
  const [userId, setUserId] = useState<string>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // UI state
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  // My record
  const [myRecord, setMyRecord] = useState<RecordRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Rosters
  const [arthurRoster, setArthurRoster] = useState<Profile[]>([]);
  const [jimmyRoster, setJimmyRoster] = useState<Profile[]>([]);

  // Records per SELECTED week
  const [arthurRows, setArthurRows] = useState<RecordRow[]>([]);
  const [jimmyRows, setJimmyRows] = useState<RecordRow[]>([]);

  // Evidence gallery (per week)
  const [arthurExercise, setArthurExercise] = useState<string[]>([]);
  const [arthurHabits, setArthurHabits] = useState<string[]>([]);
  const [jimmyExercise, setJimmyExercise] = useState<string[]>([]);
  const [jimmyHabits, setJimmyHabits] = useState<string[]>([]);

  // Admin manual bonuses (per SELECTED week)
  const [arthurBonuses, setArthurBonuses] = useState<TeamBonus[]>([]);
  const [jimmyBonuses, setJimmyBonuses] = useState<TeamBonus[]>([]);

  // NEW: All-weeks data (season totals)
  const [arthurAllRows, setArthurAllRows] = useState<RecordRow[]>([]);
  const [jimmyAllRows, setJimmyAllRows] = useState<RecordRow[]>([]);
  const [arthurAllBonuses, setArthurAllBonuses] = useState<TeamBonus[]>([]);
  const [jimmyAllBonuses, setJimmyAllBonuses] = useState<TeamBonus[]>([]);

  // Bootstrap session & profile
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

  // Force refresh profile on first load (safety net)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      if (prof) setProfile(prof as any);
    })();
  }, []);

  // Load full roster
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
        .from("records")
        .select("*")
        .eq("user_id", userId)
        .eq("week", week)
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

    const { data: ev } = await supabase.from("team_evidence").select("*").eq("week", wk).eq("approved", true);
    const evList = (ev || []) as EvidenceRow[];
    setArthurExercise(evList.filter(e => e.team === "Arthur" && e.kind === "exercise").map(e => e.image_path));
    setArthurHabits(evList.filter(e => e.team === "Arthur" && e.kind === "habits").map(e => e.image_path));
    setJimmyExercise(evList.filter(e => e.team === "Jimmy" && e.kind === "exercise").map(e => e.image_path));
    setJimmyHabits(evList.filter(e => e.team === "Jimmy" && e.kind === "habits").map(e => e.image_path));

    const { data: bons } = await supabase.from("team_bonuses").select("*").eq("week", wk);
    const bonsList = (bons || []) as TeamBonus[];
    setArthurBonuses(bonsList.filter(b => b.team === "Arthur"));
    setJimmyBonuses(bonsList.filter(b => b.team === "Jimmy"));
  };

  useEffect(() => { fetchTeams(); }, [week]);

  // NEW: Fetch ALL-WEEKS data once and keep it fresh
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

  // Realtime for selected week
  useEffect(() => {
    if (!week) return;
    const recCh = supabase
      .channel(`records-w${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `week=eq.${week}` }, () => fetchTeams(week))
      .subscribe();
    const evCh = supabase
      .channel(`evidence-w${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_evidence", filter: `week=eq.${week}` }, () => fetchTeams(week))
      .subscribe();
    const bonCh = supabase
      .channel(`bonuses-w${week}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bonuses", filter: `week=eq.${week}` }, () => fetchTeams(week))
      .subscribe();

    return () => { supabase.removeChannel(recCh); supabase.removeChannel(evCh); supabase.removeChannel(bonCh); };
  }, [week]);

  // NEW: Realtime for ALL-WEEKS totals (no filter)
  useEffect(() => {
    const ch = supabase
      .channel("all-weeks")
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, refreshAllTotals)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_bonuses" }, refreshAllTotals)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // My points (selected week)
  const myPoints = useMemo(() => (myRecord ? Math.round(memberPoints(myRecord)) : 0), [myRecord]);

  // Team (selected week)
  const arthur = useMemo(
    () => computeTeam(arthurRoster, arthurRows, arthurBonuses),
    [arthurRows, arthurRoster, arthurBonuses]
  );
  const jimmy = useMemo(
    () => computeTeam(jimmyRoster, jimmyRows, jimmyBonuses),
    [jimmyRows, jimmyRoster, jimmyBonuses]
  );

  // NEW: Season totals (all weeks)
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
    setSaving(true); setError(undefined);
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
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }

  function publicUrl(path?: string) {
    if (!path) return "";
    return supabase.storage.from("team-evidence").getPublicUrl(path).data.publicUrl;
  }

  // While server-side guard prevents anon users reaching this page,
  // we still render a clean loading state for the first hydration
  if (loadingSession) {
    return (
      <>
        <Head><title>Team Fitness</title></Head>
        <main className="min-h-screen grid place-items-center px-4">
          <div className="card text-sm text-gray-700">Loading your session…</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Team Fitness</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        {debug && (
          <pre className="card overflow-auto mb-4 text-xs">
            {JSON.stringify({ loadingSession, userId, profile, week }, null, 2)}
          </pre>
        )}

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">Team Fitness Dashboard</h1>
          {userId && <button className="btn btn-primary" onClick={signOut}>Sign out</button>}
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
                  <div>Every 1 km logged: {POINTS_SAFE.perKm} pts</div>
                  <div>Every 1,000 calories burned: {POINTS_SAFE.per1000Calories} pts</div>
                  <div>Each workout: {POINTS_SAFE.perWorkout} pts</div>
                  <div>Each healthy meal: {POINTS_SAFE.perHealthyMeal} pts</div>
                  <div>All members ≥2 workouts/week (auto): +{POINTS_SAFE.bonusAllMinWorkouts}</div>
                  <div>Admin bonuses (Arthur): “Healthy Habits” + “Full Team Exercise” (+200 each, optional)</div>
                </div>
              </div>
            </div>

            {/* Season Totals (All Weeks) */}
            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Season Totals (All Weeks)</h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SeasonPanel title="Team Arthur — All Weeks" data={arthurAll} />
                <SeasonPanel title="Team Jimmy — All Weeks" data={jimmyAll} />
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
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm">Your points this week: <span className="font-semibold">{myPoints}</span></div>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save / Update"}</button>
                  </div>
                </>
              )}
              {error && <p className="mt-3 text-sm text-red-600">Error: {error}</p>}
            </div>

            {/* Team panels (selected week) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TeamPanel
                title="Team Arthur"
                week={week}
                totals={arthur.totals}
                manualSum={arthur.bonuses.manualSum}
                everyHas2Workouts={arthur.bonuses.everyHas2Workouts}
                totalPoints={Math.round(arthur.totalPoints)}
                rows={arthurRows}
                exercisePhotos={arthurExercise}
                habitsPhotos={arthurHabits}
                bonusList={arthurBonuses}
                publicUrl={publicUrl}
              />
              <TeamPanel
                title="Team Jimmy"
                week={week}
                totals={jimmy.totals}
                manualSum={jimmy.bonuses.manualSum}
                everyHas2Workouts={jimmy.bonuses.everyHas2Workouts}
                totalPoints={Math.round(jimmy.totalPoints)}
                rows={jimmyRows}
                exercisePhotos={jimmyExercise}
                habitsPhotos={jimmyHabits}
                bonusList={jimmyBonuses}
                publicUrl={publicUrl}
              />
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
          .from("profiles")
          .select("*")
          .eq("id", uid)
          .single();
        if (selErr || !existing) {
          setError(insErr.message || "Could not save profile.");
          return;
        }
        onDone(existing);
        return;
      }

      onDone(data);
    } finally {
      setSaving(false);
    }
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
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Saving..." : "Save profile"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

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

function TeamPanel({
  title,
  week,
  totals,
  manualSum,
  everyHas2Workouts,
  totalPoints,
  rows,
  exercisePhotos,
  habitsPhotos,
  bonusList,
  publicUrl
}:{
  title: string;
  week: number | null;
  totals: { km:number; calories:number; workouts:number; meals:number; basePoints:number };
  manualSum: number;
  everyHas2Workouts: boolean;
  totalPoints: number;
  rows: RecordRow[];
  exercisePhotos: string[];
  habitsPhotos: string[];
  bonusList: TeamBonus[];
  publicUrl: (p?:string)=>string;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title} {week ? `(Week ${week})` : ""}</h2>
      </div>
      {!week ? <p className="text-sm text-gray-600">Pick a week.</p> : (
        <>
          {(exercisePhotos.length || habitsPhotos.length) ? (
            <div className="mb-4">
              {exercisePhotos.length > 0 && (
                <>
                  <div className="text-sm font-medium mb-2">Exercise participation</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    {exercisePhotos.map((p, i) => (
                      <img key={i} className="rounded-lg w-full object-cover max-h-48" src={publicUrl(p)} alt={`${title} exercise ${i+1}`} />
                    ))}
                  </div>
                </>
              )}
              {habitsPhotos.length > 0 && (
                <>
                  <div className="text-sm font-medium mb-2">Healthy habits</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {habitsPhotos.map((p, i) => (
                      <img key={i} className="rounded-lg w-full object-cover max-h-48" src={publicUrl(p)} alt={`${title} habits ${i+1}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Stat label="Total KM" value={totals.km.toFixed(1)} />
            <Stat label="Total Calories" value={Math.round(totals.calories).toString()} />
            <Stat label="Total Workouts" value={totals.workouts.toString()} />
            <Stat label="Total Healthy Meals" value={totals.meals.toString()} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="card">
              <div className="text-sm text-gray-700 mb-2">
                Base points (sum of members): <strong>{Math.round(totals.basePoints)}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge ok={everyHas2Workouts} text={`All ≥2 workouts (+${POINTS_SAFE.bonusAllMinWorkouts})`} />
                <Badge ok={manualSum > 0} text={`Admin bonuses (+${manualSum})`} />
              </div>
              {bonusList.length > 0 && (
                <ul className="list-disc ml-5 text-sm mt-2">
                  {bonusList.map(b => (
                    <li key={b.id}>{b.reason} (+{b.points})</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card">
              <div className="text-sm text-gray-700">Total team points (incl. bonuses):</div>
              <div className="mt-1 text-3xl font-bold">{totalPoints}</div>
            </div>
          </div>

          <MembersTable rows={rows} />
        </>
      )}
    </div>
  );
}

function SeasonPanel({ title, data }:{
  title: string;
  data: {
    totals: { km:number; calories:number; workouts:number; meals:number; basePoints:number };
    bonuses: { weeksAll2Count:number; manualSum:number };
    totalPoints: number;
  };
}) {
  const { totals, bonuses, totalPoints } = data;
  return (
    <div className="card">
      <div className="text-lg font-semibold mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="KM (all weeks)" value={totals.km.toFixed(1)} />
        <Stat label="Calories (all weeks)" value={Math.round(totals.calories).toString()} />
        <Stat label="Workouts (all weeks)" value={totals.workouts.toString()} />
        <Stat label="Meals (all weeks)" value={totals.meals.toString()} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="text-sm text-gray-700 mb-2">
            Base points total: <strong>{Math.round(totals.basePoints)}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge ok={bonuses.weeksAll2Count > 0} text={`Weeks all ≥2 workouts: ${bonuses.weeksAll2Count} (× +${POINTS_SAFE.bonusAllMinWorkouts})`} />
            <Badge ok={bonuses.manualSum > 0} text={`Admin bonuses total: +${bonuses.manualSum}`} />
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-700">Total team points (ALL weeks):</div>
          <div className="mt-1 text-3xl font-bold">{Math.round(totalPoints)}</div>
        </div>
      </div>
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

function Badge({ ok, text }:{ ok:boolean; text:string }) {
  return <span className={`badge ${ok ? "badge-yes" : "badge-no"}`}>{ok ? "✓" : "•"} {text}</span>;
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
            <th className="py-2 pr-4">Meals</th>
            <th className="py-2 pr-4">Pts</th>
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

// --- Server-side guard: redirect anonymous users before rendering ---
import type { GetServerSidePropsContext, GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const { createServerSupabaseClient } = await import("@supabase/auth-helpers-nextjs");

  const supabase = createServerSupabaseClient(ctx, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    const next = ctx.resolvedUrl || "/";
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent(next)}`,
        permanent: false
      }
    };
  }

  return { props: {} };
};
