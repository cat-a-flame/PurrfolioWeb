'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './PeriodPicker.module.css';

const DROPDOWN_WIDTH = 300;
const DROPDOWN_MARGIN = 8;

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_SHORT   = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export type PeriodTab = 'custom' | 'weeks' | 'months' | 'years';

export interface PeriodValue {
  from: string;
  to: string;
  label: string;
  tab: PeriodTab;
}

interface Props {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  onClear?: () => void;
  hideNav?: boolean;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const y1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - y1.getTime()) / 86400000 + 1) / 7);
}

function weekStart(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  return r;
}

function weeksForMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const start = new Date(first);
  start.setDate(1 - (dow === 0 ? 6 : dow - 1));
  const rows: { start: Date; end: Date }[] = [];
  for (let i = 0; i < 6; i++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + i * 7);
    if (ws.getMonth() > month && ws.getFullYear() >= year && i >= 4) break;
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    rows.push({ start: ws, end: we });
  }
  return rows;
}

export default function PeriodPicker({ value, onChange, onClear, hideNav }: Props) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PeriodTab>(value.tab);

  const [viewYear, setViewYear]       = useState(now.getFullYear());
  const [decadeStart, setDecadeStart] = useState(Math.floor(now.getFullYear() / 10) * 10);
  const [wkYear, setWkYear]           = useState(now.getFullYear());
  const [wkMonth, setWkMonth]         = useState(now.getMonth());
  const [cfrom, setCfrom]             = useState(value.from);
  const [cto, setCto]                 = useState(value.to);

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Position the dropdown against the trigger via a portal so it can't be
  // clipped by a scrollable/overflow-hidden ancestor (e.g. the transactions
  // page's filter sidebar).
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - DROPDOWN_WIDTH / 2;
      left = Math.max(DROPDOWN_MARGIN, Math.min(left, window.innerWidth - DROPDOWN_WIDTH - DROPDOWN_MARGIN));
      setPos({ top: rect.bottom + DROPDOWN_MARGIN, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  function emit(from: string, to: string, label: string, t: PeriodTab) {
    onChange({ from, to, label, tab: t });
    setOpen(false);
  }

  function selectMonth(y: number, m: number) {
    const f = isoDate(new Date(y, m, 1));
    const t = isoDate(new Date(y, m + 1, 0));
    const isThis = y === now.getFullYear() && m === now.getMonth();
    emit(f, t, isThis ? 'This month' : `${MONTH_LONG[m]} ${y}`, 'months');
  }

  function selectYear(y: number) {
    const isThis = y === now.getFullYear();
    emit(`${y}-01-01`, `${y}-12-31`, isThis ? 'This year' : String(y), 'years');
  }

  function selectWeek(ws: Date) {
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const thisWS = weekStart(now);
    const isThis = isoDate(ws) === isoDate(thisWS);
    const wk = getISOWeek(ws);
    emit(isoDate(ws), isoDate(we), isThis ? 'This week' : `Week ${wk}, ${ws.getFullYear()}`, 'weeks');
  }

  function applyCustom() {
    if (cfrom && cto) emit(cfrom, cto, `${cfrom} – ${cto}`, 'custom');
  }

  function navigate(dir: -1 | 1) {
    const f = value.from ? new Date(value.from + 'T12:00:00') : new Date();
    if (tab === 'years') {
      const y = f.getFullYear() + dir;
      selectYear(y);
    } else if (tab === 'weeks') {
      const ws = new Date(f);
      ws.setDate(f.getDate() + dir * 7);
      selectWeek(weekStart(ws));
    } else if (tab === 'months') {
      let m = f.getMonth() + dir, y = f.getFullYear();
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      selectMonth(y, m);
      setViewYear(y);
    }
  }

  function switchTab(t: PeriodTab) {
    setTab(t);
    if (t !== 'custom') setOpen(true);
  }

  const isMonthSel  = (y: number, m: number) => value.from === isoDate(new Date(y, m, 1)) && value.to === isoDate(new Date(y, m + 1, 0));
  const isYearSel   = (y: number) => value.from === `${y}-01-01` && value.to === `${y}-12-31`;
  const isWeekSel   = (ws: Date) => value.from === isoDate(ws);
  const years       = Array.from({ length: 12 }, (_, i) => decadeStart + i);

  return (
    <div className={styles.container} ref={triggerRef}>
      <div className={styles.trigger}>
        {!hideNav && (
          <button className={styles.navBtn} onClick={() => navigate(-1)} aria-label="Previous" disabled={!value.from}>
            <Chevron direction="left" />
          </button>
        )}
        <button className={styles.labelBtn} onClick={() => setOpen(o => !o)}>
          {value.label}
        </button>
        {onClear && value.from ? (
          <button className={styles.clearBtn} onClick={onClear} aria-label="Clear date filter">×</button>
        ) : (
          !hideNav && (
            <button className={styles.navBtn} onClick={() => navigate(1)} aria-label="Next" disabled={!value.from}>
              <Chevron direction="right" />
            </button>
          )
        )}
      </div>

      {open && pos && createPortal(
        <div className={styles.dropdown} ref={dropdownRef} style={{ top: pos.top, left: pos.left }}>
          <div className={styles.tabs}>
            {(['custom', 'weeks', 'months', 'years'] as PeriodTab[]).map(t => (
              <button
                key={t}
                className={[styles.tab, tab === t ? styles.tabActive : ''].filter(Boolean).join(' ')}
                onClick={() => switchTab(t)}
              >
                {t === 'custom' ? 'Custom range' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Months */}
          {tab === 'months' && (
            <div className={styles.panel}>
              <div className={styles.panelNav}>
                <button className={styles.panelNavBtn} onClick={() => setViewYear(y => y - 1)}>‹</button>
                <span className={styles.panelNavLabel}>{viewYear}</span>
                <button className={styles.panelNavBtn} onClick={() => setViewYear(y => y + 1)}>›</button>
              </div>
              <div className={styles.monthGrid}>
                {MONTH_SHORT.map((m, i) => (
                  <button
                    key={i}
                    className={[
                      styles.cell,
                      isMonthSel(viewYear, i) ? styles.cellSelected : '',
                      !isMonthSel(viewYear, i) && viewYear === now.getFullYear() && i === now.getMonth() ? styles.cellCurrent : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectMonth(viewYear, i)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Weeks */}
          {tab === 'weeks' && (
            <div className={styles.panel}>
              <div className={styles.panelNav}>
                <button className={styles.panelNavBtn} onClick={() => {
                  let m = wkMonth - 1, y = wkYear;
                  if (m < 0) { m = 11; y--; }
                  setWkMonth(m); setWkYear(y);
                }}>‹</button>
                <span className={styles.panelNavLabel}>{MONTH_SHORT[wkMonth]} {wkYear}</span>
                <button className={styles.panelNavBtn} onClick={() => {
                  let m = wkMonth + 1, y = wkYear;
                  if (m > 11) { m = 0; y++; }
                  setWkMonth(m); setWkYear(y);
                }}>›</button>
              </div>
              <div className={styles.dayHeaders}>
                {DAY_SHORT.map(d => <span key={d} className={styles.dayHeader}>{d}</span>)}
              </div>
              <div className={styles.weekGrid}>
                {weeksForMonth(wkYear, wkMonth).map(({ start: ws, end: we }, i) => (
                  <button
                    key={i}
                    className={[styles.weekRow, isWeekSel(ws) ? styles.cellSelected : ''].filter(Boolean).join(' ')}
                    onClick={() => selectWeek(ws)}
                  >
                    {Array.from({ length: 7 }, (_, d) => {
                      const day = new Date(ws);
                      day.setDate(ws.getDate() + d);
                      const out = day.getMonth() !== wkMonth;
                      const today = isoDate(day) === isoDate(now);
                      return (
                        <span key={d} className={[
                          styles.weekDay,
                          out   ? styles.weekDayOut   : '',
                          today ? styles.weekDayToday : '',
                        ].filter(Boolean).join(' ')}>
                          {day.getDate()}
                        </span>
                      );
                    })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Years */}
          {tab === 'years' && (
            <div className={styles.panel}>
              <div className={styles.panelNav}>
                <button className={styles.panelNavBtn} onClick={() => setDecadeStart(d => d - 12)}>‹</button>
                <span className={styles.panelNavLabel}>{decadeStart}–{decadeStart + 11}</span>
                <button className={styles.panelNavBtn} onClick={() => setDecadeStart(d => d + 12)}>›</button>
              </div>
              <div className={styles.monthGrid}>
                {years.map(y => (
                  <button
                    key={y}
                    className={[
                      styles.cell,
                      isYearSel(y) ? styles.cellSelected : '',
                      !isYearSel(y) && y === now.getFullYear() ? styles.cellCurrent : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom */}
          {tab === 'custom' && (
            <div className={styles.panel}>
              <div className={styles.customFields}>
                <div className={styles.customField}>
                  <label className={styles.customLabel}>From</label>
                  <input type="date" className={styles.customDate} value={cfrom} onChange={e => setCfrom(e.target.value)} />
                </div>
                <div className={styles.customField}>
                  <label className={styles.customLabel}>To</label>
                  <input type="date" className={styles.customDate} value={cto} onChange={e => setCto(e.target.value)} />
                </div>
              </div>
              <button className={styles.applyBtn} onClick={applyCustom} disabled={!cfrom || !cto}>
                Apply
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
