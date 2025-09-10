// lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { GetServerSidePropsContext } from 'next';
import { serialize } from 'cookie';

export function createServerSupabaseClient(ctx: GetServerSidePropsContext) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return ctx.req.cookies[name];
        },
        set(name: string, value: string, options: CookieOptions) {
          ctx.res.setHeader('Set-Cookie', serialize(name, value, options));
        },
        remove(name: string, options: CookieOptions) {
          ctx.res.setHeader('Set-Cookie', serialize(name, '', { ...options, maxAge: 0 }));
        },
      },
    }
  );
}
