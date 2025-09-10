import { useEffect, useState } from "react";
import Head from "next/head";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.replace("/");
    });
    return () => sub.data.subscription.unsubscribe();
  }, [router]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined }
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <>
      <Head><title>Login • Team Fitness</title></Head>
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-2xl font-bold mb-2">Sign in</h1>
          <p className="text-sm text-gray-600 mb-4">We’ll email you a magic link.</p>
          {sent ? (
            <p className="text-sm">Check your inbox to finish signing in.</p>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-3">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} />
              </div>
              <button className="btn btn-primary w-full" type="submit">Send magic link</button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}
        </div>
      </main>
    </>
  );
}
