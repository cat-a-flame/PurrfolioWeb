'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toCurrentUser, type CurrentUser } from '@/lib/username';

const UserContext = createContext<CurrentUser | null>(null);

// Lives in the root layout so it survives navigation; seeded on the server so the first paint has the name.
export function UserProvider({
  initialUser,
  children,
}: {
  initialUser: CurrentUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<CurrentUser | null>(initialUser);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null);
      else if (session?.user) setUser(toCurrentUser(session.user));
    });
    return () => subscription.unsubscribe();
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** null when signed out. */
export function useCurrentUser() {
  return useContext(UserContext);
}
