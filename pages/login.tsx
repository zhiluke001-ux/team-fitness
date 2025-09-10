import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SITE_NAME } from "../utils/constants";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        const next = (router.query.next as string) || "/";
        router.replace(next);
      }
    })();
  }, [router]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setErr(undefined);
    setMsg(undefined);
    try {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const redirectTo = `${site}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true
        }
      });
      if (error) {
        setErr(error.message);
        return;
      }
      setMsg("Magic link sent! Check your email and open it on this device.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Head>
        <title>Login — {SITE_NAME}</title>
      </Head>
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-semibold mb-2">Login — {SITE_NAME}</h1>
          <p className="text-sm text-gray-600 mb-4">
            Enter your email to receive a magic link.
          </p>
          <form onSubmit={sendLink} className="grid gap-3">
            <input
              type="email"
              required
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn-primary btn-compact" disabled={sending}>
              {sending ? "Sending…" : "Send magic link"}
            </button>
          </form>
          {msg && <p className="text-sm text-green-700 mt-3">{msg}</p>}
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        </div>
      </main>
    </>
  );
}
