'use client';

import { useState } from 'react';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import Input from './Input';
import styles from './PasswordInput.module.css';

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>;

export default function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.wrapper}>
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={[styles.input, className ?? ''].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={props.id}
      >
        {visible ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}
