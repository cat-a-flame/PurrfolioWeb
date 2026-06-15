'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { theme, toggleTheme } = useTheme();

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

      <div className={styles.bottomSection}>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className={styles.navIcon} aria-hidden>
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
          <span className={styles.themeLabel}>Dark mode</span>
          <span className={[styles.toggleTrack, theme === 'dark' ? styles.toggleTrackOn : ''].filter(Boolean).join(' ')}>
            <span className={[styles.toggleThumb, theme === 'dark' ? styles.toggleThumbOn : ''].filter(Boolean).join(' ')} />
          </span>
        </button>
      </div>
    </aside>
  );
}
