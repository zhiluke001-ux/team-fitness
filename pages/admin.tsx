import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { WEEKS, SITE_NAME } from "../utils/constants";

type Team = "Arthur" | "Jimmy";
type TeamBonus = { id: string; team: Team; week: number; points: number; reason: string; created_at: string };
type EvidenceRow = { id: string; team: Team; week: number; kind: "exercise" | "habits"; image_path: string; created_at: string };

export default function Admin() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; name: string; role: string } | null>(null);

  const [team, setTeam] = useState<Team>("Arthur");
  const [week, setWeek] = useState<number | null>(null);

  const [reason, setReason] = useState("Healthy Habits Bonus (team-wide complete)");
  const [points, setPoints] = useState(200);

  const [bonuses, setBonuses] = useState<TeamBonus[]>([]);
  const [photos, setPhotos] = useState<EvidenceRow[]>([]);

  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) { router.replace("/login?next=/admin"); return; }
      const { data: p } = await supabase.from("profiles").select("id,name,role").eq("id", uid).maybeSingle();
      if (!p || p.role !== "admin") { router.replace("/"); return; }
      setMe(p as any);
    })();
  }, [router]);

  useEffect(() => {
    if (!week) { setBonuses([]); setPhotos([]); return; }
    refreshData();
  }, [team, week]);

  async function refreshData() {
    if (!week) return;
    const { data: b } = await supabase.from("team_bonuses").select("*").eq("team", team).eq("week", week).order("created_at", { ascending: false });
    setBonuses((b || []) as TeamBonus[]);
    const { data: e } = await supabase.from("team_evidence").select("*").eq("team", team).eq("week", week).order("created_at", { ascending: false });
    setPhotos((e || []) as EvidenceRow[]);
  }

  async function addBonus(customReason?: string, customPoints?: number) {
    if (!week) return setError("Pick a week first.");
    setError(undefined); setOk(undefined);
    const r = (customReason ?? reason).trim();
    const pts = Number(customPoints ?? points) || 0;
    if (!r || !pts) return setError("Enter a reason and points.");
    const { error: insErr } = await supabase.from("team_bonuses").insert({
      team, week, points: pts, reason: r, created_by: me!.id
    });
    if (insErr) return setError(insErr.message);
    setOk(`Added +${pts} "${r}" to ${team} week ${week}.`);
    await refreshData();
  }

  async function upload(kind: "exercise" | "habits", file: File) {
    if (!week) return setError("Pick a week first.");
    setError(undefined); setOk(undefined);
    const path = `${team}/${week}/${kind}-${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("team-evidence").upload(path, file, { upsert: true });
    if (upErr) return setError(upErr.message);
    const { error: insErr } = await supabase.from("team_evidence").insert({
      team, week, kind, image_path: path, submitted_by: me!.id, approved: true
    });
    if (insErr) return setError(insErr.message);
    setOk(`Uploaded ${kind} photo for ${team} week ${week}.`);
    await refreshData();
  }

  if (!me) return (
    <>
      <Head><title>Admin — {SITE_NAME}</title></Head>
      <p style={{ padding: 16 }}>Loading…</p>
    </>
  );

  return (
    <>
      <Head><title>Admin — {SITE_NAME}</title></Head>
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="text-2xl font-bold mb-4">Admin Panel — {SITE_NAME}</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Team</label>
            <select className="input" value={team} onChange={(e) => setTeam(e.target.value as Team)}>
              <option value="Arthur">Team Arthur</option>
              <option value="Jimmy">Team Jimmy</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Week</label>
            <select className="input" value={week ?? ""} onChange={(e) => setWeek(Number(e.target.value) || null)}>
              <option value="">Select…</option>
              {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        {/* A) Add admin-approved bonus (independent) */}
        <div className="card mb-4">
          <div className="font-semibold mb-2">Add admin bonus</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="input md:col-span-2" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <input className="input" type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary btn-compact" onClick={() => addBonus()}>Add Bonus</button>
            <button className="btn btn-primary btn-compact" onClick={() => addBonus("Healthy Habits Bonus /week", 200)}>+200 Healthy Habits</button>
            <button className="btn btn-primary btn-compact" onClick={() => addBonus("Full Team Participation in an exercise", 200)}>+200 Full Team Exercise</button>
          </div>

          {bonuses.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Bonuses for {team} Week {week}</div>
              <ul className="list-disc ml-5 text-sm">
                {bonuses.map(b => (
                  <li key={b.id}>{new Date(b.created_at).toLocaleString()} — {b.reason} (+{b.points})</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* B) Upload gallery photos (optional) */}
        <div className="card mb-4">
          <div className="font-semibold mb-2">Upload gallery photos (optional)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="btn btn-primary btn-compact">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload("exercise", f); }} />
              Upload Exercise Photo
            </label>
          </div>

          {photos.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">Photos for {team} Week {week}</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map(p => {
                  const url = supabase.storage.from("team-evidence").getPublicUrl(p.image_path).data.publicUrl;
                  return <img key={p.id} className="rounded-lg w-full object-cover max-h-48" src={url} alt={`${p.kind}`} />;
                })}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-700">{ok}</p>}
      </main>
    </>
  );
}

// --- Server-side guard: require admin role ---
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
    return {
      redirect: { destination: `/login?next=${encodeURIComponent("/admin")}`, permanent: false }
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }

  return { props: {} };
};
