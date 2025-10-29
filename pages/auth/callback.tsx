import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const next = url.searchParams.get("next") ?? "/";

        const code = url.searchParams.get("code");
        const token_hash = url.searchParams.get("token_hash");
        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;

        let ok = false;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) ok = true;
          else if (token_hash && type) {
            const { error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });
            if (!vErr) ok = true;
            else throw error;
          } else {
            throw error;
          }
        }

        if (!ok && token_hash && type) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash });
          if (!error) ok = true;
        }

        if (!ok && window.location.hash) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (!error) ok = true;
          }
        }

        if (ok) {
          router.replace(next);
        } else {
          router.replace("/login?msg=invalid_link");
        }
      } catch (e: any) {
        console.error(e);
        setErr(
          e?.message?.includes("code challenge")
            ? "This link was opened in a different browser or the request expired. Please try again from the same browser."
            : e?.message ?? "Unexpected error"
        );
      }
    })();
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
