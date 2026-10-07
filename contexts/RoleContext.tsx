'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_ROLE, type Role } from '@/lib/roles';

// null while loading or signed out, so role-gated UI never flashes in.
const RoleContext = createContext<Role | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let current = 0;

    async function load(userId: string | undefined) {
      const req = ++current;
      if (!userId) {
        setRole(null);
        return;
      }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (req === current) setRole((data?.role as Role | undefined) ?? DEFAULT_ROLE);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'MFA_CHALLENGE_VERIFIED') {
        // Supabase calls must not run inside this callback.
        setTimeout(() => load(session?.user.id), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/** null while loading or signed out. */
export function useRole() {
  return useContext(RoleContext);
}
