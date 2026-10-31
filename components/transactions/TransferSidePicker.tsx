'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { hexToRgba } from '@/lib/colorUtils';
import type { Wallet } from '@/lib/types';
import styles from './TransferSidePicker.module.css';

export const OUTSIDE = '__outside__';

interface Props {
    side: 'from' | 'to';
    wallets: Wallet[];
    /** Currently chosen wallet id for this side, or OUTSIDE */
    value: string;
    /** The other side's wallet id, or OUTSIDE */
    otherValue: string;
    onPick: (value: string) => void;
    onClose: () => void;
}

export default function TransferSidePicker({ side, wallets, value, otherValue, onPick, onClose }: Props) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const otherSide = side === 'from' ? 'To' : 'From';

    const rows = wallets.filter(w =>
        (!w.is_archived || w.id === value) &&
        (!q || w.name.toLowerCase().includes(q) || w.currency.toLowerCase().includes(q))
    );
    const total = wallets.filter(w => !w.is_archived || w.id === value).length;
    const outsideDisabled = otherValue === OUTSIDE;

    return (
        <Dialog title={side === 'from' ? 'Transfer from' : 'Transfer to'} onClose={onClose} maxWidth={420}>
            <div className={styles.wrap}>
                <input
                    type="search"
                    className={styles.search}
                    placeholder="Search accounts"
                    aria-label="Search accounts"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />

                <button
                    type="button"
                    className={[styles.row, value === OUTSIDE ? styles.rowSelected : ''].filter(Boolean).join(' ')}
                    disabled={outsideDisabled}
                    onClick={() => onPick(OUTSIDE)}
                >
                    <span className={[styles.tile, styles.tileOutside].join(' ')} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    </span>
                    <span className={styles.text}>
                        <span className={styles.name}>Outside Purrfolio</span>
                        <span className={styles.meta}>
                            {outsideDisabled ? 'The other side is already outside.' : 'A person, employer, shop or untracked account'}
                        </span>
                    </span>
                    {value === OUTSIDE && <Check />}
                </button>

                <div className={styles.listHeader}>
                    <span className={styles.listTitle}>Your accounts</span>
                    <span className={styles.count}>{q ? `${rows.length} of ${total}` : `${total} accounts`}</span>
                </div>

                <div className={styles.list}>
                    {rows.map(w => {
                        const isOther = w.id === otherValue;
                        return (
                            <button
                                key={w.id}
                                type="button"
                                className={[styles.row, w.id === value ? styles.rowSelected : ''].filter(Boolean).join(' ')}
                                disabled={isOther}
                                onClick={() => onPick(w.id)}
                            >
                                <span className={styles.tile} style={{ background: hexToRgba(w.color, 0.2) }} aria-hidden="true">{w.icon}</span>
                                <span className={styles.text}>
                                    <span className={styles.name}>{w.name}</span>
                                    <span className={styles.meta}>
                                        {isOther ? `${w.currency} · already the ${otherSide} account` : w.currency}
                                    </span>
                                </span>
                                {w.id === value && <Check />}
                            </button>
                        );
                    })}
                    {rows.length === 0 && <p className={styles.empty}>No accounts match “{query}”.</p>}
                </div>
            </div>
        </Dialog>
    );
}

function Check() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Selected"><polyline points="20 6 9 17 4 12" /></svg>
    );
}
