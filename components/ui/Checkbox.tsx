import styles from './Checkbox.module.css';

interface CheckboxProps {
  checked: boolean;
  /** Some, but not all, of the items this box stands for are checked. */
  indeterminate?: boolean;
  className?: string;
}

/** The visual box only; the row around it carries the role and click handling. */
export default function Checkbox({ checked, indeterminate = false, className }: CheckboxProps) {
  const state = checked ? 'checked' : indeterminate ? 'mixed' : 'unchecked';
  return (
    <span className={[styles.box, className ?? ''].filter(Boolean).join(' ')} data-state={state} aria-hidden>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {!checked && indeterminate && <span className={styles.dash} />}
    </span>
  );
}
