import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

export default function Reset() {
  const router = useRouter();
  const [stage, setStage] = useState<"checking"|"ready"|"done"|"error">("checking");
  const [error, setError] = useState<string|null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // If the user opens the reset link, Supabase will put an access token in the URL hash.
  // We accept it via supabase.auth.onAuthStateChange() automatically; just render a form to set a new password.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        // If no session yet, wait a tick—Supabase SDK will process the hash token automatically.
        setTimeout(async () => {
          const again = await supabase.auth.getSession();
          if (!again.data.session?.user) setStage("error"); else setStage("ready");
        }, 400);
      } else {
        setStage("ready");
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
    // Go home (keeps ?week if present)
    router.replace("/");
  }

  return (
    <>
      <Head><title>Set Password – {SITE_NAME}</title></Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Set your password</h1>
          {stage === "checking" && <p className="text-sm text-gray-600">Preparing your reset session…</p>}
          {stage === "error" && <p className="text-sm text-red-600">Invalid or expired reset link. Try sending a new one from the login page.</p>}
          {stage === "ready" && (
            <form onSubmit={submit} className="grid grid-cols-1 gap-3">
              <div>
                <label className="label">New password</label>
                <input type="password" required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} />
              </div>
              <div>
                <label className="label">Confirm password</label>
                <input type="password" required className="input" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />
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
