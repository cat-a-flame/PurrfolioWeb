import type { SupabaseClient, User } from '@supabase/supabase-js';

/** True when the user has finished setting up an authenticator app. */
export function hasVerifiedFactor(user: User | null): boolean {
  return !!user?.factors?.some(f => f.status === 'verified');
}

/** 2FA is on but this session hasn't entered a code yet (still aal1). */
export async function needsMfaCode(supabase: SupabaseClient, user: User | null): Promise<boolean> {
  if (!hasVerifiedFactor(user)) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.currentLevel !== 'aal2';
}

/** Keeps only the digits of a typed/pasted code, max 6. */
export function cleanCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}
