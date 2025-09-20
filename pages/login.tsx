// pages/login.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextParam = typeof router.query.next === "string" ? router.query.next : "/";

  // If already logged in, go where they intended
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace(nextParam || "/");
      }
    })();
  }, [router, nextParam]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);

    // Use current origin in client; fallback to configured env or prod domain
    const redirectTo =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "https://atag-team-fitness.vercel.app";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo, // must be allowed in Supabase Auth settings
      },
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <>
      <Head>
        <title>Login – {SITE_NAME}</title>
      </Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-xl font-semibold mb-2">Login to {SITE_NAME}</h1>
          <p className="text-xs text-gray-600 mb-4">
            Enter your email and we&apos;ll send you a magic link.
          </p>
          <form onSubmit={sendMagicLink} className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-compact" type="submit">
              Send magic link
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {sent && (
              <p className="text-sm text-green-700">
                Magic link sent! Check your email and open the link in your browser.
              </p>
            )}
          </form>
        </div>
      </main>
    </>
  );
}
