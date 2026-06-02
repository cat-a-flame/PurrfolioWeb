'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { generateDueDates, isoDate, monthBounds } from '@/lib/recurringUtils';
import type { RecurringPayment, RecurringOccurrence } from '@/lib/types';

const RecurringAlertContext = createContext(false);

export function RecurringAlertProvider({ children }: { children: React.ReactNode }) {
  const [hasUrgent, setHasUrgent] = useState(false);

  const check = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date();
    const todayIso = isoDate(today);
    const [from, to] = monthBounds(today.getFullYear(), today.getMonth());

    const [pmtRes, occRes] = await Promise.all([
      supabase.from('recurring_payments').select('id,start_date,end_date,frequency,is_active').eq('user_id', user.id).eq('is_active', true),
      supabase.from('recurring_occurrences').select('recurring_payment_id,due_date').eq('user_id', user.id)
        .gte('due_date', isoDate(from)).lte('due_date', isoDate(to)),
    ]);

    const payments = (pmtRes.data ?? []) as RecurringPayment[];
    const occurrences = (occRes.data ?? []) as RecurringOccurrence[];
    const actionedKeys = new Set(occurrences.map(o => `${o.recurring_payment_id}|${o.due_date.slice(0, 10)}`));

    let urgent = false;
    outer: for (const p of payments) {
      for (const date of generateDueDates(p, from, to)) {
        const key = `${p.id}|${isoDate(date)}`;
        if (!actionedKeys.has(key) && isoDate(date) <= todayIso) {
          urgent = true;
          break outer;
        }
      }
    }
    setHasUrgent(urgent);
  }, []);

  useEffect(() => {
    check();
    window.addEventListener('transaction-added', check);

    const supabase = createClient();
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return;
      channel = supabase
        .channel('recurring-alert-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_occurrences', filter: `user_id=eq.${user.id}` }, check)
        .subscribe();
    });

    return () => {
      mounted = false;
      window.removeEventListener('transaction-added', check);
      if (channel) supabase.removeChannel(channel);
    };
  }, [check]);

  return (
    <RecurringAlertContext.Provider value={hasUrgent}>
      {children}
    </RecurringAlertContext.Provider>
  );
}

export function useRecurringAlert() {
  return useContext(RecurringAlertContext);
}
