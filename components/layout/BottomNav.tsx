'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAddRecord } from '@/components/transactions/AddRecordProvider';
import { useRecurringAlert } from '@/contexts/RecurringAlertContext';
import { hidesNav } from '@/lib/publicPaths';
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
    href: '/transactions',
    label: 'Records',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
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
];

const BAR_H = 66;
const PILL_R = 18;
const NOTCH_R = 36;
const NOTCH_CORNER = 12;

// Pill outline with a semicircular notch at the top centre (same path as the app's CustomTabBar).
function buildPillPath(w: number, h: number): string {
  const cx = w / 2;
  const r = PILL_R;
  return [
    `M 0.5 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0.5`,
    `L ${cx - NOTCH_R - NOTCH_CORNER} 0.5`,
    `Q ${cx - NOTCH_R} 0.5 ${cx - NOTCH_R} ${NOTCH_CORNER}`,
    `A ${NOTCH_R} ${NOTCH_R} 0 1 0 ${cx + NOTCH_R} ${NOTCH_CORNER}`,
    `Q ${cx + NOTCH_R} 0.5 ${cx + NOTCH_R + NOTCH_CORNER} 0.5`,
    `L ${w - r} 0.5`,
    `A ${r} ${r} 0 0 1 ${w - 0.5} ${r}`,
    `L ${w - 0.5} ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h - 0.5}`,
    `L ${r} ${h - 0.5}`,
    `A ${r} ${r} 0 0 1 0.5 ${h - r}`,
    'Z',
  ].join(' ');
}

export default function BottomNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState(false);

  // Hide on scroll down, show on scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    let lastH = window.innerHeight;
    let ticking = false;
    const update = () => {
      ticking = false;
      // The browser's address bar collapsing/expanding resizes the viewport and fires
      // scroll events of its own; ignore those so they can't toggle the nav.
      if (window.innerHeight !== lastH) {
        lastH = window.innerHeight;
        lastY = Math.max(0, window.scrollY);
        return;
      }
      const y = Math.max(0, window.scrollY); // ignore iOS rubber-band overscroll
      const delta = y - lastY;
      if (Math.abs(delta) < 8) return; // ignore jitter
      lastY = y;
      const nearTop = y < 24;
      setHidden(delta > 0 && !nearTop);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The browser's own toolbar expanding/collapsing resizes the viewport, which makes this
  // fixed element jump by the same amount. Animate that offset away so it glides instead.
  useEffect(() => {
    let lastH = window.innerHeight;
    const onResize = () => {
      const delta = lastH - window.innerHeight; // >0: viewport shrank, nav jumped up
      lastH = window.innerHeight;
      const el = navRef.current;
      if (!el || !delta || Math.abs(delta) > 120 || !el.animate) return;
      el.animate(
        [{ translate: `0 ${delta}px` }, { translate: '0 0' }],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Always reveal the nav when navigating to another page.
  useEffect(() => setHidden(false), [pathname]);
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const { openAddDialog } = useAddRecord();
  const hasUrgentPlanned = useRecurringAlert();

  // Logged-out pages have no app navigation.
  if (hidesNav(pathname)) return null;

  return (
    <nav ref={navRef} className={[styles.nav, hidden ? styles.navHidden : ''].filter(Boolean).join(' ')} aria-label="Mobile navigation">
      {width > 0 && (
        <svg className={styles.pill} width={width} height={BAR_H} aria-hidden>
          <path d={buildPillPath(width, BAR_H)} />
        </svg>
      )}

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
        <svg className={styles.ears} width="56" height="26" viewBox="0 0 56 26" aria-hidden>
          <path d="M 2 26 L 9 9 Q 13 1 17 9 L 24 26 Z" transform="rotate(-28 13 26)" />
          <path d="M 32 26 L 39 9 Q 43 1 47 9 L 54 26 Z" transform="rotate(28 43 26)" />
        </svg>
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
