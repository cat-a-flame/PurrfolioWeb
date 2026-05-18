'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import type { Transaction, Category, Label, TransactionType, Wallet } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';
import styles from './TransactionForm.module.css';

export interface TransactionFormData {
  type: TransactionType;
  amount: number;
  wallet_id: string;
  category_id: string | null;
  date: string;
  notes: string;
  payer: string;
  label_ids: string[];
}

interface TransactionFormProps {
  transaction?: Transaction;
  wallets: Wallet[];
  categories: Category[];
  labels: Label[];
  onSave: (data: TransactionFormData) => Promise<void>;
  onClose: () => void;
}

export default function TransactionForm({
  transaction,
  wallets,
  categories,
  labels,
  onSave,
  onClose,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');

  const defaultWallet = wallets.find(w => w.is_default) ?? wallets[0];
  const [walletId, setWalletId] = useState<string>(
    transaction?.wallet_id ?? defaultWallet?.id ?? ''
  );

  const [amount, setAmount] = useState<string>(
    transaction ? String(transaction.amount) : ''
  );
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? '');
  const [date, setDate] = useState<string>(transaction?.date ?? todayInputDate());
  const [notes, setNotes] = useState<string>(transaction?.notes ?? '');
  const [payer, setPayer] = useState<string>(transaction?.payer ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(
    transaction?.labels?.map(l => l.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedWallet = wallets.find(w => w.id === walletId);
  const currency = selectedWallet?.currency ?? '';

  const parentCategories = categories.filter(c => !c.parent_id);
  const childCategories = categories.filter(c => c.parent_id);

  const categoryOptions: SelectOption[] = [];
  for (const parent of parentCategories) {
    categoryOptions.push({ value: parent.id, label: `${parent.icon} ${parent.name}`, group: `${parent.icon} ${parent.name}` });
    for (const child of childCategories.filter(c => c.parent_id === parent.id)) {
      categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}`, group: `${parent.icon} ${parent.name}` });
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
    if (!walletId) { setError('Please select a wallet.'); return; }
    const parsedAmount = Number(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount < 1) {
      setError('Please enter a valid amount (minimum 1).');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        type,
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
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className={styles.modalHeader}>
            <h2 className={styles.title}>Add record</h2>
            <button className={styles.closeBtn} type="button" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <p className={styles.noWalletMsg}>
            You need at least one wallet before adding records. Go to <strong>Wallets</strong> to create one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
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
          <button className={styles.closeBtn} type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.columns}>
            {/* Left column */}
            <div className={styles.leftCol}>
              {/* Type tabs */}
              <div className={styles.typeTabs}>
                <button
                  type="button"
                  className={[styles.typeTab, type === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setType('expense')}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={[styles.typeTab, type === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setType('income')}
                >
                  Income
                </button>
              </div>

              {/* Amount */}
              <div className={styles.field}>
                <FormLabel htmlFor="amount" required>Amount</FormLabel>
                <div className={styles.amountRow}>
                  <Input
                    id="amount"
                    type="number"
                    step={1}
                    min={1}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    required
                  />
                  <span className={styles.currencyBadge}>{currency}</span>
                </div>
              </div>

              {/* Account / Wallet */}
              <div className={styles.field}>
                <FormLabel htmlFor="wallet" required>Account</FormLabel>
                <select
                  id="wallet"
                  className={styles.select}
                  value={walletId}
                  onChange={e => setWalletId(e.target.value)}
                  required
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name} ({w.currency})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div className={styles.field}>
                <FormLabel htmlFor="category">Category</FormLabel>
                <SearchableSelect
                  id="category"
                  options={categoryOptions}
                  value={categoryId}
                  onChange={setCategoryId}
                  placeholder="Choose category"
                />
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div className={styles.field}>
                  <FormLabel>Labels</FormLabel>
                  <div className={styles.labelChips}>
                    {labels.map(label => {
                      const selected = labelIds.includes(label.id);
                      return (
                        <button
                          key={label.id}
                          type="button"
                          className={[styles.labelChip, selected ? styles.labelChipSelected : ''].filter(Boolean).join(' ')}
                          style={
                            selected
                              ? { backgroundColor: label.color, borderColor: label.color, color: '#fff' }
                              : { borderColor: label.color, color: label.color }
                          }
                          onClick={() => toggleLabel(label.id)}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Date */}
              <div className={styles.field}>
                <FormLabel htmlFor="date" required>Date</FormLabel>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Right column */}
            <div className={styles.rightCol}>
              <p className={styles.rightColTitle}>Other details</p>

              <div className={styles.field}>
                <FormLabel htmlFor="notes">Note</FormLabel>
                <textarea
                  id="notes"
                  className={styles.textarea}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Describe your record"
                />
              </div>

              <div className={styles.field}>
                <FormLabel htmlFor="payer">Payer</FormLabel>
                <Input
                  id="payer"
                  type="text"
                  value={payer}
                  onChange={e => setPayer(e.target.value)}
                  placeholder="Who paid?"
                />
              </div>
            </div>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={saving}>
              {transaction ? 'Save changes' : 'Add record'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
