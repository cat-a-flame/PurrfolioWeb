'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBaseCurrency, LEGACY_BASE_CURRENCY } from '@/lib/baseCurrency';
import { isPublicPath } from '@/lib/publicPaths';
import { useCurrentUser } from '@/contexts/UserContext';
import { formatCurrency } from '@/lib/utils';
import type { Currency } from '@/lib/types';

interface BaseCurrencyValue {
  /** Falls back to HUF until the real value is known, so pages can render without a guard. */
  baseCurrency: Currency;
  /** True once the base currency is saved on the user. */
  resolved: boolean;
  setBaseCurrency: (currency: Currency | null) => Promise<boolean>;
}

const BaseCurrencyContext = createContext<BaseCurrencyValue>({
  baseCurrency: LEGACY_BASE_CURRENCY,
  resolved: false,
  setBaseCurrency: async () => false,
});

// Lives in the root layout, seeded on the server. A user without a saved base currency is either
// from before this existed (has transactions, stays on HUF) or new (sent to /onboarding).
export function BaseCurrencyProvider({
  initialBaseCurrency,
  children,
}: {
  initialBaseCurrency: Currency | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const [base, setBase] = useState<Currency | null>(initialBaseCurrency);

  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setBase(null);
      else if (session?.user) setBase(getBaseCurrency(session.user));
    });
    return () => subscription.unsubscribe();
  }, []);

  const setBaseCurrency = useCallback(async (currency: Currency | null) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: { base_currency: currency } });
    if (error) return false;
    setBase(currency);
    return true;
  }, []);

  const checkable = !!user && base === null && !isPublicPath(pathname) && pathname !== '/mfa';

  useEffect(() => {
    if (!checkable) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true });
      if (cancelled || error) return;
      if ((count ?? 0) > 0) {
        // Existing user: their stored rates are in HUF.
        await setBaseCurrency(LEGACY_BASE_CURRENCY);
      } else if (pathname !== '/onboarding') {
        router.replace('/onboarding');
      }
    })();
    return () => { cancelled = true; };
  }, [checkable, pathname, router, setBaseCurrency]);

  const value = useMemo<BaseCurrencyValue>(() => ({
    baseCurrency: base ?? LEGACY_BASE_CURRENCY,
    resolved: base !== null,
    setBaseCurrency,
  }), [base, setBaseCurrency]);

  return <BaseCurrencyContext.Provider value={value}>{children}</BaseCurrencyContext.Provider>;
}

export function useBaseCurrencyState() {
  return useContext(BaseCurrencyContext);
}

export function useBaseCurrency(): Currency {
  return useContext(BaseCurrencyContext).baseCurrency;
}

/** Formats an amount in the user's base currency. */
export function useFormatBase() {
  const base = useBaseCurrency();
  return useCallback((amount: number) => formatCurrency(amount, base), [base]);
}
