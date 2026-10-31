import type { SupabaseClient } from '@supabase/supabase-js';

/** Attach the same labels to every given transaction (e.g. both legs of a transfer). */
export async function attachLabels(
  supabase: SupabaseClient,
  inserted: { id: string }[] | null,
  labelIds: string[],
) {
  if (!inserted || inserted.length === 0 || labelIds.length === 0) return;
  await supabase.from('transaction_labels').insert(
    inserted.flatMap(tx => labelIds.map(lid => ({ transaction_id: tx.id, label_id: lid })))
  );
}
