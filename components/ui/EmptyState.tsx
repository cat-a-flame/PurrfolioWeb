import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: string;
  title?: string;
  hint?: string;
  action?: ReactNode;
  /** Use for tighter spots (e.g. a dashboard side card) — smaller icon, no border/background. */
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
