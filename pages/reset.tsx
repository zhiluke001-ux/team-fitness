// pages/reset.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

/** Flip to false after you finish troubleshooting */
const TEMP_DEBUG = true;

function hasPkceVerifier(): boolean {
  try {
    if (typeof window === "undefined") return false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-pkce-code-verifier")) return true;
    }
  } catch {}
  return false;
}

async function waitForSession(msTotal = 3500, step = 200) {
  const tries = Math.ceil(msTotal / step);
  for (let i = 0; i < tries; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return true;
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

export default function Reset() {
  const router = useRouter();
  const [stage, setStage] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [welcome, setWelcome] = useState(false); // show “welcome” banner for new signups

  // Memoized helper to read current URL safely in CSR
  const urlInfo = useMemo(() => {
    if (typeof window === "undefined") return null;
    const u = new URL(window.location.href);
    return {
      full: u.toString(),
      params: u.searchParams,
    };
  }, [typeof window !== "undefined" ? window.location.href : ""]);

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);

        // Surface error from Supabase (e.g., invalid/expired)
        const errCode = url.searchParams.get("error_code");
        const errDesc = url.searchParams.get("error_description");
        if (errCode || errDesc) throw new Error(errDesc || errCode || "Invalid or expired link.");

        // If already signed in, allow password change immediately
        const preSess = await supabase.auth.getSession();
        const preUser = await supabase.auth.getUser();

        if (TEMP_DEBUG) {
          console.group("RESET DEBUG");
          console.log("full URL:", url.toString());
          console.log("query:", Object.fromEntries(url.searchParams.entries()));
          console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
          console.log("pre.getSession:", preSess);
          console.log("pre.getUser:", preUser);
          console.groupEnd();
        }

        // Decide whether to show welcome note (signup flow)
        const qNew = url.searchParams.get("new") === "1";
        const qType = (url.searchParams.get("type") as EmailOtpType | null) ?? null;
        if (qNew || qType === "signup") setWelcome(true);

        if (preSess.data.session?.user) {
          setStage("ready");
          return;
        }

        // Extract tokens
        const tokenHash =
          url.searchParams.get("token_hash") ||
          url.searchParams.get("token") ||
          "";
        const code = url.searchParams.get("code") || "";

        let ok = false;

        // 1) Verify typed tokens: recovery/signup/email_change/invite
        if (!ok && tokenHash && qType) {
          // Supabase accepts: 'recovery' | 'signup' | 'email_change' | 'invite' | 'magiclink'
          const { error } = await supabase.auth.verifyOtp({ type: qType, token_hash: tokenHash });
          if (TEMP_DEBUG) console.log("verifyOtp:", { type: qType, tokenHash: tokenHash.slice(0, 8) + "…" }, "error:", error);
          if (error) throw error;
          ok = true;
        }

        // 2) PKCE code → exchange only if a verifier exists
        if (!ok && code && hasPkceVerifier()) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (TEMP_DEBUG) console.log("exchangeCodeForSession error:", error);
          if (error) throw error;
          ok = true;
        }

        // 3) Legacy implicit hash (#access_token & #refresh_token)
        if (!ok && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (TEMP_DEBUG) console.log("setSession (legacy) error:", error);
            if (error) throw error;
            ok = true;

            // clean hash from URL
            const cleaned = new URL(window.location.href);
            cleaned.hash = "";
            window.history.replaceState({}, "", cleaned.toString());
          }
        }

        // Wait briefly for the SDK to populate session
        if (ok) {
          const ready = await waitForSession();
          if (!ready) throw new Error("Invalid or expired link. Try sending a new one.");
          setStage("ready");
          return;
        }

        // Final check in case session arrived late
        const final = await supabase.auth.getSession();
        if (final.data.session?.user) {
          setStage("ready");
          return;
        }

        throw new Error("Invalid or expired link. Try sending a new one.");
      } catch (e: any) {
        setStage("error");
        setError(String(e?.message || "Invalid or expired link. Try sending a new one."));
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setError(error.message);

    setStage("done");
    // After setting password, send user home; onboarding there will create profile (name + team)
    setTimeout(() => router.replace("/"), 800);
  }

  return (
    <>
      <Head><title>Set Password – {SITE_NAME}</title></Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Set your password</h1>

          {stage === "checking" && (
            <p className="text-sm text-gray-600">Preparing your reset session…</p>
          )}

          {stage === "error" && (
            <p className="text-sm text-red-600">
              {error || "Invalid or expired link. Try sending a new one from the login page."}
            </p>
          )}

          {stage === "ready" && (
            <>
              {welcome && (
                <div className="mb-3 p-3 rounded-md bg-emerald-50 text-emerald-800 text-sm">
                  Welcome! Create a password to activate your account. You’ll be asked to set your display
                  name and choose a team next.
                </div>
              )}
              <form onSubmit={submit} className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">New password</label>
                  <input
                    type="password"
                    required
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">Confirm password</label>
                  <input
                    type="password"
                    required
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <button className="btn btn-primary btn-compact" type="submit">
                  Save password
                </button>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </form>
            </>
          )}

          {stage === "done" && (
            <p className="text-sm text-green-700">Password saved. Redirecting…</p>
          )}
        </div>
      </main>
    </>
  );
}
