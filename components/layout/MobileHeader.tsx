'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';
import { FiCreditCard, FiDownload, FiFolder, FiTag, FiUpload } from 'react-icons/fi';
import { hidesNav } from '@/lib/publicPaths';
import styles from './MobileHeader.module.css';

const settingsItems = [
  {
    label: 'Accounts',
    href: '/settings/accounts',
    icon: <FiCreditCard size={21} aria-hidden />,
  },
  {
    label: 'Categories',
    href: '/settings/categories',
    icon: <FiFolder size={21} aria-hidden />,
  },
  {
    label: 'Labels',
    href: '/settings/labels',
    icon: <FiTag size={21} aria-hidden />,
  },
  {
    label: 'Import',
    href: '/settings/import',
    icon: <FiDownload size={21} aria-hidden />,
  },
  {
    label: 'Export',
    href: '/settings/export',
    icon: <FiUpload size={21} aria-hidden />,
  },
];

export default function MobileHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  // Logged-out pages have no app navigation.
  if (hidesNav(pathname)) return null;

  return (
    <>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.trigger}
          onClick={() => setOpen(true)}
          aria-label="Open settings menu"
          aria-expanded={open}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Link href="/dashboard" className={styles.brand}>
          <img src="/logo.png" alt="Purrfolio logo" className={styles.logo} />
          <span className={styles.brandName}>Purrfolio</span>
        </Link>
      </header>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <nav
            className={styles.drawer}
            aria-label="Settings navigation"
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>Settings</span>
              <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
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

            <div className={styles.drawerFooter}>
              <button
                type="button"
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                <span className={styles.themeLabel}>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                <span className={[styles.toggleTrack, theme === 'dark' ? styles.toggleTrackOn : ''].filter(Boolean).join(' ')}>
                  <span className={[styles.toggleThumb, theme === 'dark' ? styles.toggleThumbOn : ''].filter(Boolean).join(' ')} />
                </span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
