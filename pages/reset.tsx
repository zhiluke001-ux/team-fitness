import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

/** Flip to `false` after you've finished debugging */
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

        // 0) Surface any error Supabase appended
        const errCode = url.searchParams.get("error_code");
        const errDesc = url.searchParams.get("error_description");
        if (errCode || errDesc) {
          throw new Error(errDesc || errCode || "Invalid or expired reset link.");
        }

        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;

        // Supabase may provide ?token_hash=... or ?token=...
        const tokenHash =
          url.searchParams.get("token_hash") ||
          url.searchParams.get("token") ||
          "";
        const code = url.searchParams.get("code") || "";

        if (TEMP_DEBUG) {
          // Safe debug logging
          console.group("RESET DEBUG");
          console.log("full URL:", url.toString());
          console.log("query:", Object.fromEntries(url.searchParams.entries()));
          console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
          const preSess = await supabase.auth.getSession();
          console.log("pre.getSession:", preSess);
          const preUser = await supabase.auth.getUser();
          console.log("pre.getUser:", preUser);
          console.groupEnd();
        }

        let ok = false;

        // 1) Preferred recovery path (password resets)
        if (type === "recovery") {
          if (!tokenHash) throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
          const res1 = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (TEMP_DEBUG) console.log("verifyOtp result:", res1);
          if (res1.error) throw res1.error;
          ok = true;
        } else {
          // 2) PKCE path (only if a verifier actually exists)
          if (code && hasPkceVerifier()) {
            const res2 = await supabase.auth.exchangeCodeForSession(code);
            if (TEMP_DEBUG) console.log("exchangeCodeForSession result:", res2);
            if (res2.error) {
              // Try token fallback if present
              if (tokenHash && type) {
                const res3 = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
                if (TEMP_DEBUG) console.log("verifyOtp (fallback) result:", res3);
                if (res3.error) throw res2.error; // keep original PKCE error
                ok = true;
              } else {
                throw res2.error;
              }
            } else {
              ok = true;
            }
          }

          // 3) Token fallback if we didn’t already succeed and token exists
          if (!ok && tokenHash && type) {
            const res4 = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
            if (TEMP_DEBUG) console.log("verifyOtp (late) result:", res4);
            if (res4.error) throw res4.error;
            ok = true;
          }

          // 4) Legacy implicit flow via URL hash
          if (!ok && window.location.hash) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const access_token = params.get("access_token");
            const refresh_token = params.get("refresh_token");
            if (access_token && refresh_token) {
              const res5 = await supabase.auth.setSession({ access_token, refresh_token });
              if (TEMP_DEBUG) console.log("setSession (legacy) result:", res5);
              if (res5.error) throw res5.error;
              ok = true;
            }
          }
        }

        // 5) Wait briefly for session population
        if (ok) {
          const ready = await waitForSession();
          if (TEMP_DEBUG) {
            const postSess = await supabase.auth.getSession();
            console.log("post.getSession (final):", postSess);
          }
          if (!ready) throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
          setStage("ready");
          return;
        }

        throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
      } catch (e: any) {
        const msg = String(e?.message || "");
        setStage("error");
        setError(msg);
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
