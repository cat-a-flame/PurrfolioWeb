import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: string;
  title?: string;
  hint?: string;
  action?: ReactNode;
  /** Smaller icon, no border or background, for tight spots. */
  compact?: boolean;
  className?: string;
}

export default function EmptyState({ icon, title, hint, action, compact, className }: EmptyStateProps) {
  return (
    <div className={[styles.wrap, compact ? styles.wrapCompact : '', className].filter(Boolean).join(' ')}>
      <span className={[styles.icon, compact ? styles.iconCompact : ''].filter(Boolean).join(' ')}>{icon}</span>
      {title && <p className={styles.title}>{title}</p>}
      {hint && <p className={[styles.hint, compact ? styles.hintCompact : ''].filter(Boolean).join(' ')}>{hint}</p>}
      {action}
    </div>
  );
}
