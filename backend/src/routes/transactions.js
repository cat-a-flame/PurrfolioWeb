import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { type, category_id, label_id, date_from, date_to } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*),
        transaction_labels(
          label:labels(*)
        )
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (category_id) query = query.eq('category_id', category_id);
    if (date_from) query = query.gte('date', date_from);
    if (date_to) query = query.lte('date', date_to);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    let transactions = data.map(t => ({
      ...t,
      labels: t.transaction_labels.map(tl => tl.label).filter(Boolean),
      transaction_labels: undefined,
    }));

    if (label_id) {
      transactions = transactions.filter(t =>
        t.labels.some(l => l.id === label_id)
      );
    }

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*),
        transaction_labels(
          label:labels(*)
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: 'Transaction not found' });

    const transaction = {
      ...data,
      labels: data.transaction_labels.map(tl => tl.label).filter(Boolean),
      transaction_labels: undefined,
    };

    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { type, amount, category_id, date, notes, label_ids = [] } = req.body;

    if (!type || !amount || !date) {
      return res.status(400).json({ error: 'type, amount, and date are required' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type must be income or expense' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be positive' });
    }

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({ type, amount, category_id: category_id || null, date, notes: notes || null })
      .select()
      .single();

    if (txError) return res.status(500).json({ error: txError.message });

    if (label_ids.length > 0) {
      const junctionRows = label_ids.map(lid => ({
        transaction_id: transaction.id,
        label_id: lid,
      }));
      const { error: labelError } = await supabase
        .from('transaction_labels')
        .insert(junctionRows);
      if (labelError) return res.status(500).json({ error: labelError.message });
    }

    const { data: full, error: fullError } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*),
        transaction_labels(
          label:labels(*)
        )
      `)
      .eq('id', transaction.id)
      .single();

    if (fullError) return res.status(500).json({ error: fullError.message });

    res.status(201).json({
      ...full,
      labels: full.transaction_labels.map(tl => tl.label).filter(Boolean),
      transaction_labels: undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { type, amount, category_id, date, notes, label_ids = [] } = req.body;

    const updates = {};
    if (type !== undefined) {
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'type must be income or expense' });
      }
      updates.type = type;
    }
    if (amount !== undefined) {
      if (amount <= 0) return res.status(400).json({ error: 'amount must be positive' });
      updates.amount = amount;
    }
    if (category_id !== undefined) updates.category_id = category_id || null;
    if (date !== undefined) updates.date = date;
    if (notes !== undefined) updates.notes = notes || null;
    updates.updated_at = new Date().toISOString();

    const { error: txError } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', req.params.id);

    if (txError) return res.status(500).json({ error: txError.message });

    await supabase
      .from('transaction_labels')
      .delete()
      .eq('transaction_id', req.params.id);

    if (label_ids.length > 0) {
      const junctionRows = label_ids.map(lid => ({
        transaction_id: req.params.id,
        label_id: lid,
      }));
      const { error: labelError } = await supabase
        .from('transaction_labels')
        .insert(junctionRows);
      if (labelError) return res.status(500).json({ error: labelError.message });
    }

    const { data: full, error: fullError } = await supabase
      .from('transactions')
      .select(`
        *,
        category:categories(*),
        transaction_labels(
          label:labels(*)
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (fullError) return res.status(404).json({ error: 'Transaction not found' });

    res.json({
      ...full,
      labels: full.transaction_labels.map(tl => tl.label).filter(Boolean),
      transaction_labels: undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
