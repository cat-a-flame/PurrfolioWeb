import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export default function Input({ error, className, ...props }: InputProps) {
  return (
    <div className={styles.wrapper}>
      <input
        className={[styles.input, error ? styles.hasError : '', className ?? '']
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
