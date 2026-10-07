import type { User } from '@supabase/supabase-js';

// The mobile app stores the username as `name` (or `full_name`); older web signups used `username`.
export function getUsername(user: User | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  return (meta.name ?? meta.full_name ?? meta.username ?? '') as string;
}
