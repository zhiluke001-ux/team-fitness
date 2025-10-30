// pages/reset.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

/** Turn off after you’re done troubleshooting */
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

async function waitForSession(msTotal = 3000, step = 200) {
  const tries = Math.ceil(msTotal / step);
  for (let i = 0; i < tries; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return true;
    await new Promise(r => setTimeout(r, step));
  }
  return false;
}

export default function Reset() {
  const router = useRouter();
  const [stage, setStage] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);

        // Show any error passed back from Supabase
        const errCode = url.searchParams.get("error_code");
        const errDesc = url.searchParams.get("error_description");
        if (errCode || errDesc) {
          throw new Error(errDesc || errCode || "Invalid or expired reset link.");
        }

        // If you’re already signed in, just allow password change
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
        if (preSess.data.session?.user) {
          setStage("ready");
          return;
        }

        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;
        // Supabase may provide ?token_hash=... or ?token=...
        const tokenHash =
          url.searchParams.get("token_hash") ||
          url.searchParams.get("token") ||
          "";
        const code = url.searchParams.get("code") || "";

        let ok = false;

        // Preferred recovery path (password reset emails)
        if (type === "recovery" && tokenHash) {
          const res1 = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (TEMP_DEBUG) console.log("verifyOtp result:", res1);
          if (res1.error) throw res1.error;
          ok = true;
        }

        // PKCE code path (only if we actually have a stored verifier)
        if (!ok && code && hasPkceVerifier()) {
          const res2 = await supabase.auth.exchangeCodeForSession(code);
          if (TEMP_DEBUG) console.log("exchangeCodeForSession result:", res2);
          if (res2.error) throw res2.error;
          ok = true;
        }

        // Legacy implicit hash fallback (#access_token, #refresh_token)
        if (!ok && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const res3 = await supabase.auth.setSession({ access_token, refresh_token });
            if (TEMP_DEBUG) console.log("setSession (legacy) result:", res3);
            if (res3.error) throw res3.error;
            ok = true;
          }
        }

        // If we did any of the above, give the SDK a moment to populate session
        if (ok) {
          const ready = await waitForSession();
          if (!ready) throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
          setStage("ready");
          return;
        }

        // If nothing matched, we still might allow password change if user ends up signed-in by the time this runs
        const final = await supabase.auth.getSession();
        if (final.data.session?.user) {
          setStage("ready");
          return;
        }

        throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
      } catch (e: any) {
        setStage("error");
        setError(String(e?.message || "Invalid or expired reset link. Try sending a new one from the login page."));
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
    setTimeout(() => router.replace("/"), 800);
  }

  return (
    <>
      <Head><title>Set Password – {SITE_NAME}</title></Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Set your password</h1>

          {stage === "checking" && <p className="text-sm text-gray-600">Preparing your reset session…</p>}

          {stage === "error" && (
            <p className="text-sm text-red-600">
              {error || "Invalid or expired reset link. Try sending a new one from the login page."}
            </p>
          )}

          {stage === "ready" && (
            <form onSubmit={submit} className="grid grid-cols-1 gap-3">
              <div>
                <label className="label">New password</label>
                <input
                  type="password"
                  required
                  className="input"
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input
                  type="password"
                  required
                  className="input"
                  value={confirm}
                  onChange={(e)=>setConfirm(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-compact" type="submit">Save password</button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}

          {stage === "done" && <p className="text-sm text-green-700">Password saved. Redirecting…</p>}
        </div>
      </main>
    </>
  );
}
