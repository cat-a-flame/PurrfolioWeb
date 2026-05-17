import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api.js';

const INITIAL_FORM = { name: '', color: '#6366f1' };

export default function Labels() {
  const { data: labels, loading, error, reload } = useApi(() => api.labels.list());
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
      await api.labels.create({ name: form.name.trim(), color: form.color });
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
    if (!confirm('Delete this label?')) return;
    try {
      await api.labels.delete(id);
      reload();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Labels</h1>
      </div>

      <div className="add-form">
        <h3>Add Label</h3>
        <form onSubmit={handleAdd}>
          {formError && <div className="error-msg">{formError}</div>}
          <div className="add-form-row">
            <div className="form-group">
              <label>Name</label>
              <input
                className="form-control"
                type="text"
                placeholder="Label name"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                maxLength={40}
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
      ) : (labels || []).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <p>No labels yet.</p>
        </div>
      ) : (
        <div className="item-grid">
          {labels.map(label => (
            <div key={label.id} className="item-row">
              <span
                className="color-swatch"
                style={{ background: label.color, width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
              />
              <div className="item-name">{label.name}</div>
              <span
                className="label-chip"
                style={{ background: `${label.color}22`, color: label.color }}
              >
                {label.name}
              </span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(label.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
