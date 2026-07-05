import type { Category } from '@/lib/types';
import styles from './CategoryCard.module.css';

interface CategoryCardProps {
  category: Category & { children: Category[] };
  onEdit: (category: Category & { children: Category[] }) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(122, 92, 224, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function CategoryCard({ category, onEdit }: CategoryCardProps) {
  const subCount = category.children.length;

  return (
    <div className={styles.card} onClick={() => onEdit(category)}>
      <div className={styles.head}>
        <div
          className={styles.iconTile}
          style={{ background: hexToRgba(category.color, 0.25), boxShadow: `0 8px 16px -8px ${category.color}` }}
        >
          <span>{category.icon || '📁'}</span>
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{category.name}</div>
          <div className={styles.subLabel}>
            {subCount ? `${subCount} subcategories` : 'No subcategories'}
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
    </div>
  );
}
