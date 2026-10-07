import type { InputHTMLAttributes, Ref } from 'react';
import { FiSearch } from 'react-icons/fi';
import styles from './SearchInput.module.css';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 'menu' is the search row at the top of a dropdown; 'field' matches the form inputs. */
  variant?: 'menu' | 'field';
  ref?: Ref<HTMLInputElement>;
}

export default function SearchInput({ variant = 'menu', className, ref, ...props }: SearchInputProps) {
  return (
    <div className={[styles[variant], className ?? ''].filter(Boolean).join(' ')}>
      <FiSearch className={styles.icon} aria-hidden />
      <input ref={ref} type="search" autoComplete="off" className={styles.input} {...props} />
    </div>
  );
}
