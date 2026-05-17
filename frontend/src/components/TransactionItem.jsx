import { formatHUF, formatDate } from '../utils.js';

export default function TransactionItem({ transaction, onEdit, onDelete }) {
  const { type, amount, category, date, notes, labels = [] } = transaction;

  return (
    <div className="transaction-item">
      <div className={`transaction-icon ${type}`}>
        {category?.icon || (type === 'income' ? '💰' : '💸')}
      </div>

      <div className="transaction-info">
        <div className="name">{category?.name || 'Uncategorized'}</div>
        <div className="meta">
          <span>{formatDate(date)}</span>
          <span className={`badge badge-${type}`}>{type}</span>
          {labels.map(l => (
            <span
              key={l.id}
              className="label-chip"
              style={{ background: `${l.color}22`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
          {notes && <span style={{ fontStyle: 'italic' }}>{notes}</span>}
        </div>
      </div>

      <div className={`transaction-amount ${type}`}>
        {type === 'income' ? '+' : '−'}{formatHUF(amount)}
      </div>

      <div className="transaction-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(transaction)} title="Edit">✏️</button>
        <button className="btn btn-danger btn-sm" onClick={() => onDelete(transaction.id)} title="Delete">🗑️</button>
      </div>
    </div>
  );
}
