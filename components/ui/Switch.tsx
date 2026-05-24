import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export default function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  const trackClass = [styles.track, checked ? styles.checked : '', disabled ? styles.disabled : ''].filter(Boolean).join(' ');
  const labelClass = [styles.label, disabled ? styles.disabled : ''].filter(Boolean).join(' ');

  return (
    <span className={styles.row}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        className={trackClass}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className={styles.thumb} />
      </button>
      {label && (
        <label htmlFor={id} className={labelClass} onClick={() => !disabled && onChange(!checked)}>
          {label}
        </label>
      )}
    </span>
  );
}
