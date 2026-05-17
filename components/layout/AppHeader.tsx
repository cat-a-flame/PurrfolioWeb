'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './AppHeader.module.css';

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Categories', href: '/categories' },
  { label: 'Labels', href: '/labels' },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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
                <Link
                  href="/account"
                  className={styles.dropdownItem}
                  role="menuitem"
                  onClick={() => setDropdownOpen(false)}
                >
                  Account
                </Link>
                <button
                  className={styles.dropdownItem}
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
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
