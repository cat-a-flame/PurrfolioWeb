import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api.js';

const CATEGORY_TYPES = ['income', 'expense', 'both'];
const INITIAL_FORM = { name: '', type: 'expense', icon: '💰', color: '#6366f1' };

export default function Categories() {
  const { data: categories, loading, error, reload } = useApi(() => api.categories.list());
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSaving(true);
    try {
      await api.categories.create({
        name: form.name.trim(),
        type: form.type,
        icon: form.icon || '💰',
        color: form.color || '#6366f1',
      });
      setForm(INITIAL_FORM);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setDeleteError(null);
    if (!confirm('Delete this category?')) return;
    try {
      await api.categories.delete(id);
      reload();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Categories</h1>
      </div>

      <div className="add-form">
        <h3>Add Category</h3>
        <form onSubmit={handleAdd}>
          {formError && <div className="error-msg">{formError}</div>}
          <div className="add-form-row">
            <div className="form-group">
              <label>Name</label>
              <input
                className="form-control"
                type="text"
                placeholder="Category name"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                className="form-control"
                value={form.type}
                onChange={e => setField('type', e.target.value)}
              >
                {CATEGORY_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Icon</label>
              <input
                className="form-control"
                type="text"
                placeholder="💰"
                value={form.icon}
                onChange={e => setField('icon', e.target.value)}
                maxLength={4}
                style={{ width: 72 }}
              />
            </div>
            <div className="form-group">
              <label>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setField('color', e.target.value)}
                  style={{
                    width: 38,
                    height: 36,
                    padding: 2,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{form.color}</span>
              </div>
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {deleteError && <div className="error-msg">{deleteError}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : error ? (
        <div className="error-msg">{error}</div>
      ) : (categories || []).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <p>No categories yet.</p>
        </div>
      ) : (
        <div className="item-grid">
          {categories.map(cat => (
            <div key={cat.id} className="item-row">
              <div
                className="item-icon"
                style={{ background: `${cat.color}22` }}
              >
                {cat.icon}
              </div>
              <div className="item-name">{cat.name}</div>
              <div className="item-meta" style={{ textTransform: 'uppercase', fontSize: 12, letterSpacing: '0.05em' }}>
                {cat.type}
              </div>
              {cat.is_default ? (
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(99,102,241,0.15)',
                  color: 'var(--accent-hover)',
                  fontWeight: 600,
                }}>
                  default
                </span>
              ) : (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(cat.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
