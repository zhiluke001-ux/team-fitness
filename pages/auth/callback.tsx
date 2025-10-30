import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";
import type { EmailOtpType } from "@supabase/supabase-js";

function hasPkceVerifier(): boolean {
  try {
    if (typeof window === "undefined") return false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-pkce-code-verifier")) return true;
    }
  } catch {}
  return false;
}

export default function AuthCallback() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const next = url.searchParams.get("next") ?? "/";
        const code = url.searchParams.get("code") || "";
        const token_hash = url.searchParams.get("token_hash") || "";
        const type = (url.searchParams.get("type") as EmailOtpType | null) ?? null;

        let ok = false;

        // If it's a recovery flow, prefer token_hash verify (reset should not require PKCE)
        if (type === "recovery" && token_hash) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash });
          if (error) throw error;
          ok = true;
        } else {
          // PKCE only if verifier exists
          if (code && hasPkceVerifier()) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              // fallback to token_hash if present
              if (token_hash && type) {
                const { error: vErr } = await supabase.auth.verifyOtp({ type, token_hash });
                if (vErr) throw error;
                ok = true;
              } else {
                throw error;
              }
            } else {
              ok = true;
            }
          }

          if (!ok && token_hash && type) {
            const { error } = await supabase.auth.verifyOtp({ type, token_hash });
            if (error) throw error;
            ok = true;
          }

          if (!ok && window.location.hash) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const access_token = params.get("access_token");
            const refresh_token = params.get("refresh_token");
            if (access_token && refresh_token) {
              const { error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (error) throw error;
              ok = true;
            }
          }
        }

        if (ok) {
          router.replace(next);
        } else {
          router.replace("/login?msg=invalid_link");
        }
      } catch (e: any) {
        const msg = String(e?.message || "");
        setErr(
          /code.*verifier/i.test(msg)
            ? "This link expects a PKCE verifier that isn't present. Please try again from the same browser you requested it from."
            : msg || "Unexpected error"
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
