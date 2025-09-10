import Head from "next/head";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { WEEKS, POINTS } from "../utils/constants";
import { RecordRow, Profile, TeamBonus, memberPoints, computeTeam } from "../utils/points";

type EvidenceRow = { team: "Arthur" | "Jimmy"; week: number; kind: "exercise" | "habits"; image_path: string };

export default function Home() {
  const router = useRouter();

  const [userId, setUserId] = useState<string>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [myRecord, setMyRecord] = useState<RecordRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [arthurRoster, setArthurRoster] = useState<Profile[]>([]);
  const [jimmyRoster, setJimmyRoster] = useState<Profile[]>([]);
  const [arthurRows, setArthurRows] = useState<RecordRow[]>([]);
  const [jimmyRows, setJimmyRows] = useState<RecordRow[]>([]);
  const [arthurExercise, setArthurExercise] = useState<string[]>([]);
  const [arthurHabits, setArthurHabits] = useState<string[]>([]);
  const [jimmyExercise, setJimmyExercise] = useState<string[]>([]);
  const [jimmyHabits, setJimmyHabits] = useState<string[]>([]);
  const [arthurBonuses, setArthurBonuses] = useState<TeamBonus[]>([]);
  const [jimmyBonuses, setJimmyBonuses] = useState<TeamBonus[]>([]);

    useEffect(() => {
      (async () => {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user.id;
        if (!uid) return;
        const { data: prof, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
        if (!error && prof) setProfile(prof as any);
      })();
    }, []);

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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*");
      const list = (data || []) as Profile[];
      setArthurRoster(list.filter(p => p.team === "Arthur"));
      setJimmyRoster(list.filter(p => p.team === "Jimmy"));
    })();
  }, []);

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

  const fetchTeams = useCallback(async (wk: number | null = week) => {
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
  }, [week]);

  useEffect(() => { void fetchTeams(); }, [fetchTeams]);

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
  }, [week, fetchTeams]);

  const myPoints = useMemo(() => (myRecord ? Math.round(memberPoints(myRecord)) : 0), [myRecord]);
  const arthur = useMemo(() => computeTeam(arthurRoster, arthurRows, arthurBonuses), [arthurRows, arthurRoster, arthurBonuses]);
  const jimmy  = useMemo(() => computeTeam(jimmyRoster, jimmyRows, jimmyBonuses), [jimmyRows, jimmyRoster, jimmyBonuses]);

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

  return (
    <>
      <Head><title>Team Fitness</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">Team Fitness Dashboard</h1>
          <button className="btn btn-primary" onClick={signOut}>Sign out</button>
        </div>

        {loadingSession ? (
          <p>Loading…</p>
        ) : !profile ? (
          <div className="card max-w-lg">
            <h2 className="text-lg font-semibold mb-2">Complete your profile</h2>
            <Onboarding onDone={(p) => setProfile(p)} />
          </div>
        ) : (
          <>
            {/* header, editor, and panels remain same as before */}
            {/* ... (keep your existing JSX from previous step) ... */}
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

      // Try to insert, but if row exists already, fall back to fetching it
      const { data, error: insErr } = await supabase
        .from("profiles")
        .insert({ id: uid, name, team })
        .select("*")
        .single();

      if (insErr) {
        // Duplicate name is the most common failure (unique constraint)
        if ((insErr as any).code === "23505" || /duplicate key|unique/i.test(insErr.message)) {
          setError("That display name is already taken. Please choose a different one.");
          return;
        }
        // If the row already exists for this user (rare),
        // just fetch it and continue
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
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
