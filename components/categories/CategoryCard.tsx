import type { Category } from '@/lib/types';
import styles from './CategoryCard.module.css';

interface CategoryCardProps {
  category: Category & { children: Category[] };
  onEdit: (category: Category & { children: Category[] }) => void;
}

function hexToTint(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 'var(--color-surface-2)';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.11)`;
}

export default function CategoryCard({ category, onEdit }: CategoryCardProps) {
  const subs = category.children;
  const tint = hexToTint(category.color);

  return (
    <div className={styles.card} onClick={() => onEdit(category)}>
      <div className={styles.head}>
        <div
          className={styles.iconTile}
          style={{ background: category.color, boxShadow: `0 8px 16px -8px ${category.color}` }}
        >
          <span>{category.icon || '📁'}</span>
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{category.name}</div>
          <div className={styles.subLabel}>
            {subs.length ? `${subs.length} subcategories` : 'No subcategories'}
          </div>
        </div>
        <button
          type="button"
          aria-label="Edit category"
          className={styles.menuBtn}
          onClick={(e) => { e.stopPropagation(); onEdit(category); }}
        >
          ⋯
        </button>
      </div>

      <div className={styles.subsRow}>
        {subs.map((s) => (
          <span key={s.id} className={styles.chip} style={{ background: tint }}>
            <span className={styles.chipEmoji}>{s.icon || '📁'}</span>{s.name}
          </span>
        ))}
        <button
          type="button"
          className={styles.addChip}
          onClick={(e) => { e.stopPropagation(); onEdit(category); }}
        >
          <span className={styles.addChipPlus}>+</span> Add
        </button>
      </div>
    </div>
  );
}
