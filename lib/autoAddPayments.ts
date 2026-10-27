import { createClient } from '@/lib/supabase/client';
import { generateDueDates, isoDate } from '@/lib/recurringUtils';
import type { RecurringPayment } from '@/lib/types';

let inFlight: Promise<number> | null = null;

// Records every auto-add recurring payment that is due today and not yet actioned.
// Returns how many transactions were created.
export function autoAddDuePayments(): Promise<number> {
  if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

async function run(): Promise<number> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const today = new Date();
  const todayIso = isoDate(today);
  const start = new Date(today); start.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setHours(23, 59, 59, 999);

  const [pmtRes, occRes] = await Promise.all([
    supabase.from('recurring_payments')
      .select('*, labels:recurring_payment_labels(label_id)')
      .eq('user_id', user.id).eq('is_active', true).eq('auto_add', true),
    supabase.from('recurring_occurrences').select('recurring_payment_id').eq('user_id', user.id).eq('due_date', todayIso),
  ]);
  const payments = (pmtRes.data ?? []) as (Omit<RecurringPayment, 'labels'> & { labels: { label_id: string }[] })[];
  if (payments.length === 0) return 0;

  const actioned = new Set((occRes.data ?? []).map(o => o.recurring_payment_id));
  let added = 0;
  for (const p of payments) {
    if (actioned.has(p.id) || generateDueDates(p, start, end).length === 0) continue;

    const { data: tx, error } = await supabase.from('transactions')
      .insert({
        user_id: user.id, type: p.type, amount: p.amount, wallet_id: p.wallet_id,
        category_id: p.category_id, date: todayIso, notes: p.notes, payer: p.payer,
      })
      .select('id').single();
    if (error || !tx) continue;

    const { error: occErr } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: p.id, user_id: user.id, due_date: todayIso, status: 'paid', transaction_id: tx.id,
    });
    if (occErr) {
      // Without the occurrence it would be added again on the next run.
      await supabase.from('transactions').delete().eq('id', tx.id);
      continue;
    }
    if (p.labels.length > 0) {
      await supabase.from('transaction_labels').insert(
        p.labels.map(l => ({ transaction_id: tx.id, label_id: l.label_id }))
      );
    }
    added++;
  }
  if (added > 0) window.dispatchEvent(new Event('transaction-added'));
  return added;
}
