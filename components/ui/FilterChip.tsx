import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import styles from './FilterChip.module.css';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: ReactNode;
  icon?: ReactNode;
  /** How many values are picked; shown as a badge when above zero. */
  count?: number;
  open?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Caret({ className }: { className?: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M1.5 3.25h7L5 7.25z" fill="currentColor" />
    </svg>
  );
}

/** The pill button that opens a filter dropdown. */
export default function FilterChip({ label, icon, count = 0, open = false, className, ref, ...props }: FilterChipProps) {
  const cls = [
    styles.chip,
    open ? styles.open : '',
    count > 0 ? styles.active : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <button ref={ref} type="button" className={cls} aria-expanded={open} {...props}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{label}</span>
      {count > 0 && <span className={styles.count}>{count}</span>}
      <Caret className={styles.caret} />
    </button>
  );
}
