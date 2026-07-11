import type { Wallet } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import EmojiBox from '@/components/ui/EmojiBox';
import styles from './AccountCard.module.css';

interface AccountCardProps {
  wallet: Wallet;
  onEdit: (wallet: Wallet) => void;
}

export default function AccountCard({ wallet, onEdit }: AccountCardProps) {
  return (
    <div
      className={[styles.card, wallet.is_archived ? styles.cardArchived : ''].filter(Boolean).join(' ')}
      onClick={() => onEdit(wallet)}
    >
      <div className={styles.head}>
        <EmojiBox emoji={wallet.icon || '💰'} color={wallet.color} size="lg" />
        <div className={styles.info}>
          <div className={styles.name}>{wallet.name}</div>
          <div className={styles.subLabel}>
            {wallet.currency}
            {wallet.starting_balance !== 0 && (
              <> · Starting: {wallet.starting_balance > 0 ? '+' : ''}{formatNumber(wallet.starting_balance)}</>
            )}
          </div>
        </div>
        {wallet.is_default && <span className={styles.badge}>Default</span>}
        {wallet.is_archived && <span className={styles.badgeArchived}>Archived</span>}
        <button
          type="button"
          aria-label="Edit account"
          className={styles.menuBtn}
          onClick={(e) => { e.stopPropagation(); onEdit(wallet); }}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
