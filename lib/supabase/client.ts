import { createBrowserClient } from '@supabase/ssr';
import { createClient as createPlainClient } from '@supabase/supabase-js';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * True when `password` is the account's current password. Signs in on a
 * throwaway in-memory client, so the real session (and its 2FA level) is left
 * untouched, then revokes that extra session straight away.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const temp = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'purrfolio-verify-password',
      },
    }
  );
  const { error } = await temp.auth.signInWithPassword({ email, password });
  if (error) return false;
  await temp.auth.signOut({ scope: 'local' });
  return true;
}
