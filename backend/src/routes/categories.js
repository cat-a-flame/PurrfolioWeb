import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name');

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, icon, color } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name and type are required' });
    }

    if (!['income', 'expense', 'both'].includes(type)) {
      return res.status(400).json({ error: 'type must be income, expense, or both' });
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name,
        type,
        icon: icon || '💰',
        color: color || '#6366f1',
        is_default: false,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { data: category, error: fetchError } = await supabase
      .from('categories')
      .select('is_default')
      .eq('id', req.params.id)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Category not found' });

    if (category.is_default) {
      return res.status(403).json({ error: 'Cannot delete a default category' });
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
