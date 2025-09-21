import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

type Tab = "emailpass" | "userpass" | "setup";

export default function Login() {
  const router = useRouter();
  const nextParam = typeof router.query.next === "string" ? router.query.next : "/";

  const [tab, setTab] = useState<Tab>("emailpass");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);
  const [err, setErr] = useState<string|null>(null);

  // If already logged in, bounce to next
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) router.replace(nextParam || "/");
    })();
  }, [router, nextParam]);

  const redirectOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return process.env.NEXT_PUBLIC_SITE_URL || "";
  }, []);

  async function signInWithEmailPassword(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (data.session?.user) router.replace(nextParam || "/");
  }

  async function signInWithUsernamePassword(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    // Resolve username -> email
    const { data: prof, error: qErr } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", username)
      .maybeSingle();
    if (qErr || !prof) { setBusy(false); setErr("Username not found."); return; }
    // We need user's email; fetch auth user by id via RPC is not available with anon key.
    // Workaround: store email on sign-up (optional), or ask user for email if missing.
    // Since everyone originally used email, we’ll just prompt for email if sign-in fails.
    // Simpler: try email+password with the username as email fallback if they typed email.
    const emailGuess = username.includes("@") ? username : email;
    if (!emailGuess) { setBusy(false); setErr("Please enter your email in the Email+Password tab, or use your username here plus email below in case-insensitive match."); return; }

    const { data, error } = await supabase.auth.signInWithPassword({ email: emailGuess, password });
    setBusy(false);
    if (error) { setErr("Login failed. If you’re using a username, please also enter your email in the Email+Password tab, or use the 'Set password' tab to create one."); return; }
    if (data.session?.user) router.replace(nextParam || "/");
  }

  async function sendPasswordSetup(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirectOrigin}/reset` });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg("We’ve sent you a secure link to set your password. Open it and set a new password, then return here to sign in.");
  }

  return (
    <>
      <Head><title>Login – {SITE_NAME}</title></Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Login to {SITE_NAME}</h1>
          <div className="flex gap-2 mb-4">
            <button className={`btn btn-compact ${tab==="emailpass"?"btn-primary":""}`} onClick={()=>setTab("emailpass")}>Email + Password</button>
            <button className={`btn btn-compact ${tab==="userpass"?"btn-primary":""}`} onClick={()=>setTab("userpass")}>Username + Password</button>
            <button className={`btn btn-compact ${tab==="setup"?"btn-primary":""}`} onClick={()=>setTab("setup")}>Send password setup link</button>
          </div>

          {tab === "emailpass" && (
            <form onSubmit={signInWithEmailPassword} className="grid grid-cols-1 gap-3">
              <div>
                <label className="label">Email</label>
                <input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-compact" type="submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
              {err && <p className="text-sm text-red-600">{err}</p>}
            </form>
          )}

          {tab === "userpass" && (
            <form onSubmit={signInWithUsernamePassword} className="grid grid-cols-1 gap-3">
              <div>
                <label className="label">Username</label>
                <input className="input" required value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="yourhandle" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-compact" type="submit" disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
              {err && <p className="text-sm text-red-600">{err}</p>}
              {!err && <p className="text-xs text-gray-600">Tip: If you see trouble, switch to Email+Password or use “Send password setup link”.</p>}
            </form>
          )}

          {tab === "setup" && (
            <form onSubmit={sendPasswordSetup} className="grid grid-cols-1 gap-3">
              <p className="text-sm text-gray-700">
                If you signed in before using a magic link, use this to create your password. We’ll email you a secure link.
              </p>
              <div>
                <label className="label">Email</label>
                <input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <button className="btn btn-primary btn-compact" type="submit" disabled={busy}>{busy?"Sending…":"Email me the link"}</button>
              {err && <p className="text-sm text-red-600">{err}</p>}
              {msg && <p className="text-sm text-green-700">{msg}</p>}
            </form>
          )}
        </div>
      </main>
    </>
  );
}
