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
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';
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

    // Transfer-specific state (pre-populated from the paired leg when editing)
    const [toWalletId, setToWalletId] = useState<string>(transferPair?.wallet_id ?? '');
    const [toAmount, setToAmount] = useState<string>(transferPair ? String(transferPair.amount) : '');

    // External transfer state — inferred from editing a transfer with no pair
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

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showMoreOptions, setShowMoreOptions] = useState(
        !!(transaction?.payer || transaction?.notes || transaction?.labels?.length)
    );

    // Snapshot of the form's starting values, so "dirty" reflects actual edits
    // rather than just whether we're editing an existing record.
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
    }, [dirty, onClose]);

    const selectedWallet = wallets.find(w => w.id === walletId);
    const toWallet = wallets.find(w => w.id === toWalletId);
    const sameCurrency = selectedWallet && toWallet && selectedWallet.currency === toWallet.currency;

    // For dropdowns: hide archived wallets but keep the currently selected one visible
    const activeWallets = wallets.filter(w => !w.is_archived || w.id === walletId);
    const activeToWallets = wallets.filter(w => !w.is_archived || w.id === toWalletId);

    // Auto-fill to-amount when same currency
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

    const matchesMode = (c: Category) => c.type === 'both' || c.type === mode;

    const parentCategories = categories.filter(c => !c.parent_id);
    const childCategories = categories.filter(c => c.parent_id);
    const categoryOptions: SelectOption[] = [];
    for (const parent of parentCategories) {
        const children = childCategories.filter(c => c.parent_id === parent.id);
        if (children.length > 0) {
            // Parent has children → heading only, matching children are the selectable items
            for (const child of children.filter(matchesMode)) {
                categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}`, group: `${parent.icon} ${parent.name}` });
            }
        } else if (matchesMode(parent)) {
            // Parent has no children → selectable on its own
            categoryOptions.push({ value: parent.id, label: `${parent.icon} ${parent.name}` });
        }
    }
    for (const child of childCategories.filter(c => !parentCategories.find(p => p.id === c.parent_id) && matchesMode(c))) {
        categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}` });
    }

    // Clear a selected category that no longer matches the active mode (e.g. after switching tabs)
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
                    {/* Mode tabs */}
                    <div className={styles.typeTabs}>
                        <button type="button" className={[styles.typeTab, mode === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('expense')}>Expense</button>
                        <button type="button" className={[styles.typeTab, mode === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('income')}>Income</button>
                        <button type="button" className={[styles.typeTab, mode === 'transfer' ? styles.typeTabTransferActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('transfer')}>Transfer</button>
                    </div>

                    {mode === 'transfer' ? (
                        /* ── Transfer form ── */
                        <div className={styles.transferGrid}>
                            {/* Internal / External scope toggle */}
                            <div className={`${styles.field} ${styles.transferScopeRow}`}>
                                <button
                                    type="button"
                                    className={[styles.scopeTab, transferScope === 'internal' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
                                    onClick={() => setTransferScope('internal')}
                                >
                                    ↔ Between my accounts
                                </button>
                                <button
                                    type="button"
                                    className={[styles.scopeTab, transferScope === 'external' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
                                    onClick={() => setTransferScope('external')}
                                >
                                    ⇄ External account
                                </button>
                            </div>

                            {transferScope === 'external' ? (
                                <>
                                    {/* Direction toggle */}
                                    <div className={`${styles.field} ${styles.transferScopeRow}`}>
                                        <button
                                            type="button"
                                            className={[styles.scopeTab, externalDirection === 'out' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
                                            onClick={() => setExternalDirection('out')}
                                        >
                                            ↑ Sending out
                                        </button>
                                        <button
                                            type="button"
                                            className={[styles.scopeTab, externalDirection === 'in' ? styles.scopeTabActive : ''].filter(Boolean).join(' ')}
                                            onClick={() => setExternalDirection('in')}
                                        >
                                            ↓ Receiving
                                        </button>
                                    </div>

                                    {/* My account */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="ext-wallet" required>
                                            {externalDirection === 'out' ? 'From account' : 'To account'}
                                        </FormLabel>
                                        <ReactSelect<{ value: string; label: string }>
                                            inputId="ext-wallet"
                                            options={activeWallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }))}
                                            value={selectedWallet ? { value: walletId, label: `${selectedWallet.icon} ${selectedWallet.name} (${selectedWallet.currency})` } : null}
                                            onChange={(opt) => opt && setWalletId(opt.value)}
                                            isSearchable
                                            styles={makeRsStyles()}
                                            theme={rsTheme}
                                            menuPosition="fixed"
                                            placeholder="Select account…"
                                        />
                                    </div>

                                    {/* Amount */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="ext-amount" required>Amount</FormLabel>
                                        <div className={styles.amountRow}>
                                            <NumberInput id="ext-amount" value={amount} onChange={setAmount} placeholder="0" required autoFocus />
                                            <span className={styles.currencyBadge}>{selectedWallet?.currency ?? '—'}</span>
                                        </div>
                                    </div>

                                    {/* External account name */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="ext-account" required>External account</FormLabel>
                                        <Input
                                            id="ext-account"
                                            type="text"
                                            value={externalAccount}
                                            onChange={e => setExternalAccount(e.target.value)}
                                            placeholder="e.g. PayPal, Bank transfer, John Doe…"
                                        />
                                    </div>

                                    {/* Date */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="ext-date" required>Date</FormLabel>
                                        <Input id="ext-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                                    </div>

                                    {/* Note */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="ext-notes">Note</FormLabel>
                                        <textarea id="ext-notes" className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional note" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* From account */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="from-wallet" required>From account</FormLabel>
                                        <ReactSelect<{ value: string; label: string }>
                                            inputId="from-wallet"
                                            options={activeWallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }))}
                                            value={selectedWallet ? { value: walletId, label: `${selectedWallet.icon} ${selectedWallet.name} (${selectedWallet.currency})` } : null}
                                            onChange={(opt) => opt && handleFromWalletChange(opt.value)}
                                            isSearchable
                                            styles={makeRsStyles()}
                                            theme={rsTheme}
                                            menuPosition="fixed"
                                            placeholder="Select account…"
                                        />
                                    </div>

                                    {/* Amount sent */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="from-amount" required>Amount sent</FormLabel>
                                        <div className={styles.amountRow}>
                                            <NumberInput id="from-amount" value={amount} onChange={handleFromAmountChange} placeholder="0" required autoFocus />
                                            <span className={styles.currencyBadge}>{selectedWallet?.currency ?? '—'}</span>
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <div className={styles.transferArrowRow}>
                                        <span className={styles.transferArrow}>↓</span>
                                    </div>

                                    {/* To account */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="to-wallet" required>To account</FormLabel>
                                        {(() => {
                                            const toWalletOptions = activeToWallets.filter(w => w.id !== walletId).map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }));
                                            const toWalletValue = toWalletOptions.find(o => o.value === toWalletId) ?? null;
                                            return (
                                                <ReactSelect<{ value: string; label: string }>
                                                    inputId="to-wallet"
                                                    options={toWalletOptions}
                                                    value={toWalletValue}
                                                    onChange={(opt) => opt && handleToWalletChange(opt.value)}
                                                    isSearchable
                                                    styles={makeRsStyles()}
                                                    theme={rsTheme}
                                                    menuPosition="fixed"
                                                    placeholder="Select account…"
                                                />
                                            );
                                        })()}
                                    </div>

                                    {/* Amount received */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="to-amount" required>Amount received</FormLabel>
                                        <div className={styles.amountRow}>
                                            <NumberInput
                                                id="to-amount"
                                                value={toAmount}
                                                onChange={setToAmount}
                                                placeholder="0"
                                                required
                                                readOnly={sameCurrency ?? false}
                                            />
                                            <span className={styles.currencyBadge}>{toWallet?.currency ?? '—'}</span>
                                        </div>
                                        {sameCurrency && <p className={styles.sameHint}>Same currency — amount auto-matched</p>}
                                    </div>

                                    {/* Date */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="transfer-date" required>Date</FormLabel>
                                        <Input id="transfer-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                                    </div>

                                    {/* Note */}
                                    <div className={styles.field}>
                                        <FormLabel htmlFor="transfer-notes">Note</FormLabel>
                                        <textarea id="transfer-notes" className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional note" />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        /* ── Income / Expense form ── */
                        <div className={styles.recordFields}>
                            {/* Amount */}
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

                            {/* Category */}
                            <div className={styles.field}>
                                <FormLabel htmlFor="category">Category</FormLabel>
                                <SearchableSelect id="category" options={categoryOptions} value={categoryId} onChange={setCategoryId} placeholder="Choose category" />
                            </div>

                            {/* Account + Date */}
                            <div className={styles.miniFieldsRow}>
                                <div className={styles.field}>
                                    <FormLabel htmlFor="wallet" required>Account</FormLabel>
                                    <ReactSelect<{ value: string; label: string }>
                                        inputId="wallet"
                                        options={activeWallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }))}
                                        value={selectedWallet ? { value: walletId, label: `${selectedWallet.icon} ${selectedWallet.name} (${selectedWallet.currency})` } : null}
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

                            {/* More options toggle */}
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
                        <Button type="submit" variant="primary" size="lg" loading={saving}>
                            {mode === 'transfer' ? 'Transfer' : transaction ? 'Save changes' : 'Add record'}
                        </Button>
                    </div>
                </form>
            </div>

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
