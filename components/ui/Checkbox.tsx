import styles from './Checkbox.module.css';

interface CheckboxProps {
  checked: boolean;
  /** Some, but not all, of the items this box stands for are checked. */
  indeterminate?: boolean;
}

/** The visual box only; the row around it carries the role and click handling. */
export default function Checkbox({ checked, indeterminate = false }: CheckboxProps) {
  const on = checked || indeterminate;
  return (
    <span className={[styles.box, on ? styles.on : ''].filter(Boolean).join(' ')} aria-hidden>
      {checked ? '✓' : indeterminate ? '–' : null}
    </span>
  );
}
