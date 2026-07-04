'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRecurringAlert } from '@/contexts/RecurringAlertContext';
import { useTheme } from '@/contexts/ThemeContext';
import styles from './Sidebar.module.css';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 4 3 8l4 4" />
        <path d="M3 8h13a4 4 0 0 1 4 4" />
        <path d="M17 20l4-4-4-4" />
        <path d="M21 16H8a4 4 0 0 1-4-4" />
      </svg>
    ),
  },
  {
    label: 'Planned payments',
    href: '/recurring',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9.5h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    label: 'Statistics',
    href: '/statistics',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 20V4" />
        <path d="M4 20h16" />
        <rect x="7.5" y="12" width="3.2" height="5" rx="1" />
        <rect x="13.3" y="8" width="3.2" height="9" rx="1" />
      </svg>
    ),
  },
];

const settingsItems = [
  {
    label: 'Accounts',
    href: '/settings/wallets',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="6" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <circle cx="17" cy="14" r="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Categories',
    href: '/settings/categories',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    label: 'Labels',
    href: '/settings/labels',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
        <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Import',
    href: '/settings/import',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const hasUrgentPlanned = useRecurringAlert();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email);
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <Link href="/dashboard" className={styles.brand}>
        <img src="/logo.png" alt="Purrfolio logo" className={styles.logo} />
        <span className={styles.brandName}>Purrfolio</span>
      </Link>

      <div className={styles.menuLabel}>MENU</div>
      <div className={styles.navList}>
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[styles.navLink, active ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navText}>{item.label}</span>
              {item.href === '/recurring' && hasUrgentPlanned && (
                <span className={styles.navBadge} aria-hidden />
              )}
            </Link>
          );
        })}
      </div>

      <div className={styles.menuLabel}>SETTINGS</div>
      <div className={styles.navList}>
        {settingsItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[styles.navLink, active ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navText}>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className={styles.spacer} />

      <button
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <span className={styles.themeLabel}>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        <span className={[styles.toggleTrack, theme === 'dark' ? styles.toggleTrackOn : ''].filter(Boolean).join(' ')}>
          <span className={[styles.toggleThumb, theme === 'dark' ? styles.toggleThumbOn : ''].filter(Boolean).join(' ')} />
        </span>
      </button>

      <div className={styles.userArea}>
        <button
          className={styles.userBtn}
          onClick={() => setDropdownOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={dropdownOpen}
          aria-label="User menu"
        >
          <span className={styles.avatar}>{initial}</span>
          <span className={styles.userInfo}>
            <span className={styles.userEmail}>{email || 'Account'}</span>
          </span>
          <span className={styles.chevron} aria-hidden>⌄</span>
        </button>

        {dropdownOpen && (
          <>
            <div className={styles.dropdownBackdrop} onClick={() => setDropdownOpen(false)} />
            <div className={styles.dropdown} role="menu">
              <Link href="/settings" className={styles.dropdownItem} role="menuitem" onClick={() => setDropdownOpen(false)}>
                Settings
              </Link>
              <Link href="/account" className={styles.dropdownItem} role="menuitem" onClick={() => setDropdownOpen(false)}>
                Account
              </Link>
              <div className={styles.dropdownDivider} />
              <button className={styles.dropdownItem} role="menuitem" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
