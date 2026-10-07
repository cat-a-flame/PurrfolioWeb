import type { InputHTMLAttributes, Ref } from 'react';
import { FiSearch } from 'react-icons/fi';
import styles from './SearchInput.module.css';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 'filled' sits inside menus and dropdowns; 'outlined' stands on the page. */
  variant?: 'filled' | 'outlined';
  ref?: Ref<HTMLInputElement>;
}

/** The search field used across the app: page search bars and the search at the top of menus. */
export default function SearchInput({ variant = 'filled', className, ref, ...props }: SearchInputProps) {
  return (
    <div className={[styles.wrapper, styles[variant], className ?? ''].filter(Boolean).join(' ')}>
      <FiSearch className={styles.icon} aria-hidden />
      <input ref={ref} type="search" autoComplete="off" className={styles.input} {...props} />
    </div>
  );
}
