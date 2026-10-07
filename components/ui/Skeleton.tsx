import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
  /** For dark or coloured surfaces. */
  variant?: 'default' | 'light';
}

export default function Skeleton({ width, height, radius = 8, className, style, variant = 'default' }: SkeletonProps) {
  return (
    <div
      className={[styles.base, variant === 'light' ? styles.light : styles.default, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
