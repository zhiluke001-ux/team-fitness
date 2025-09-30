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
    } catch { /* ignore */ }
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

  useEffect(() => {
    (async () => {
      // already signed in?
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace(nextParam || "/");
        return;
      }

      // If we just signed out, skip auto once
      const skipAuto = typeof window !== "undefined" && sessionStorage.getItem("atag-skip-auto") === "1";
      if (skipAuto && typeof window !== "undefined") {
        sessionStorage.removeItem("atag-skip-auto");
      }

      // load remembered creds
      const raw = typeof window !== "undefined" ? localStorage.getItem("atag-remember-cred") : null;
      if (raw) {
        const saved = JSON.parse(raw) as { email?: string; password?: string; autoSignIn?: boolean } | null;
        if (saved?.email) setEmail(saved.email);
        if (saved?.password) setPassword(saved.password);

        // only auto if not skipping and flag is true
        if (!skipAuto && saved?.autoSignIn && saved.email && saved.password && !autoTriedRef.current) {
          autoTriedRef.current = true;
          setTimeout(() => directSignIn(saved.email!, saved.password!), 100);
        }
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

  // Generate a random temporary password (for new users created via Forgot Password)
  function genTempPassword() {
    try {
      const arr = new Uint8Array(16);
      if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(arr);
        return Array.from(arr)
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch { /* noop */ }
    // Fallback
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  // Forgot password: robust dual-attempt strategy
  // Step A: request a password reset (covers existing users — some envs always return success)
  // Step B: try signUp with a temp password (covers new users); if "already registered", that's fine.
  // We show success if either A or B succeeds; error only if both fail.
  async function sendPasswordSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setErr("Enter your email first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);

    const resetRedirect = `${redirectOrigin}/reset`;

    // A) Try to send a recovery email for existing users
    let resetOk = false;
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect,
      });
      // Supabase may not error even if user doesn't exist; treat absence of error as OK
      if (!resetErr) resetOk = true;
    } catch {
      // ignore; we will try signUp next
    }

    // B) Try to create the user (new users) which sends a confirmation email landing on /reset
    let signupOk = false;
    try {
      const tempPassword = genTempPassword();
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: { emailRedirectTo: resetRedirect },
      });

      if (!signUpErr) {
        signupOk = true;
      } else {
        // If the user is already registered, that's okay — reset (A) should cover them.
        const msg = (signUpErr.message || "").toLowerCase();
        const already =
          msg.includes("already registered") ||
          msg.includes("already exists") ||
          msg.includes("user exists") ||
          signUpErr.status === 422;
        if (already) {
          signupOk = false; // but not a fatal failure
        } else {
          // Other signUp errors are unexpected; still don't fail yet if resetOk
          // leave signupOk=false
        }
      }
    } catch {
      // ignore; still rely on resetOk
    }

    setBusy(false);

    if (resetOk || signupOk) {
      // Keep your original success copy
      setMsg("We’ve emailed you a secure link to set your password. Open it, set a password, then sign in.");
      return;
    }

    // If we reach here, both attempts failed (usually misconfig or network)
    setErr("We couldn't send the email. Please try again later.");
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
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
          </form>
        </div>
      </main>
    </>
  );
}
