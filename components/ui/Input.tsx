import { useId } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export default function Input({ error, className, ...props }: InputProps) {
  const errorId = useId();
  return (
    <div className={styles.wrapper}>
      <input
        className={[styles.input, error ? styles.hasError : '', className ?? '']
          .filter(Boolean)
          .join(' ')}
        {...props}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? [props['aria-describedby'], errorId].filter(Boolean).join(' ') : props['aria-describedby']}
      />
      {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
    </div>
  );
}
