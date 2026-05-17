import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../api.js';
import { formatHUF } from '../utils.js';
import TransactionItem from '../components/TransactionItem.jsx';
import TransactionForm from '../components/TransactionForm.jsx';

export default function Dashboard() {
  const { data: summary, loading: summaryLoading, reload: reloadSummary } = useApi(() => api.summary.get());
  const { data: transactions, loading: txLoading, reload: reloadTx } = useApi(() => api.transactions.list());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return;
    await api.transactions.delete(id);
    reloadTx();
    reloadSummary();
  }

  function handleEdit(tx) {
    setEditing(tx);
    setShowForm(true);
  }

  function handleSave() {
    setShowForm(false);
    setEditing(null);
    reloadTx();
    reloadSummary();
  }

  const recent = (transactions || []).slice(0, 8);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          + New Transaction
        </button>
      </div>

      <div className="summary-grid">
        <div className="summary-card balance">
          <div className="icon">⚖️</div>
          <div className="label">Balance</div>
          <div className="amount">
            {summaryLoading ? '…' : formatHUF(summary?.total_balance ?? 0)}
          </div>
        </div>
        <div className="summary-card income">
          <div className="icon">📈</div>
          <div className="label">Total Income</div>
          <div className="amount">
            {summaryLoading ? '…' : formatHUF(summary?.total_income ?? 0)}
          </div>
        </div>
        <div className="summary-card expense">
          <div className="icon">📉</div>
          <div className="label">Total Expenses</div>
          <div className="amount">
            {summaryLoading ? '…' : formatHUF(summary?.total_expenses ?? 0)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Recent Transactions</h2>
        </div>

        {txLoading ? (
          <div className="loading">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💸</div>
            <p>No transactions yet. Add your first one!</p>
          </div>
        ) : (
          <div className="transaction-list">
            {recent.map(tx => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

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
