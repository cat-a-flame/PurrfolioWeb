'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAddRecord } from '@/components/transactions/AddRecordProvider';
import { useTheme } from '@/contexts/ThemeContext';
import styles from './AppHeader.module.css';

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Statistics', href: '/statistics' },
  { label: 'Transactions', href: '/transactions' },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { openAddDialog } = useAddRecord();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { theme, toggleTheme } = useTheme();

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/dashboard" className={styles.brand}>
          PennyPuff
        </Link>

        <nav className={styles.nav} aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                styles.navLink,
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? styles.navLinkActive
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button className={styles.addRecordBtn} onClick={openAddDialog}>
          + Add record
        </button>

        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        <div className={styles.userArea}>
          <button
            className={styles.avatar}
            onClick={() => setDropdownOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            aria-label="User menu"
          >
            <span className={styles.avatarInitial}>P</span>
          </button>

          {dropdownOpen && (
            <>
              <div
                className={styles.dropdownBackdrop}
                onClick={() => setDropdownOpen(false)}
              />
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
      </div>
    </header>
  );
}
