import EmojiBox from '@/components/ui/EmojiBox';
import Skeleton from '@/components/ui/Skeleton';
import { toHUF } from '@/lib/exchangeRates';
import { formatCurrency, formatHUF } from '@/lib/utils';
import type { AccountType, Wallet } from '@/lib/types';
import styles from './AccountsOverview.module.css';

type GroupKey = 'cash' | 'bonds' | 'investments' | 'other';

const GROUPS: { key: GroupKey; label: string; types: AccountType[] }[] = [
  { key: 'cash', label: 'Cash & bank', types: ['bank', 'cash', 'savings', 'credit_card'] },
  { key: 'bonds', label: 'Bonds', types: ['bond'] },
  { key: 'investments', label: 'Investments', types: ['investment', 'crypto'] },
  { key: 'other', label: 'Other', types: ['other'] },
];

export interface WalletSummary {
  wallet: Wallet;
  balance: number;
}

interface AccountsOverviewProps {
  summaries: WalletSummary[];
  /** HUF per 1 unit of each currency */
  rates: Record<string, number>;
  loading: boolean;
  hideNumbers: boolean;
  mask: string;
}

function groupFor(wallet: Wallet): GroupKey {
  // Wallets from before account types existed have no type; count them as bank.
  const type = wallet.type ?? 'bank';
  return GROUPS.find(g => g.types.includes(type))?.key ?? 'other';
}

export default function AccountsOverview({ summaries, rates, loading, hideNumbers, mask }: AccountsOverviewProps) {
  if (loading) {
    return (
      <section className={styles.card} aria-busy="true">
        <Skeleton width={180} height={16} radius={4} />
        <Skeleton width="100%" height={6} radius="var(--radius-full)" />
        <div className={styles.groups}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.group}>
              <Skeleton width="50%" height={14} radius={4} />
              {Array.from({ length: 2 }).map((__, j) => (
                <div key={j} className={styles.row}>
                  <Skeleton width={38} height={38} radius="var(--radius-sm)" />
                  <Skeleton width="45%" height={12} radius={4} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (summaries.length === 0) return null;

  const groups = GROUPS.map(g => {
    const items = summaries.filter(s => groupFor(s.wallet) === g.key);
    const totalHUF = items.reduce((sum, s) => sum + toHUF(s.balance, s.wallet.currency, rates), 0);
    const approximate = items.some(s => s.wallet.currency !== 'HUF');
    return { ...g, items, totalHUF, approximate };
  }).filter(g => g.items.length > 0);

  const netWorth = groups.reduce((sum, g) => sum + g.totalHUF, 0);
  const netApproximate = groups.some(g => g.approximate);
  const barTotal = groups.reduce((sum, g) => sum + Math.max(0, g.totalHUF), 0);

  const money = (text: string, approximate: boolean) =>
    hideNumbers ? mask : `${approximate ? '≈ ' : ''}${text}`;

  return (
    <section className={styles.card} aria-label="Accounts">
      <div className={styles.header}>
        <span className={styles.headerLabel}>Net worth</span>
        <span className={styles.headerValue}>{money(formatHUF(netWorth), netApproximate)}</span>
      </div>

      {barTotal > 0 && (
        <div className={styles.bar} role="img" aria-label="Share of net worth by account group">
          {groups.filter(g => g.totalHUF > 0).map(g => (
            <span
              key={g.key}
              className={`${styles.segment} ${styles[g.key]}`}
              style={{ flexGrow: g.totalHUF / barTotal }}
              title={`${g.label}: ${Math.round((g.totalHUF / barTotal) * 100)}%`}
            />
          ))}
        </div>
      )}

      <div className={styles.groups}>
        {groups.map(g => (
          <div key={g.key} className={`${styles.group} ${styles[g.key]}`}>
            <div className={styles.groupHeader}>
              <span className={styles.groupTitle}>
                <span className={styles.dot} aria-hidden="true" />
                {g.label}
              </span>
              <span className={styles.groupTotal}>{money(formatHUF(g.totalHUF), g.approximate)}</span>
            </div>
            <ul className={styles.list}>
              {g.items.map(({ wallet, balance }) => (
                <li key={wallet.id} className={styles.row}>
                  <EmojiBox emoji={wallet.icon || '💰'} color={wallet.color} size="sm" />
                  <span className={styles.name}>{wallet.name}</span>
                  <span className={styles.amount}>{hideNumbers ? mask : formatCurrency(balance, wallet.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
