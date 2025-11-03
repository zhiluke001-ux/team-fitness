// pages/reset.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

/** Turn off after troubleshooting */
const TEMP_DEBUG = true;

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
  const [welcome, setWelcome] = useState(false); // show for first-time signup flow

  // for safe console printing
  const urlInfo = useMemo(() => {
    if (typeof window === "undefined") return null;
    const u = new URL(window.location.href);
    return { full: u.toString(), params: u.searchParams };
  }, [typeof window !== "undefined" ? window.location.href : ""]);

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);

        // If Supabase returned explicit error
        const errCode = url.searchParams.get("error_code");
        const errDesc = url.searchParams.get("error_description");
        if (errCode || errDesc) throw new Error(errDesc || errCode || "Invalid or expired link.");

        // Show welcome note for signup confirmations
        const qNew = url.searchParams.get("new") === "1";
        const qType = (url.searchParams.get("type") as EmailOtpType | null) ?? null;
        if (qNew || qType === "signup") setWelcome(true);

        // Log pre-state
        const preSess = await supabase.auth.getSession();
        const preUser = await supabase.auth.getUser(); // may return AuthSessionMissingError if not signed in (safe to ignore)
        if (TEMP_DEBUG) {
          console.group("RESET DEBUG");
          console.log("full URL:", url.toString());
          console.log("query:", Object.fromEntries(url.searchParams.entries()));
          console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
          console.log("pre.getSession:", preSess);
          console.log("pre.getUser:", preUser);
          console.groupEnd();
        }

        // If already signed in, go straight to password form
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

        // 1) Prefer typed verification (recovery / signup / invite / email_change / magiclink)
        if (!ok && tokenHash && qType) {
          const { error } = await supabase.auth.verifyOtp({ type: qType, token_hash: tokenHash });
          if (TEMP_DEBUG) console.log("verifyOtp:", { type: qType, tokenHash: tokenHash.slice(0, 8) + "…" }, "error:", error);
          if (error) throw error;
          ok = true;
        }

        // 2) If we have a PKCE code, ALWAYS try to exchange it (no localStorage gate)
        if (!ok && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (TEMP_DEBUG) console.log("exchangeCodeForSession:", { data, error });
          if (error) {
            // surface a clearer message for the common verifier mismatch/missing cases
            const msg = (error.message || "").toLowerCase();
            const hint =
              msg.includes("code_verifier") || msg.includes("verifier") || msg.includes("pkce")
                ? "This confirmation link couldn’t be verified in this browser session. Please request a new email and open it in the same browser you used to click “Forgot password”."
                : error.message;
            throw new Error(hint || "Could not verify the confirmation code.");
          }
          ok = true;
        }

        // 3) Legacy implicit flow via URL hash (#access_token & #refresh_token)
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

        // Wait for session population
        if (ok) {
          const ready = await waitForSession();
          if (!ready) throw new Error("Invalid or expired link. Try sending a new one.");
          setStage("ready");
          return;
        }

        // Final chance
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
    // After saving password, index page will drive onboarding (display name + team)
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
