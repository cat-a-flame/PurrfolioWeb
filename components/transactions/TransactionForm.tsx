'use client';

import { useState, useEffect } from 'react';
import ReactSelect from 'react-select';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import LabelSelect from '@/components/ui/LabelSelect';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import type { Transaction, Category, Label, Template, TransactionType, Wallet } from '@/lib/types';
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
}

interface TransactionFormProps {
  transaction?: Transaction;
  wallets: Wallet[];
  categories: Category[];
  labels: Label[];
  templates?: Template[];
  onSave: (data: TransactionFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function TransactionForm({
  transaction,
  wallets,
  categories,
  labels,
  templates,
  onSave,
  onDelete,
  onClose,
}: TransactionFormProps) {
  const defaultWallet = wallets.find(w => w.is_default) ?? wallets[0];

  const [mode, setMode] = useState<FormMode>(transaction?.transfer_group_id ? 'transfer' : (transaction?.type ?? 'expense'));
  const [walletId, setWalletId] = useState<string>(transaction?.wallet_id ?? defaultWallet?.id ?? '');
  const [amount, setAmount] = useState<string>(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? '');
  const [date, setDate] = useState<string>(transaction?.date ?? todayInputDate());
  const [notes, setNotes] = useState<string>(transaction?.notes ?? '');
  const [payer, setPayer] = useState<string>(transaction?.payer ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(transaction?.labels?.map(l => l.id) ?? []);

  // Transfer-specific state
  const [toWalletId, setToWalletId] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dirty = transaction != null
    || amount !== ''
    || notes !== ''
    || payer !== ''
    || categoryId !== ''
    || labelIds.length > 0
    || (mode === 'transfer' && (toWalletId !== '' || toAmount !== ''));

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates?.find(t => t.id === templateId);
    if (!tpl) return;
    setMode(tpl.type);
    if (tpl.wallet_id) setWalletId(tpl.wallet_id);
    setAmount(String(tpl.amount));
    setCategoryId(tpl.category_id ?? '');
    setPayer(tpl.payer ?? '');
    setNotes(tpl.notes ?? '');
    setLabelIds(tpl.labels?.map(l => l.id) ?? []);
  }

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

  const parentCategories = categories.filter(c => !c.parent_id);
  const childCategories = categories.filter(c => c.parent_id);
  const categoryOptions: SelectOption[] = [];
  for (const parent of parentCategories) {
    const children = childCategories.filter(c => c.parent_id === parent.id);
    if (children.length > 0) {
      // Parent has children → heading only, children are the selectable items
      for (const child of children) {
        categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}`, group: `${parent.icon} ${parent.name}` });
      }
    } else {
      // Parent has no children → selectable on its own
      categoryOptions.push({ value: parent.id, label: `${parent.icon} ${parent.name}` });
    }
  }
  for (const child of childCategories.filter(c => !parentCategories.find(p => p.id === c.parent_id))) {
    categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}` });
  }

  function toggleLabel(id: string) {
    setLabelIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'transfer') {
      if (!walletId) { setError('Please select a source wallet.'); return; }
      if (!toWalletId) { setError('Please select a destination wallet.'); return; }
      if (walletId === toWalletId) { setError('Source and destination wallets must be different.'); return; }
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

    if (!walletId) { setError('Please select a wallet.'); return; }
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount < 1) {
      setError('Please enter a valid amount (minimum 1).');
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
            You need at least one wallet before adding records. Go to <strong>Wallets</strong> to create one.
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
          {/* Template selector — only for new records */}
          {!transaction && templates && templates.length > 0 && (
            <div className={styles.templateRow}>
              {(() => {
                const tplOptions = [
                  { value: '', label: 'Apply a template…' },
                  ...(templates ?? []).map(t => ({ value: t.id, label: `${t.type === 'income' ? '↑' : '↓'} ${t.name}` })),
                ];
                return (
                  <ReactSelect<{ value: string; label: string }>
                    options={tplOptions}
                    value={tplOptions.find(o => o.value === selectedTemplateId) ?? tplOptions[0]}
                    onChange={(opt) => applyTemplate(opt?.value ?? '')}
                    isSearchable={false}
                    styles={makeRsStyles()}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                );
              })()}
            </div>
          )}

          {/* Mode tabs */}
          <div className={styles.typeTabs}>
            <button type="button" className={[styles.typeTab, mode === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('expense')}>Expense</button>
            <button type="button" className={[styles.typeTab, mode === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('income')}>Income</button>
            <button type="button" className={[styles.typeTab, mode === 'transfer' ? styles.typeTabTransferActive : ''].filter(Boolean).join(' ')} onClick={() => setMode('transfer')}>Transfer</button>
          </div>

          {mode === 'transfer' ? (
            /* ── Transfer form ── */
            <div className={styles.transferGrid}>
              {/* From wallet */}
              <div className={styles.field}>
                <FormLabel htmlFor="from-wallet" required>From account</FormLabel>
                <ReactSelect<{ value: string; label: string }>
                  inputId="from-wallet"
                  options={wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }))}
                  value={wallets.find(w => w.id === walletId) ? { value: walletId, label: `${wallets.find(w => w.id === walletId)!.icon} ${wallets.find(w => w.id === walletId)!.name} (${wallets.find(w => w.id === walletId)!.currency})` } : null}
                  onChange={(opt) => opt && handleFromWalletChange(opt.value)}
                  isSearchable
                  styles={makeRsStyles()}
                  theme={rsTheme}
                  menuPosition="fixed"
                  placeholder="Select wallet…"
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

              {/* To wallet */}
              <div className={styles.field}>
                <FormLabel htmlFor="to-wallet" required>To account</FormLabel>
                {(() => {
                  const toWalletOptions = wallets.filter(w => w.id !== walletId).map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }));
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
                      placeholder="Select wallet…"
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
            </div>
          ) : (
            /* ── Income / Expense form ── */
            <div className={styles.columns}>
              {/* Left column */}
              <div className={styles.leftCol}>
                {/* Amount */}
                <div className={styles.field}>
                  <FormLabel htmlFor="amount" required>Amount</FormLabel>
                  <div className={styles.amountRow}>
                    <NumberInput id="amount" value={amount} onChange={setAmount} placeholder="0" required autoFocus />
                    <span className={styles.currencyBadge}>{selectedWallet?.currency ?? ''}</span>
                  </div>
                </div>

                {/* Account / Wallet */}
                <div className={styles.field}>
                  <FormLabel htmlFor="wallet" required>Account</FormLabel>
                  <ReactSelect<{ value: string; label: string }>
                    inputId="wallet"
                    options={wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }))}
                    value={wallets.find(w => w.id === walletId) ? { value: walletId, label: `${wallets.find(w => w.id === walletId)!.icon} ${wallets.find(w => w.id === walletId)!.name} (${wallets.find(w => w.id === walletId)!.currency})` } : null}
                    onChange={(opt) => opt && setWalletId(opt.value)}
                    isSearchable
                    styles={makeRsStyles()}
                    theme={rsTheme}
                    menuPosition="fixed"
                    placeholder="Select wallet…"
                  />
                </div>

                {/* Category */}
                <div className={styles.field}>
                  <FormLabel htmlFor="category">Category</FormLabel>
                  <SearchableSelect id="category" options={categoryOptions} value={categoryId} onChange={setCategoryId} placeholder="Choose category" />
                </div>

                {/* Labels */}
                {labels.length > 0 && (
                  <div className={styles.field}>
                    <FormLabel>Labels</FormLabel>
                    <LabelSelect labels={labels} selectedIds={labelIds} onChange={setLabelIds} />
                  </div>
                )}

                {/* Date */}
                <div className={styles.field}>
                  <FormLabel htmlFor="date" required>Date</FormLabel>
                  <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
              </div>

              {/* Right column */}
              <div className={styles.rightCol}>
                <p className={styles.rightColTitle}>Other details</p>
                <div className={styles.field}>
                  <FormLabel htmlFor="notes">Note</FormLabel>
                  <textarea id="notes" className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Describe your record" />
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="payer">Payer</FormLabel>
                  <Input id="payer" type="text" value={payer} onChange={e => setPayer(e.target.value)} placeholder="Who paid?" />
                </div>
              </div>
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
            <Button type="submit" variant="primary" loading={saving}>
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
