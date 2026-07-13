'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './MobileHeader.module.css';

const settingsItems = [
  {
    label: 'Accounts',
    href: '/settings/accounts',
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

export default function MobileHeader() {
  const pathname = usePathname();
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
          </nav>
        </div>
      )}
    </>
  );
}
