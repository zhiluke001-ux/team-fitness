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

  const autoTriedRef = useRef(false);

  const redirectOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return process.env.NEXT_PUBLIC_SITE_URL || "";
  }, []);

  function persistRemember(e: string, p: string, auto: boolean) {
    try {
      if (remember && typeof window !== "undefined") {
        const payload: RememberPayload = { email: e, password: p, autoSignIn: auto };
        localStorage.setItem(REMEMBER_KEY, JSON.stringify(payload));
      } else if (typeof window !== "undefined") {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {}
  }

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
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace(nextParam || "/");
        return;
      }
      const skipAuto = typeof window !== "undefined" && sessionStorage.getItem("atag-skip-auto") === "1";
      if (skipAuto && typeof window !== "undefined") {
        sessionStorage.removeItem("atag-skip-auto");
      }
      const raw = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
      if (raw) {
        const saved = JSON.parse(raw) as RememberPayload | null;
        if (saved?.email) setEmail(saved.email);
        if (saved?.password) setPassword(saved.password);
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

  // Helpers for the Forgot Password button
  function clearPkceVerifiers() {
    try {
      if (typeof window === "undefined") return;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (k.startsWith("sb-pkce-code-verifier")) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }

  function genTempPassword() {
    try {
      const arr = new Uint8Array(16);
      if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(arr);
        return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch {}
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  /**
   * Forgot password → ONE flow only:
   * 1) Try signUp first (creates new users). If success ⇒ email sent (confirm link) → /reset?new=1
   * 2) If signUp says "already registered" ⇒ clear PKCE, then send resetPasswordForEmail → /reset
   * This guarantees the PKCE code_verifier in localStorage matches the LAST email we send.
   */
  async function sendPasswordSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setErr("Enter your email first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);

    const confirmRedirect = `${redirectOrigin}/reset?new=1`;
    const resetRedirect = `${redirectOrigin}/reset`;

    try {
      // Step 1: start fresh PKCE state
      clearPkceVerifiers();

      // A) Try to sign up (covers NEW users)
      const tempPassword = genTempPassword();
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: { emailRedirectTo: confirmRedirect },
      });

      if (!signUpErr) {
        // New user flow: only one email was sent (PKCE verifier set for this flow)
        setMsg(
          "Check your email for a confirmation link to create your account. Open it in this same browser, then set your password."
        );
        setBusy(false);
        return;
      }

      // If user already exists, fall back to RESET flow
      const msgLow = (signUpErr.message || "").toLowerCase();
      const already =
        signUpErr.status === 422 ||
        msgLow.includes("already") ||
        msgLow.includes("exists") ||
        msgLow.includes("registered");

      if (!already) {
        // Some other signUp error — surface it
        throw signUpErr;
      }

      // B) Existing user: reset password (SECOND and only flow now)
      clearPkceVerifiers(); // ensure verifier belongs to the reset flow we’re about to start
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirect,
      });
      if (resetErr) throw resetErr;

      setMsg(
        "We’ve emailed you a reset link. Open it in this same browser to set your password."
      );
      setBusy(false);
    } catch (ex: any) {
      setBusy(false);
      setErr(ex?.message || "We couldn't send the email. Please try again later.");
    }
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
              <button
                className="btn btn-compact"
                onClick={sendPasswordSetup}
                disabled={!email || busy}
                type="button"
                title="Send a sign-up (new) or reset (existing) email"
              >
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
