'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import type { Transaction, Category, Label, TransactionType } from '@/lib/types';
import { todayInputDate } from '@/lib/utils';
import styles from './TransactionForm.module.css';

export interface TransactionFormData {
  type: TransactionType;
  amount: number;
  category_id: string | null;
  date: string;
  notes: string;
  label_ids: string[];
}

interface TransactionFormProps {
  transaction?: Transaction;
  categories: Category[];
  labels: Label[];
  onSave: (data: TransactionFormData) => Promise<void>;
  onClose: () => void;
}

export default function TransactionForm({
  transaction,
  categories,
  labels,
  onSave,
  onClose,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState<string>(
    transaction ? String(transaction.amount) : ''
  );
  const [categoryId, setCategoryId] = useState<string>(
    transaction?.category_id ?? ''
  );
  const [date, setDate] = useState<string>(transaction?.date ?? todayInputDate());
  const [notes, setNotes] = useState<string>(transaction?.notes ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(
    transaction?.labels?.map((l) => l.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  );

  function toggleLabel(id: string) {
    setLabelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
        category_id: categoryId || null,
        date,
        notes,
        label_ids: labelIds,
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
      >
        <h2 id="form-title" className={styles.title}>
          {transaction ? 'Edit transaction' : 'Add transaction'}
        </h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Type toggle */}
          <div className={styles.field}>
            <FormLabel>Type</FormLabel>
            <div className={styles.typeToggle}>
              <button
                type="button"
                className={[
                  styles.typeBtn,
                  type === 'income' ? styles.typeBtnIncomeActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setType('income')}
              >
                Income
              </button>
              <button
                type="button"
                className={[
                  styles.typeBtn,
                  type === 'expense' ? styles.typeBtnExpenseActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setType('expense')}
              >
                Expense
              </button>
            </div>
          </div>

          {/* Amount */}
          <div className={styles.field}>
            <FormLabel htmlFor="amount" required>
              Amount
            </FormLabel>
            <div className={styles.amountRow}>
              <Input
                id="amount"
                type="number"
                step={1}
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
              />
              <span className={styles.currencyLabel}>HUF</span>
            </div>
          </div>

          {/* Category */}
          <div className={styles.field}>
            <FormLabel htmlFor="category">Category</FormLabel>
            <select
              id="category"
              className={styles.select}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— No category —</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className={styles.field}>
            <FormLabel htmlFor="date" required>
              Date
            </FormLabel>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div className={styles.field}>
              <FormLabel>Labels</FormLabel>
              <div className={styles.labelChips}>
                {labels.map((label) => {
                  const selected = labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={[
                        styles.labelChip,
                        selected ? styles.labelChipSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
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

          {/* Notes */}
          <div className={styles.field}>
            <FormLabel htmlFor="notes">Notes</FormLabel>
            <textarea
              id="notes"
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes…"
            />
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
