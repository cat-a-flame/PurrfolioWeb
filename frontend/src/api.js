import { supabase } from './supabase.js';

function throwOnError(error) {
  if (error) throw new Error(error.message);
}

export const api = {
  summary: {
    get: async () => {
      const { data, error } = await supabase.from('transactions').select('type, amount');
      throwOnError(error);
      const total_income = data
        .filter(t => t.type === 'income')
        .reduce((s, t) => s + Number(t.amount), 0);
      const total_expenses = data
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + Number(t.amount), 0);
      return { total_income, total_expenses, total_balance: total_income - total_expenses };
    },
  },

  transactions: {
    list: async (filters = {}) => {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          category:categories(*),
          labels:transaction_labels(label:labels(*))
        `)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.type) query = query.eq('type', filters.type);
      if (filters.category_id) query = query.eq('category_id', filters.category_id);
      if (filters.date_from) query = query.gte('date', filters.date_from);
      if (filters.date_to) query = query.lte('date', filters.date_to);

      const { data, error } = await query;
      throwOnError(error);

      const transactions = data.map(t => ({
        ...t,
        labels: (t.labels || []).map(l => l.label).filter(Boolean),
      }));

      if (filters.label_id) {
        return transactions.filter(t => t.labels.some(l => l.id === filters.label_id));
      }

      return transactions;
    },

    create: async ({ label_ids = [], ...body }) => {
      const { data: tx, error } = await supabase
        .from('transactions')
        .insert(body)
        .select()
        .single();
      throwOnError(error);

      if (label_ids.length > 0) {
        const { error: ljError } = await supabase
          .from('transaction_labels')
          .insert(label_ids.map(label_id => ({ transaction_id: tx.id, label_id })));
        throwOnError(ljError);
      }

      return tx;
    },

    update: async (id, { label_ids = [], ...body }) => {
      const { data: tx, error } = await supabase
        .from('transactions')
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      throwOnError(error);

      const { error: delError } = await supabase
        .from('transaction_labels')
        .delete()
        .eq('transaction_id', id);
      throwOnError(delError);

      if (label_ids.length > 0) {
        const { error: ljError } = await supabase
          .from('transaction_labels')
          .insert(label_ids.map(label_id => ({ transaction_id: id, label_id })));
        throwOnError(ljError);
      }

      return tx;
    },

    delete: async (id) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      throwOnError(error);
    },
  },

  categories: {
    list: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');
      throwOnError(error);
      return data;
    },
    create: async (body) => {
      const { data, error } = await supabase
        .from('categories')
        .insert(body)
        .select()
        .single();
      throwOnError(error);
      return data;
    },
    delete: async (id) => {
      const { data: cat, error: fetchError } = await supabase
        .from('categories')
        .select('is_default')
        .eq('id', id)
        .single();
      throwOnError(fetchError);
      if (cat?.is_default) throw new Error('Cannot delete a default category.');
      const { error } = await supabase.from('categories').delete().eq('id', id);
      throwOnError(error);
    },
  },

  labels: {
    list: async () => {
      const { data, error } = await supabase.from('labels').select('*').order('name');
      throwOnError(error);
      return data;
    },
    create: async (body) => {
      const { data, error } = await supabase
        .from('labels')
        .insert(body)
        .select()
        .single();
      throwOnError(error);
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('labels').delete().eq('id', id);
      throwOnError(error);
    },
  },
};
