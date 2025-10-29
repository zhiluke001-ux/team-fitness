import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function Reset() {
  const router = useRouter();
  const [stage, setStage] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Handle all possible Supabase reset link styles:
  // 1) New PKCE code flow:     ?code=...
  // 2) PKCE token flow:        ?token_hash=...&type=recovery
  // 3) Legacy implicit flow:   #access_token=...&refresh_token=...
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (error) throw error;
        } else if (window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setStage("ready");
        } else {
          throw new Error("Invalid or expired reset link. Try sending a new one from the login page.");
        }
      } catch (e: any) {
        setStage("error");
        setError(e?.message ?? "Invalid or expired reset link. Try sending a new one from the login page.");
      }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }

    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); return; }

    setStage("done");
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
                  onChange={(e) => setPassword(e.target.value)}
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
                />
              </div>

              <button className="btn btn-primary btn-compact" type="submit">Save password</button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}

          {stage === "done" && (
            <p className="text-sm text-green-700">Password saved. Redirecting…</p>
          )}
        </div>
      </main>
    </>
  );
}
