import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { Transaction } from '@/lib/types';
import { formatHUF, formatDate } from '@/lib/utils';
import styles from './TransactionItem.module.css';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}

export default function TransactionItem({
  transaction,
  onEdit,
  onDelete,
}: TransactionItemProps) {
  const category = transaction.category;
  const labels = transaction.labels ?? [];

  return (
    <div className={styles.item}>
      <div className={styles.iconCol}>
        {category?.icon ? (
          <span className={styles.categoryIcon}>{category.icon}</span>
        ) : (
          <span className={styles.categoryIconFallback}>?</span>
        )}
      </div>

      <div className={styles.mainCol}>
        <div className={styles.topRow}>
          <span className={styles.categoryName}>
            {category?.name ?? 'Uncategorised'}
          </span>
          <span className={styles.date}>{formatDate(transaction.date)}</span>
        </div>

        <div className={styles.midRow}>
          <Badge variant={transaction.type} />
          {labels.length > 0 && (
            <div className={styles.labelChips}>
              {labels.map((label) => (
                <span
                  key={label.id}
                  className={styles.labelChip}
                  style={{ backgroundColor: label.color + '22', color: label.color, borderColor: label.color }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {transaction.notes && (
          <p className={styles.notes}>{transaction.notes}</p>
        )}
      </div>

      <div className={styles.rightCol}>
        <span
          className={[
            styles.amount,
            transaction.type === 'income' ? styles.amountIncome : styles.amountExpense,
          ].join(' ')}
        >
          {transaction.type === 'income' ? '+' : '-'}
          {formatHUF(transaction.amount)}
        </span>

        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(transaction)}
            aria-label="Edit transaction"
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(transaction)}
            aria-label="Delete transaction"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
