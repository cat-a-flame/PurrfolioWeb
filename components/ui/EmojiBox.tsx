import type { CSSProperties, ReactNode } from 'react';
import { hexToRgba } from '@/lib/colorUtils';
import styles from './EmojiBox.module.css';

export type EmojiBoxSize = 'sm' | 'md' | 'lg' | 'xl';

interface EmojiBoxProps {
  emoji: ReactNode;
  color: string;
  size?: EmojiBoxSize;
  className?: string;
  style?: CSSProperties;
}

export default function EmojiBox({ emoji, color, size = 'md', className, style }: EmojiBoxProps) {
  return (
    <div
      className={[styles.box, styles[size], className].filter(Boolean).join(' ')}
      style={{ background: hexToRgba(color, 0.133), ...style }}
    >
      {emoji}
    </div>
  );
}
