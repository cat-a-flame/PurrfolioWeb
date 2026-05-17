import { Router } from 'express';
import { supabase } from '../supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('labels')
      .select('*')
      .order('name');

    if (error) return res.status(500).json({ error: error.message });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data, error } = await supabase
      .from('labels')
      .insert({ name, color: color || '#6366f1' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A label with this name already exists' });
      }
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('labels')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
