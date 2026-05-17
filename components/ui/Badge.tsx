import styles from './Badge.module.css';

type BadgeVariant = 'income' | 'expense';

const LABELS: Record<BadgeVariant, string> = {
  income: 'Income',
  expense: 'Expense',
};

interface BadgeProps {
  variant: BadgeVariant;
}

export default function Badge({ variant }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[variant]].join(' ')}>
      {LABELS[variant]}
    </span>
  );
}
