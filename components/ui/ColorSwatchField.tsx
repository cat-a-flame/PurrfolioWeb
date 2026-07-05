'use client';

import styles from './ColorSwatchField.module.css';

interface ColorSwatchFieldProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel?: string;
}

export default function ColorSwatchField({ value, onChange, ariaLabel = 'Color' }: ColorSwatchFieldProps) {
  return (
    <label className={styles.colorField}>
      <span className={styles.colorSwatch} style={{ background: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className={styles.colorInput}
        />
      </span>
      <span>
        <span className={styles.colorHex}>{value.toUpperCase()}</span>
        <span className={styles.colorHint}>Click to open color picker</span>
      </span>
    </label>
  );
}
