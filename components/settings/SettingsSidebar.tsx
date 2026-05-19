'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SettingsSidebar.module.css';

const groups = [
  {
    label: 'Accounts',
    items: [
      { href: '/settings/wallets', icon: '💰', label: 'Wallets' },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/settings/categories', icon: '📁', label: 'Categories' },
      { href: '/settings/labels',     icon: '🏷️', label: 'Labels' },
      { href: '/settings/templates',  icon: '📋', label: 'Templates' },
    ],
  },
  {
    label: 'Data',
    items: [
      { href: '/settings/import', icon: '📥', label: 'Import' },
    ],
  },
];

export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <p className={styles.sidebarTitle}>Settings</p>
      {groups.map(group => (
        <div key={group.label} className={styles.group}>
          <p className={styles.groupLabel}>{group.label}</p>
          {group.items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                styles.navItem,
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? styles.navItemActive
                  : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={styles.navIcon} aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
