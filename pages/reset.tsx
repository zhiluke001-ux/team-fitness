// pages/reset.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

export default function Reset() {
  const router = useRouter();
  const [stage, setStage] = useState<"checking" | "ready" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | undefined;

    async function init() {
      try {
        const href = typeof window !== "undefined" ? window.location.href : "";
        const url = new URL(href);
        const code = url.searchParams.get("code");

        // --- PKCE flow: exchange ?code= for a session
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) {
            setError(exErr.message || "Could not complete password reset.");
            setStage("error");
            return;
          }
          setStage("ready");
          return;
        }

        // --- Fallback (hash-token/password recovery)
        const { data: first } = await supabase.auth.getSession();
        if (first.session?.user) {
          setStage("ready");
          return;
        }

        const listener = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
            setStage("ready");
          }
        });
        unsub = listener.data;

        // Give the SDK a moment to parse the hash (if any)
        setTimeout(async () => {
          const { data: again } = await supabase.auth.getSession();
          if (!again.session?.user) setStage("error");
        }, 800);
      } catch (e: any) {
        setError(e?.message || "Unexpected error.");
        setStage("error");
      }
    }

    init();
    return () => {
      try { unsub?.unsubscribe?.(); } catch {}
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setStage("error"); return; }

    setStage("done");
    // Optional: small delay then go home
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
              <button className="btn btn-primary btn-compact" type="submit">
                Save password
              </button>
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
