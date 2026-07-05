import type { Label } from '@/lib/types';
import styles from './LabelCard.module.css';

interface LabelCardProps {
  label: Label;
  onEdit: (label: Label) => void;
}

export default function LabelCard({ label, onEdit }: LabelCardProps) {
  return (
    <div className={styles.card} onClick={() => onEdit(label)}>
      <div className={styles.head}>
        <span className={styles.dot} style={{ background: label.color }} />
        <span className={styles.name}>{label.name}</span>
        <button
          type="button"
          aria-label="Edit label"
          className={styles.menuBtn}
          onClick={(e) => { e.stopPropagation(); onEdit(label); }}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
