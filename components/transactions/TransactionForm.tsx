'use client';

import { useState, useEffect, useRef } from 'react';
import ReactSelect from 'react-select';
import { FiSliders } from 'react-icons/fi';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import LabelSelect from '@/components/ui/LabelSelect';
import CategoryPicker from '@/components/ui/CategoryPicker';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';
import TransferSidePicker, { OUTSIDE } from './TransferSidePicker';
import { hexToRgba } from '@/lib/colorUtils';
import styles from './TransactionForm.module.css';

type FormMode = 'expense' | 'income' | 'transfer';


export interface TransactionFormData {
    type: TransactionType;
    amount: number;
    wallet_id: string;
    category_id: string | null;
    date: string;
    notes: string;
    payer: string;
    label_ids: string[];
    transfer?: {
        to_wallet_id: string;
        to_amount: number;
    };
    externalTransfer?: {
        direction: 'out' | 'in';
        account_name: string;
    };
}

interface TransactionFormProps {
    transaction?: Transaction;
    transferPair?: Transaction;
    wallets: Wallet[];
    categories: Category[];
    labels: Label[];
    onSave: (data: TransactionFormData) => Promise<void>;
    onDelete?: () => Promise<void>;
    onClose: () => void;
}

export default function TransactionForm({
    transaction,
    transferPair,
    wallets,
    categories,
    labels,
    onSave,
    onDelete,
    onClose,
}: TransactionFormProps) {
    const defaultWallet = wallets.find(w => w.is_default && !w.is_archived) ?? wallets.find(w => !w.is_archived) ?? wallets[0];

    const [mode, setMode] = useState<FormMode>(transaction?.transfer_group_id ? 'transfer' : (transaction?.type ?? 'expense'));
    const [walletId, setWalletId] = useState<string>(transaction?.wallet_id ?? defaultWallet?.id ?? '');
    const [amount, setAmount] = useState<string>(transaction ? String(transaction.amount) : '');
    const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? '');
    const [date, setDate] = useState<string>(transaction?.date ?? todayInputDate());
    const [notes, setNotes] = useState<string>(transaction?.notes ?? '');
    const [payer, setPayer] = useState<string>(transaction?.payer ?? '');
    const [labelIds, setLabelIds] = useState<string[]>(transaction?.labels?.map(l => l.id) ?? []);

    // Prefilled from the paired leg when editing
    const [toWalletId, setToWalletId] = useState<string>(transferPair?.wallet_id ?? '');
    const [toAmount, setToAmount] = useState<string>(transferPair ? String(transferPair.amount) : '');

    // A transfer with no paired leg is external
    const isEditingExternal = !!transaction?.transfer_group_id && !transferPair;
    const [transferScope, setTransferScope] = useState<'internal' | 'external'>(
        isEditingExternal ? 'external' : 'internal'
    );
    const [externalDirection, setExternalDirection] = useState<'out' | 'in'>(
        isEditingExternal ? (transaction!.type === 'expense' ? 'out' : 'in') : 'out'
    );
    const [externalAccount, setExternalAccount] = useState<string>(
        isEditingExternal ? (transaction?.payer ?? '') : ''
    );

    const [pickerSide, setPickerSide] = useState<'from' | 'to' | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoreOptions, setShowMoreOptions] = useState(
        !!(transaction?.payer || transaction?.notes || transaction?.labels?.length)
    );

    // Starting values; the form is dirty only when a field differs from these.
    const initial = useRef({
        mode, walletId, amount, categoryId, date, notes, payer,
        labelIds: [...labelIds].sort(),
        toWalletId, toAmount, transferScope, externalDirection, externalAccount,
    }).current;

    const dirty = mode !== initial.mode
        || walletId !== initial.walletId
        || amount !== initial.amount
        || categoryId !== initial.categoryId
        || date !== initial.date
        || notes !== initial.notes
        || payer !== initial.payer
        || JSON.stringify([...labelIds].sort()) !== JSON.stringify(initial.labelIds)
        || (mode === 'transfer' && transferScope === 'internal' && (toWalletId !== initial.toWalletId || toAmount !== initial.toAmount))
        || (mode === 'transfer' && transferScope === 'external' && (externalDirection !== initial.externalDirection || externalAccount !== initial.externalAccount))
        || (mode === 'transfer' && transferScope !== initial.transferScope);

    function handleClose() {
        if (dirty) {
            setShowCloseConfirm(true);
        } else {
            onClose();
        }
    }

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                if (pickerSide) return;
                e.preventDefault();
                if (dirty) {
                    setShowCloseConfirm(true);
                } else {
                    onClose();
                }
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [dirty, onClose, pickerSide]);

    const selectedWallet = wallets.find(w => w.id === walletId);
    const toWallet = wallets.find(w => w.id === toWalletId);
    const sameCurrency = selectedWallet && toWallet && selectedWallet.currency === toWallet.currency;

    // Hide archived wallets except the selected one
    const activeWallets = wallets.filter(w => !w.is_archived || w.id === walletId);
    const activeToWallets = wallets.filter(w => !w.is_archived || w.id === toWalletId);

    // Transfer sides: one From -> To model. Either side may be outside Purrfolio (not both).
    const fromExternal = transferScope === 'external' && externalDirection === 'in';
    const toExternal = transferScope === 'external' && externalDirection === 'out';
    const fromSideWalletId = fromExternal ? '' : walletId;
    const toSideWalletId = toExternal ? '' : transferScope === 'external' ? walletId : toWalletId;
    const fx = transferScope === 'internal' && !!selectedWallet && !!toWallet && !sameCurrency;

    function setFromSide(value: string) {
        if (value === OUTSIDE) {
            if (fromExternal) return;
            const accountSide = toWalletId || walletId;
            setTransferScope('external');
            setExternalDirection('in');
            setWalletId(accountSide);
        } else if (fromExternal) {
            // The account side was the "to" account
            setTransferScope('internal');
            setToWalletId(walletId);
            setWalletId(value);
        } else if (toExternal) {
            setWalletId(value);
        } else {
            handleFromWalletChange(value);
        }
    }

    function setToSide(value: string) {
        if (value === OUTSIDE) {
            if (toExternal) return;
            setTransferScope('external');
            setExternalDirection('out');
        } else if (toExternal) {
            setTransferScope('internal');
            setToWalletId(value);
        } else if (fromExternal) {
            setWalletId(value);
        } else {
            handleToWalletChange(value);
        }
    }

    function swapSides() {
        if (transferScope === 'external') {
            setExternalDirection(d => d === 'out' ? 'in' : 'out');
            return;
        }
        const prevWallet = walletId;
        const prevAmount = amount;
        setWalletId(toWalletId);
        setToWalletId(prevWallet);
        setAmount(toAmount || amount);
        setToAmount(toAmount ? prevAmount : '');
    }

    // Same currency: copy the amount to the to-amount
    function handleFromAmountChange(val: string) {
        setAmount(val);
        if (sameCurrency) setToAmount(val);
    }

    function handleToWalletChange(id: string) {
        setToWalletId(id);
        const newToWallet = wallets.find(w => w.id === id);
        if (newToWallet && selectedWallet && newToWallet.currency === selectedWallet.currency) {
            setToAmount(amount);
        }
    }

    function handleFromWalletChange(id: string) {
        setWalletId(id);
        const newFromWallet = wallets.find(w => w.id === id);
        if (newFromWallet && toWallet && newFromWallet.currency === toWallet.currency) {
            setToAmount(amount);
        }
    }

    // Clear a category that doesn't match the mode (e.g. after switching tabs)
    useEffect(() => {
        if (mode === 'transfer' || !categoryId) return;
        const selected = categories.find(c => c.id === categoryId);
        if (selected && selected.type !== 'both' && selected.type !== mode) {
            setCategoryId('');
        }
    }, [mode, categoryId, categories]);

    function toggleLabel(id: string) {
        setLabelIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (mode === 'transfer') {
            if (!walletId) { setError('Please select an account.'); return; }

            if (transferScope === 'external') {
                if (!externalAccount.trim()) { setError('Please enter the external account name.'); return; }
                const parsedAmount = Number(amount);
                if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) { setError('Please enter a valid amount.'); return; }
                setSaving(true);
                try {
                    await onSave({
                        type: externalDirection === 'out' ? 'expense' : 'income',
                        amount: parsedAmount,
                        wallet_id: walletId,
                        category_id: null,
                        date,
                        notes,
                        payer: '',
                        label_ids: [],
                        externalTransfer: { direction: externalDirection, account_name: externalAccount.trim() },
                    });
                } catch {
                    setError('Something went wrong. Please try again.');
                    setSaving(false);
                }
                return;
            }

            if (!toWalletId) { setError('Please select a destination account.'); return; }
            if (walletId === toWalletId) { setError('Source and destination accounts must be different.'); return; }
            const parsedFrom = Number(amount);
            const parsedTo = Number(toAmount);
            if (!amount || isNaN(parsedFrom) || parsedFrom <= 0) { setError('Please enter a valid amount sent.'); return; }
            if (!toAmount || isNaN(parsedTo) || parsedTo <= 0) { setError('Please enter a valid amount received.'); return; }
            setSaving(true);
            try {
                await onSave({
                    type: 'expense',
                    amount: parsedFrom,
                    wallet_id: walletId,
                    category_id: null,
                    date,
                    notes,
                    payer: '',
                    label_ids: [],
                    transfer: { to_wallet_id: toWalletId, to_amount: parsedTo },
                });
            } catch {
                setError('Something went wrong. Please try again.');
                setSaving(false);
            }
            return;
        }

        if (!walletId) { setError('Please select an account.'); return; }
        const parsedAmount = Number(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            setError('Please enter a valid amount.');
            return;
        }
        setSaving(true);
        try {
            await onSave({
                type: mode as TransactionType,
                amount: parsedAmount,
                wallet_id: walletId,
                category_id: categoryId || null,
                date,
                notes,
                payer,
                label_ids: labelIds,
            });
        } catch {
            setError('Something went wrong. Please try again.');
            setSaving(false);
        }
    }

    if (wallets.length === 0) {
        return (
            <div className={styles.overlay} onClick={handleClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                    <div className={styles.modalHeader}>
                        <h2 className={styles.title}>Add record</h2>
                        <button className={styles.closeBtn} type="button" onClick={handleClose} aria-label="Close">✕</button>
                    </div>
                    <p className={styles.noWalletMsg}>
                        You need at least one account before adding records. Go to <strong>Accounts</strong> to create one.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay} onClick={handleClose}>
            <div
                className={styles.modal}
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="form-title"
            >
                <div className={styles.modalHeader}>
                    <h2 id="form-title" className={styles.title}>
                        {transaction ? 'Edit record' : 'Add record'}
                    </h2>
                    <button className={styles.closeBtn} type="button" onClick={handleClose} aria-label="Close">✕</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.typeTabs}>
                        <button type="button" className={[styles.typeTab, mode === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('expense')}>Expense</button>
                        <button type="button" className={[styles.typeTab, mode === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('income')}>Income</button>
                        <button type="button" className={[styles.typeTab, mode === 'transfer' ? styles.typeTabTransferActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('transfer')}>Transfer</button>
                    </div>

                    {mode === 'transfer' ? (
                        <div className={styles.transferGrid}>
                            <div className={styles.sides}>
                                {([
                                    { key: 'from', label: 'From', external: fromExternal, walletId: fromSideWalletId },
                                    { key: 'to', label: 'To', external: toExternal, walletId: toSideWalletId },
                                ] as const).map(side => {
                                    const wallet = wallets.find(w => w.id === side.walletId);
                                    return (
                                        <div key={side.key} className={styles.sideCard}>
                                            <div className={styles.sideHeader}>
                                                <span className={styles.sideLabel}>{side.label}</span>
                                                <span className={styles.sideKind}>{side.external ? 'Outside Purrfolio' : 'Your account'}</span>
                                            </div>
                                            {side.external ? (
                                                <div className={styles.sideRow}>
                                                    <span className={`${styles.sideTile} ${styles.sideTileOutside}`} aria-hidden="true">
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                                    </span>
                                                    <Input
                                                        type="text"
                                                        aria-label={side.key === 'from' ? 'Who is sending the money' : 'Who receives the money'}
                                                        value={externalAccount}
                                                        onChange={e => setExternalAccount(e.target.value)}
                                                        placeholder="e.g. Employer, Anna, PayPal"
                                                    />
                                                    <button type="button" className={styles.changeBtn} onClick={() => setPickerSide(side.key)}>Change</button>
                                                </div>
                                            ) : (
                                                <button type="button" className={styles.sideBtn} aria-haspopup="dialog" onClick={() => setPickerSide(side.key)}>
                                                    <span className={styles.sideTile} style={wallet ? { background: hexToRgba(wallet.color, 0.2) } : undefined} aria-hidden="true">{wallet?.icon ?? '?'}</span>
                                                    <span className={styles.sideText}>
                                                        <span className={styles.sideName}>{wallet?.name ?? 'Select account'}</span>
                                                        {wallet && <span className={styles.sideMeta}>{wallet.currency}</span>}
                                                    </span>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                                <button type="button" className={styles.swapBtn} onClick={swapSides} aria-label="Swap From and To">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="7 3 7 21" /><polyline points="3 17 7 21 11 17" /><polyline points="17 21 17 3" /><polyline points="13 7 17 3 21 7" /></svg>
                                </button>
                            </div>

                            {fx ? (
                                <div className={styles.fxRow}>
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="from-amount" required>Amount sent</FormLabel>
                                        <div className={styles.amountRow}>
                                            <NumberInput id="from-amount" value={amount} onChange={handleFromAmountChange} placeholder="0" required autoFocus />
                                            <span className={styles.currencyBadge}>{selectedWallet?.currency ?? '—'}</span>
                                        </div>
                                    </div>
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="to-amount" required>Amount received</FormLabel>
                                        <div className={styles.amountRow}>
                                            <NumberInput id="to-amount" value={toAmount} onChange={setToAmount} placeholder="0" required />
                                            <span className={styles.currencyBadge}>{toWallet?.currency ?? '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.field}>
                                    <FormLabel htmlFor="from-amount" required>Amount</FormLabel>
                                    <div className={styles.amountRow}>
                                        {transferScope === 'external' && (
                                            <span className={[styles.amountSign, toExternal ? styles.amountSignExpense : styles.amountSignIncome].join(' ')}>
                                                {toExternal ? '−' : '+'}
                                            </span>
                                        )}
                                        <NumberInput id="from-amount" value={amount} onChange={handleFromAmountChange} placeholder="0" required autoFocus />
                                        <span className={styles.currencyBadge}>{selectedWallet?.currency ?? '—'}</span>
                                    </div>
                                </div>
                            )}

                            <div className={styles.field}>
                                <FormLabel htmlFor="transfer-date" required>Date</FormLabel>
                                <Input id="transfer-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                            </div>

                            <div className={styles.field}>
                                <FormLabel htmlFor="transfer-notes">Note</FormLabel>
                                <textarea id="transfer-notes" className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional note" />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.recordFields}>
                            <div className={styles.amountDisplay}>
                                <label htmlFor="amount" className={styles.amountDisplayLabel}>Amount</label>
                                <div className={styles.amountDisplayRow}>
                                    <span className={[styles.amountSign, mode === 'expense' ? styles.amountSignExpense : styles.amountSignIncome].join(' ')}>
                                        {mode === 'expense' ? '−' : '+'}
                                    </span>
                                    <NumberInput
                                        id="amount"
                                        value={amount}
                                        onChange={setAmount}
                                        placeholder="0"
                                        required
                                        autoFocus
                                        size={Math.max((amount || '0').length + 1, 2)}
                                        className={styles.amountBigInput}
                                        style={{
                                            width: 'auto',
                                            fontFamily: 'var(--font-nunito)',
                                            fontSize: '3rem',
                                            fontWeight: 800,
                                            color: 'var(--color-text)',
                                            textAlign: 'center',
                                        }}
                                    />
                                    <span className={styles.amountUnit}>{selectedWallet?.currency ?? ''}</span>
                                </div>
                            </div>

                            <div className={styles.field}>
                                <FormLabel htmlFor="category">Category</FormLabel>
                                <CategoryPicker
                                    id="category"
                                    categories={categories}
                                    mode={mode}
                                    value={categoryId}
                                    onChange={setCategoryId}
                                    placeholder="Choose category"
                                />
                            </div>

                            <div className={styles.miniFieldsRow}>
                                <div className={styles.field}>
                                    <FormLabel htmlFor="wallet" required>Account</FormLabel>
                                    <ReactSelect<{ value: string; label: string }>
                                        inputId="wallet"
                                        options={activeWallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name}` }))}
                                        value={selectedWallet ? { value: walletId, label: `${selectedWallet.icon} ${selectedWallet.name}` } : null}
                                        onChange={(opt) => opt && setWalletId(opt.value)}
                                        isSearchable
                                        styles={makeRsStyles()}
                                        theme={rsTheme}
                                        menuPosition="fixed"
                                        placeholder="Select account…"
                                    />
                                </div>

                                <div className={styles.field}>
                                    <FormLabel htmlFor="date" required>Date</FormLabel>
                                    <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                                </div>
                            </div>

                            <button
                                type="button"
                                className={styles.moreOptionsToggle}
                                onClick={() => setShowMoreOptions(v => !v)}
                                aria-expanded={showMoreOptions}
                            >
                                <FiSliders />
                                {showMoreOptions ? 'Fewer options' : 'More options'}
                            </button>

                            {showMoreOptions && (
                                <div className={styles.moreOptionsPanel}>
                                    {labels.length > 0 && (
                                        <div className={styles.field}>
                                            <FormLabel>Labels</FormLabel>
                                            <LabelSelect labels={labels} selectedIds={labelIds} onChange={setLabelIds} />
                                        </div>
                                    )}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="payer">Payee</FormLabel>
                                        <Input id="payer" type="text" value={payer} onChange={e => setPayer(e.target.value)} />
                                    </div>
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="notes">Notes</FormLabel>
                                        <textarea id="notes" className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className={styles.errorMsg}>{error}</p>}

                    <div className={styles.actions}>
                        {transaction && onDelete && (
                            <Button
                                type="button"
                                variant="danger"
                                loading={deleting}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                Delete
                            </Button>
                        )}
                        <Button type="submit" variant="primary" size="md" loading={saving}>
                            {mode === 'transfer' ? 'Transfer' : transaction ? 'Save changes' : 'Add record'}
                        </Button>
                    </div>
                </form>
            </div>

            {pickerSide && (
                <div onClick={e => e.stopPropagation()}>
                    <TransferSidePicker
                        side={pickerSide}
                        wallets={wallets}
                        value={pickerSide === 'from' ? (fromExternal ? OUTSIDE : fromSideWalletId) : (toExternal ? OUTSIDE : toSideWalletId)}
                        otherValue={pickerSide === 'from' ? (toExternal ? OUTSIDE : toSideWalletId) : (fromExternal ? OUTSIDE : fromSideWalletId)}
                        onPick={value => {
                            (pickerSide === 'from' ? setFromSide : setToSide)(value);
                            setPickerSide(null);
                        }}
                        onClose={() => setPickerSide(null)}
                    />
                </div>
            )}

            {showDeleteConfirm && (
                <ConfirmDialog
                    title="Delete transaction"
                    message="Are you sure you want to delete this transaction? This cannot be undone."
                    confirmLabel="Delete"
                    onConfirm={async () => {
                        setShowDeleteConfirm(false);
                        setDeleting(true);
                        try {
                            await onDelete!();
                            onClose();
                        } catch {
                            setDeleting(false);
                            setError('Failed to delete. Please try again.');
                        }
                    }}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}

            {showCloseConfirm && (
                <ConfirmDialog
                    title="Discard changes?"
                    message="You have unsaved data. If you close now, everything you entered will be lost."
                    confirmLabel="Discard"
                    cancelLabel="Keep editing"
                    onConfirm={onClose}
                    onCancel={() => setShowCloseConfirm(false)}
                />
            )}
        </div>
    );
}
