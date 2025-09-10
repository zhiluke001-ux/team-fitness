import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        const url = new URL(window.location.href);
        const next = url.searchParams.get("next") ?? "/";

        // PKCE token_hash flow
        const token_hash = url.searchParams.get("token_hash");
        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;
        if (token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash });
          if (error) throw error;
          router.replace(next);
          return;
        }

        // Implicit hash flow (#access_token)
        if (window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token
            });
            if (error) throw error;
            router.replace(next);
            return;
          }
        }

        router.replace("/login?msg=invalid_link");
      } catch (e: any) {
        console.error(e);
        setErr(e?.message ?? "Unexpected error");
      }
    }
    run();
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-xl font-semibold mb-2">Signing you in…</h1>
        <p className="text-gray-600">Please wait a moment.</p>
        {err && <p className="mt-4 text-red-600 text-sm">{err}</p>}
      </div>
    </div>
  );
}
