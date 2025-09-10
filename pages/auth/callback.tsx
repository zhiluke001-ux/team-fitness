// pages/auth/callback.tsx
import { useRouter } from "next/router";
import { useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // figure out where to send the user after we finish
      const nextParam = (router.query.next as string) || "/";
      const goNext = () => router.replace(nextParam);

      try {
        // 1) New flow: ?code=...
        const code = router.query.code as string | undefined;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          return goNext();
        }

        // 2) Old/hash flow: #access_token=...&refresh_token=...
        if (typeof window !== "undefined" && window.location.hash) {
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            return goNext();
          }
        }

        // 3) Nothing usable found — just try to continue (maybe already signed in)
        const { data } = await supabase.auth.getSession();
        if (data.session) return goNext();

      } catch (e) {
        // ignore and fall through to redirect
      }
      goNext();
    })();
  }, [router]);

  return <p style={{ padding: 16 }}>Signing you in…</p>;
}
