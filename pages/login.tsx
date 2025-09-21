// pages/login.tsx
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

type RememberPayload = { email: string; password: string; autoSignIn?: boolean };

const REMEMBER_KEY = "atag-remember-cred";

export default function Login() {
  const router = useRouter();
  const nextParam = typeof router.query.next === "string" ? router.query.next : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [autoSignIn, setAutoSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ensure we don't double-run auto sign-in
  const autoTriedRef = useRef(false);

  const redirectOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return process.env.NEXT_PUBLIC_SITE_URL || "";
  }, []);

  // Helper: persist or clear remembered creds
  function persistRemember(e: string, p: string, auto: boolean) {
    try {
      if (remember && typeof window !== "undefined") {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: e, password: p, autoSignIn: auto }));
      } else if (typeof window !== "undefined") {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  // Helper: direct sign-in with explicit creds (used by auto sign-in)
  async function directSignIn(e: string, p: string) {
    if (!e || !p) {
      setErr("Saved credentials incomplete. Please sign in manually once.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data.session?.user) {
      persistRemember(e, p, true);
      router.replace(nextParam || "/");
    }
  }

  // On mount: if already signed in, redirect; else load remembered creds and (optionally) auto sign-in
  useEffect(() => {
    (async () => {
      // already signed in?
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace(nextParam || "/");
        return;
      }

      // load remembered
      try {
        const raw = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
        if (raw) {
          const saved = JSON.parse(raw) as RememberPayload | null;
          if (saved?.email) setEmail(saved.email);
          if (saved?.password) setPassword(saved.password);
          if (saved?.autoSignIn) setAutoSignIn(true);

          // IMPORTANT: Use saved values directly (not state) for auto sign-in
          if (!autoTriedRef.current && saved?.autoSignIn && saved.email && saved.password) {
            autoTriedRef.current = true;
            // Small tick to let the UI paint first, then sign in with explicit values
            setTimeout(() => directSignIn(saved.email, saved.password), 100);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, nextParam]);

  async function signInWithEmailPassword(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!email || !password) {
      setErr("Please enter your email and password.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data.session?.user) {
      persistRemember(email, password, autoSignIn);
      router.replace(nextParam || "/");
    }
  }

  async function sendPasswordSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setErr("Enter your email first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectOrigin}/reset`,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg("We’ve emailed you a secure link to set your password. Open it, set a password, then sign in.");
  }

  return (
    <>
      <Head>
        <title>Login – {SITE_NAME}</title>
      </Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Login to {SITE_NAME}</h1>

          <form onSubmit={signInWithEmailPassword} className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me on this device
              </label>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoSignIn}
                  onChange={(e) => setAutoSignIn(e.target.checked)}
                  disabled={!remember}
                  title={remember ? "Try auto sign-in on next visit" : "Enable Remember me first"}
                />
                Auto sign-in
              </label>
            </div>

            <button className="btn btn-primary btn-compact" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="flex items-center justify-between">
              <button className="btn btn-compact" onClick={sendPasswordSetup} disabled={!email || busy} type="button">
                Forgot password?
              </button>
              <span className="text-xs text-gray-500">
                Sessions persist; use this if you signed out or changed devices.
              </span>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            <p className="text-xs text-gray-500">
              Tip: Your browser’s built-in password manager is the safest way to remember login.
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
