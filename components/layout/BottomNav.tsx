'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAddRecord } from '@/components/transactions/AddRecordProvider';
import { useRecurringAlert } from '@/contexts/RecurringAlertContext';
import styles from './BottomNav.module.css';

const tabs = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/statistics',
    label: 'Stats',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    href: '/recurring',
    label: 'Planned',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <line x1="8" y1="14" x2="8" y2="14"/>
        <line x1="12" y1="14" x2="12" y2="14"/>
        <line x1="16" y1="14" x2="16" y2="14"/>
      </svg>
    ),
  },
  {
    href: '/account',
    label: 'Account',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { openAddDialog } = useAddRecord();
  const hasUrgentPlanned = useRecurringAlert();

  return (
    <nav className={styles.nav} aria-label="Mobile navigation">
      {tabs.slice(0, 2).map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={[
            styles.tab,
            pathname === tab.href || pathname.startsWith(tab.href + '/') ? styles.tabActive : '',
          ].filter(Boolean).join(' ')}
        >
          {tab.icon}
          <span className={styles.label}>{tab.label}</span>
        </Link>
      ))}

      <button type="button" className={styles.addBtn} onClick={openAddDialog} aria-label="Add record">
        <span className={styles.addIcon} aria-hidden>+</span>
      </button>

      {tabs.slice(2).map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={[
            styles.tab,
            pathname === tab.href || pathname.startsWith(tab.href + '/') ? styles.tabActive : '',
          ].filter(Boolean).join(' ')}
        >
          <span className={styles.iconWrap}>
            {tab.icon}
            {tab.href === '/recurring' && hasUrgentPlanned && (
              <span className={styles.alertDot} aria-hidden />
            )}
          </span>
          <span className={styles.label}>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
