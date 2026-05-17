import { useState, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api.js';
import TransactionItem from '../components/TransactionItem.jsx';
import TransactionForm from '../components/TransactionForm.jsx';

const EMPTY_FILTERS = { type: '', category_id: '', label_id: '', date_from: '', date_to: '' };

export default function Transactions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: transactions, loading, reload } = useApi(
    useCallback(() => api.transactions.list(applied), [applied])
  );
  const { data: categories } = useApi(() => api.categories.list());
  const { data: labels } = useApi(() => api.labels.list());

  function applyFilters() { setApplied({ ...filters }); }
  function clearFilters() { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }
  function setFilter(key, value) { setFilters(f => ({ ...f, [key]: value })); }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return;
    await api.transactions.delete(id);
    reload();
  }

  function handleEdit(tx) { setEditing(tx); setShowForm(true); }

  function handleSave() { setShowForm(false); setEditing(null); reload(); }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + New Transaction
        </button>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-bar">
          <div className="filter-group">
            <label>Type</label>
            <select className="form-control" value={filters.type} onChange={e => setFilter('type', e.target.value)}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Category</label>
            <select className="form-control" value={filters.category_id} onChange={e => setFilter('category_id', e.target.value)}>
              <option value="">All categories</option>
              {(categories || []).map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Label</label>
            <select className="form-control" value={filters.label_id} onChange={e => setFilter('label_id', e.target.value)}>
              <option value="">All labels</option>
              {(labels || []).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>From</label>
            <input className="form-control" type="date" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)} />
          </div>

          <div className="filter-group">
            <label>To</label>
            <input className="form-control" type="date" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)} />
          </div>

          <div className="filter-group" style={{ flexDirection: 'row', gap: 8 }}>
            <button className="btn btn-primary" onClick={applyFilters}>Filter</button>
            <button className="btn btn-ghost" onClick={clearFilters}>Clear</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (transactions || []).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No transactions match your filters.</p>
        </div>
      ) : (
        <div className="transaction-list">
          {transactions.map(tx => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TransactionForm
          transaction={editing}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </>
  );
}
