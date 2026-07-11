import type { Category } from '@/lib/types';
import EmojiBox from '@/components/ui/EmojiBox';
import styles from './CategoryCard.module.css';

interface CategoryCardProps {
  category: Category & { children: Category[] };
  onEdit: (category: Category & { children: Category[] }) => void;
}

export default function CategoryCard({ category, onEdit }: CategoryCardProps) {
  const subCount = category.children.length;

  return (
    <div className={styles.card} onClick={() => onEdit(category)}>
      <div className={styles.head}>
        <EmojiBox emoji={category.icon || '📁'} color={category.color} size="lg" />
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
