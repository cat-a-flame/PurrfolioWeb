import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { todayInputDate } from '../utils.js';

const INITIAL = {
  type: 'expense',
  amount: '',
  category_id: '',
  date: todayInputDate(),
  notes: '',
  label_ids: [],
};

export default function TransactionForm({ transaction, onSave, onClose }) {
  const [form, setForm] = useState(INITIAL);
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.categories.list(), api.labels.list()]).then(([cats, lbls]) => {
      setCategories(cats);
      setLabels(lbls);
    });
  }, []);

  useEffect(() => {
    if (transaction) {
      setForm({
        type: transaction.type,
        amount: String(transaction.amount),
        category_id: transaction.category_id || '',
        date: transaction.date?.slice(0, 10) || todayInputDate(),
        notes: transaction.notes || '',
        label_ids: (transaction.labels || []).map(l => l.id),
      });
    }
  }, [transaction]);

  const filteredCategories = categories.filter(
    c => c.type === form.type || c.type === 'both'
  );

  function set(key, value) {
    setForm(f => {
      const next = { ...f, [key]: value };
      if (key === 'type') next.category_id = '';
      return next;
    });
  }

  function toggleLabel(id) {
    setForm(f => ({
      ...f,
      label_ids: f.label_ids.includes(id)
        ? f.label_ids.filter(x => x !== id)
        : [...f.label_ids, id],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (!form.date) {
      setError('Please select a date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        amount,
        category_id: form.category_id || null,
        date: form.date,
        notes: form.notes || null,
        label_ids: form.label_ids,
      };

      if (transaction) {
        await api.transactions.update(transaction.id, payload);
      } else {
        await api.transactions.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{transaction ? 'Edit Transaction' : 'New Transaction'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label>Type</label>
              <div className="type-toggle">
                <button
                  type="button"
                  className={`type-btn income${form.type === 'income' ? ' active' : ''}`}
                  onClick={() => set('type', 'income')}
                >
                  ↑ Income
                </button>
                <button
                  type="button"
                  className={`type-btn expense${form.type === 'expense' ? ' active' : ''}`}
                  onClick={() => set('type', 'expense')}
                >
                  ↓ Expense
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Amount (HUF)</label>
              <input
                className="form-control"
                type="number"
                min="1"
                step="1"
                placeholder="0"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Category</label>
              <select
                className="form-control"
                value={form.category_id}
                onChange={e => set('category_id', e.target.value)}
              >
                <option value="">— No category —</option>
                {filteredCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Date</label>
              <input
                className="form-control"
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                required
              />
            </div>

            {labels.length > 0 && (
              <div className="form-group">
                <label>Labels</label>
                <div className="label-picker">
                  {labels.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      className={`label-option${form.label_ids.includes(l.id) ? ' selected' : ''}`}
                      style={{ borderColor: form.label_ids.includes(l.id) ? l.color : 'transparent' }}
                      onClick={() => toggleLabel(l.id)}
                    >
                      <span
                        className="color-swatch"
                        style={{ background: l.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }}
                      />
                      {l.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Notes</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Optional note..."
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : transaction ? 'Save Changes' : 'Add Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
