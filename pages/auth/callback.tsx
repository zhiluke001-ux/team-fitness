import { useRouter } from "next/router";
import { useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const code = router.query.code as string | undefined;
      try {
        if (code) await supabase.auth.exchangeCodeForSession(code);
      } catch {
        // ignore
      } finally {
        const next = (router.query.next as string) || "/";
        router.replace(next);
      }
    })();
  }, [router]);

  return <p style={{ padding: 16 }}>Signing you in…</p>;
}
