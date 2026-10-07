'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/contexts/UserContext';
import { useRecurringAlert } from '@/contexts/RecurringAlertContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FiCreditCard, FiDownload, FiFolder, FiTag, FiUpload } from 'react-icons/fi';
import styles from './TopNav.module.css';

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Transactions', href: '/transactions' },
  { label: 'Planned payments', href: '/recurring' },
  { label: 'Statistics', href: '/statistics' },
];

const settingsItems = [
  { label: 'Accounts', href: '/settings/accounts', Icon: FiCreditCard },
  { label: 'Categories', href: '/settings/categories', Icon: FiFolder },
  { label: 'Labels', href: '/settings/labels', Icon: FiTag },
  { label: 'Import', href: '/settings/import', Icon: FiDownload },
  { label: 'Export', href: '/settings/export', Icon: FiUpload },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
}

function Chevron() {
  return (
    <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Closes on outside click, Escape and navigation. */
function useDropdown(pathname: string) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const hasUrgentPlanned = useRecurringAlert();
  const { theme, toggleTheme } = useTheme();
  const currentUser = useCurrentUser();
  const email = currentUser?.email ?? '';
  const username = currentUser?.username ?? '';
  const settings = useDropdown(pathname);
  const user = useDropdown(pathname);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const displayName = username || email.split('@')[0] || 'Account';
  const initial = (username || email) ? (username || email)[0].toUpperCase() : '?';
  const settingsActive = pathname.startsWith('/settings');

  return (
    <header className={styles.bar}>
      <nav className={styles.inner} aria-label="Main navigation">
        <Link href="/dashboard" className={styles.brand}>
          <img src="/logo.png" alt="Purrfolio logo" className={styles.logo} />
          <span className={styles.brandName}>Purrfolio</span>
        </Link>

        <div className={styles.navList}>
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[styles.navLink, active ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                {item.href === '/recurring' && hasUrgentPlanned && (
                  <span className={styles.navBadge} aria-hidden />
                )}
              </Link>
            );
          })}
        </div>

        <div className={styles.right}>
          <div className={styles.dropdown} ref={settings.ref}>
            <button
              type="button"
              className={[styles.navLink, styles.menuTrigger, settingsActive ? styles.navLinkActive : ''].filter(Boolean).join(' ')}
              aria-haspopup="menu"
              aria-expanded={settings.open}
              onClick={() => settings.setOpen(o => !o)}
            >
              Settings
              <Chevron />
            </button>
            {settings.open && (
              <div className={styles.menu} role="menu">
                {settingsItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={[styles.menuItem, styles.menuItemWithIcon, active ? styles.menuItemActive : ''].filter(Boolean).join(' ')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <item.Icon className={styles.menuIcon} size={16} aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <span className={styles.divider} aria-hidden />

          <div className={styles.dropdown} ref={user.ref}>
            <button
              type="button"
              className={styles.userBtn}
              aria-haspopup="menu"
              aria-expanded={user.open}
              aria-label="User menu"
              onClick={() => user.setOpen(o => !o)}
            >
              <span className={styles.avatar}>{initial}</span>
              <span className={styles.userName}>{displayName}</span>
            </button>
            {user.open && (
              <div className={styles.menu} role="menu">
                {(username || email) && (
                  <div className={styles.menuHeader}>
                    {username && <span className={styles.menuName}>{username}</span>}
                    {email && <span className={styles.menuEmail}>{email}</span>}
                  </div>
                )}
                <Link
                  href="/account"
                  role="menuitem"
                  className={[styles.menuItem, isActive(pathname, '/account') ? styles.menuItemActive : ''].filter(Boolean).join(' ')}
                >
                  Account settings
                </Link>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={theme === 'dark'}
                  className={[styles.menuItem, styles.themeItem].join(' ')}
                  onClick={toggleTheme}
                >
                  Dark mode
                  <span className={[styles.toggleTrack, theme === 'dark' ? styles.toggleTrackOn : ''].filter(Boolean).join(' ')}>
                    <span className={[styles.toggleThumb, theme === 'dark' ? styles.toggleThumbOn : ''].filter(Boolean).join(' ')} />
                  </span>
                </button>
                <div className={styles.menuSeparator} />
                <button type="button" role="menuitem" className={[styles.menuItem, styles.menuItemDanger].join(' ')} onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
