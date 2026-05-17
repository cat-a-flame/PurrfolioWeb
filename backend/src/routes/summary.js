import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('type, amount');

    if (error) return res.status(500).json({ error: error.message });

    let total_income = 0;
    let total_expenses = 0;

    for (const row of data) {
      const amt = parseFloat(row.amount);
      if (row.type === 'income') total_income += amt;
      else if (row.type === 'expense') total_expenses += amt;
    }

    res.json({
      total_income,
      total_expenses,
      total_balance: total_income - total_expenses,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
