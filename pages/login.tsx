// pages/login.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

type RememberPayload = { email: string; password: string; autoSignIn?: boolean };

const REMEMBER_KEY = "atag-remember-cred";

async function storeWithCredentialAPI(email: string, password: string) {
  try {
    if ("credentials" in navigator && (window as any).PasswordCredential) {
      // @ts-ignore - web types vary
      const cred = new (window as any).PasswordCredential({ id: email, password });
      // @ts-ignore
      await navigator.credentials.store(cred);
    }
  } catch {
    // ignore
  }
}

async function getWithCredentialAPI(): Promise<RememberPayload | null> {
  try {
    if ("credentials" in navigator) {
      // @ts-ignore
      const cred = await navigator.credentials.get({ password: true });
      if (cred && cred.id && cred.password) {
        // @ts-ignore
        return { email: cred.id, password: cred.password };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

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

  const redirectOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return process.env.NEXT_PUBLIC_SITE_URL || "";
  }, []);

  // Prefill from session (already signed in) or remembered creds
  useEffect(() => {
    (async () => {
      // If already signed in, bounce
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace(nextParam || "/");
        return;
      }

      // Try browser credential manager first
      const cred = await getWithCredentialAPI();
      if (cred?.email && cred?.password) {
        setEmail(cred.email);
        setPassword(cred.password);
        return;
      }

      // Fallback: localStorage
      try {
        const raw = localStorage.getItem(REMEMBER_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as RememberPayload;
          if (saved.email) setEmail(saved.email);
          if (saved.password) setPassword(saved.password);
          if (saved.autoSignIn) {
            setAutoSignIn(true);
            // small delay so inputs render
            setTimeout(() => {
              // auto sign-in if both exist
              if (saved.email && saved.password) {
                void signInWithEmailPassword();
              }
            }, 200);
          }
        }
      } catch {
        // ignore
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, nextParam]);

  async function persistRemember(e: string, p: string) {
    try {
      if (remember) {
        await storeWithCredentialAPI(e, p);
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: e, password: p, autoSignIn }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      // ignore
    }
  }

  async function signInWithEmailPassword(ev?: React.FormEvent) {
    ev?.preventDefault();
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
      await persistRemember(email, password);
      router.replace(nextParam || "/");
    }
  }

  async function sendPasswordSetup(e: React.FormEvent) {
    e.preventDefault();
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
    setMsg(
      "We’ve emailed you a secure link to set your password. Open it, set a password, then sign in."
    );
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
                />
                Auto sign-in
              </label>
            </div>

            <button className="btn btn-primary btn-compact" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <div className="flex items-center justify-between">
              <button className="btn btn-compact" onClick={sendPasswordSetup} disabled={!email || busy}>
                Forgot password?
              </button>
              <span className="text-xs text-gray-500">
                Sessions persist; use this only if you signed out or changed devices.
              </span>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            {msg && <p className="text-sm text-green-700">{msg}</p>}
            <p className="text-xs text-gray-500">
              Tip: Your browser’s password manager is the safest way to remember your login.
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
