'use client';

import { useState, useEffect, useCallback } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { generateDueDates, frequencyLabel, nextDueDate, isoDate, monthBounds } from '@/lib/recurringUtils';
import type {
  RecurringPayment, RecurringOccurrence, RecurrenceFrequency,
  Wallet, Category, TransactionType,
} from '@/lib/types';
import styles from './page.module.css';

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'biweekly',  label: 'Every 2 weeks' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly',    label: 'Yearly' },
];

interface FormFields {
  name: string;
  type: TransactionType;
  amount: string;
  walletId: string;
  categoryId: string;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string;
  notes: string;
  payer: string;
}

const EMPTY_FORM: FormFields = {
  name: '', type: 'expense', amount: '', walletId: '', categoryId: '',
  frequency: 'monthly', startDate: isoDate(new Date()), endDate: '', notes: '', payer: '',
};

interface DueItem {
  payment: RecurringPayment;
  dueDate: Date;
}

export default function RecurringPage() {
  const [payments, setPayments]     = useState<RecurringPayment[]>([]);
  const [occurrences, setOccurrences] = useState<RecurringOccurrence[]>([]);
  const [wallets, setWallets]       = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);

  const [showAddDialog, setShowAddDialog]   = useState(false);
  const [addForm, setAddForm]               = useState<FormFields>(EMPTY_FORM);
  const [addSaving, setAddSaving]           = useState(false);
  const [addError, setAddError]             = useState('');

  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);
  const [editForm, setEditForm]             = useState<FormFields>(EMPTY_FORM);
  const [editSaving, setEditSaving]         = useState(false);
  const [editError, setEditError]           = useState('');

  const [deletingPayment, setDeletingPayment] = useState<RecurringPayment | null>(null);
  const [deleteLoading, setDeleteLoading]     = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null); // due item key

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  // View month for due items (default: current month)
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [pmtRes, walletRes, catRes] = await Promise.all([
      supabase.from('recurring_payments')
        .select('*, wallet:wallets(*), category:categories(*)')
        .eq('user_id', user.id)
        .order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (pmtRes.data)    setPayments(pmtRes.data as RecurringPayment[]);
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data)    setCategories(catRes.data);

    // Fetch occurrences for a wider window (3 months around view month)
    const [from, to] = monthBounds(viewYear, viewMonth);
    const wideFrom = new Date(from); wideFrom.setMonth(wideFrom.getMonth() - 1);
    const wideTo   = new Date(to);   wideTo.setMonth(wideTo.getMonth() + 1);

    const { data: occData } = await supabase
      .from('recurring_occurrences')
      .select('*')
      .eq('user_id', user.id)
      .gte('due_date', isoDate(wideFrom))
      .lte('due_date', isoDate(wideTo));
    if (occData) setOccurrences(occData);

    setLoading(false);
  }, [viewYear, viewMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Compute pending due items for the viewed month
  const dueItems: DueItem[] = (() => {
    const [from, to] = monthBounds(viewYear, viewMonth);
    const actionedKeys = new Set(occurrences.map(o => `${o.recurring_payment_id}|${o.due_date}`));
    const items: DueItem[] = [];
    for (const p of payments) {
      for (const date of generateDueDates(p, from, to)) {
        const key = `${p.id}|${isoDate(date)}`;
        if (!actionedKeys.has(key)) items.push({ payment: p, dueDate: date });
      }
    }
    return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  })();

  const overdueItems  = dueItems.filter(i => i.dueDate < today && isoDate(i.dueDate) !== isoDate(today));
  const upcomingItems = dueItems.filter(i => i.dueDate >= today || isoDate(i.dueDate) === isoDate(today));

  // Month navigation
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  // ─── Mark as paid ────────────────────────────────────────────────────────────

  async function handlePay(item: DueItem) {
    const key = `${item.payment.id}|${isoDate(item.dueDate)}`;
    setActionLoading(key);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(null); return; }

    const wallet = item.payment.wallet_id ? wallets.find(w => w.id === item.payment.wallet_id) : null;

    // Insert the transaction
    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: item.payment.type,
        amount: item.payment.amount,
        wallet_id: item.payment.wallet_id,
        category_id: item.payment.category_id,
        date: isoDate(item.dueDate),
        notes: item.payment.notes,
        payer: item.payment.payer,
      })
      .select('id')
      .single();

    if (txErr || !txData) {
      setToast({ message: 'Failed to create transaction.', variant: 'error' });
      setActionLoading(null);
      return;
    }

    // Record the occurrence
    const { error: occErr } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: item.payment.id,
      user_id: user.id,
      due_date: isoDate(item.dueDate),
      status: 'paid',
      transaction_id: txData.id,
    });

    if (occErr) {
      setToast({ message: 'Transaction created but occurrence record failed.', variant: 'error' });
    } else {
      const currency = (wallet?.currency ?? 'HUF') as 'HUF' | 'USD' | 'EUR';
      setToast({ message: `${item.payment.name} — ${formatCurrency(item.payment.amount, currency)} added.`, variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
    }
    setActionLoading(null);
    fetchAll();
  }

  // ─── Skip ────────────────────────────────────────────────────────────────────

  async function handleSkip(item: DueItem) {
    const key = `${item.payment.id}|${isoDate(item.dueDate)}`;
    setActionLoading(key);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(null); return; }

    const { error } = await supabase.from('recurring_occurrences').insert({
      recurring_payment_id: item.payment.id,
      user_id: user.id,
      due_date: isoDate(item.dueDate),
      status: 'skipped',
      transaction_id: null,
    });

    if (error) setToast({ message: 'Failed to skip.', variant: 'error' });
    else setToast({ message: `${item.payment.name} skipped.`, variant: 'success' });
    setActionLoading(null);
    fetchAll();
  }

  // ─── Add ─────────────────────────────────────────────────────────────────────

  function validateForm(form: FormFields): string | null {
    if (!form.name.trim()) return 'Name is required.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return 'Enter a valid amount.';
    if (!form.walletId) return 'Select a wallet.';
    if (!form.startDate) return 'Start date is required.';
    return null;
  }

  async function handleAdd() {
    const err = validateForm(addForm);
    if (err) { setAddError(err); return; }
    setAddSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddSaving(false); return; }

    const { error } = await supabase.from('recurring_payments').insert({
      user_id: user.id,
      name: addForm.name.trim(),
      type: addForm.type,
      amount: parseFloat(addForm.amount),
      wallet_id: addForm.walletId || null,
      category_id: addForm.categoryId || null,
      frequency: addForm.frequency,
      start_date: addForm.startDate,
      end_date: addForm.endDate || null,
      notes: addForm.notes.trim() || null,
      payer: addForm.payer.trim() || null,
    });

    if (error) {
      setAddError('Failed to save. Please try again.');
    } else {
      setShowAddDialog(false);
      setAddForm(EMPTY_FORM);
      setAddError('');
      setToast({ message: 'Recurring payment added.', variant: 'success' });
      fetchAll();
    }
    setAddSaving(false);
  }

  // ─── Edit ────────────────────────────────────────────────────────────────────

  function openEdit(p: RecurringPayment) {
    setEditForm({
      name: p.name, type: p.type, amount: String(p.amount),
      walletId: p.wallet_id ?? '', categoryId: p.category_id ?? '',
      frequency: p.frequency, startDate: p.start_date, endDate: p.end_date ?? '',
      notes: p.notes ?? '', payer: p.payer ?? '',
    });
    setEditingPayment(p);
    setEditError('');
  }

  async function handleEdit() {
    if (!editingPayment) return;
    const err = validateForm(editForm);
    if (err) { setEditError(err); return; }
    setEditSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from('recurring_payments').update({
      name: editForm.name.trim(),
      type: editForm.type,
      amount: parseFloat(editForm.amount),
      wallet_id: editForm.walletId || null,
      category_id: editForm.categoryId || null,
      frequency: editForm.frequency,
      start_date: editForm.startDate,
      end_date: editForm.endDate || null,
      notes: editForm.notes.trim() || null,
      payer: editForm.payer.trim() || null,
    }).eq('id', editingPayment.id);

    if (error) {
      setEditError('Failed to save. Please try again.');
    } else {
      setEditingPayment(null);
      setToast({ message: 'Recurring payment updated.', variant: 'success' });
      fetchAll();
    }
    setEditSaving(false);
  }

  // ─── Toggle active ────────────────────────────────────────────────────────────

  async function handleToggleActive(p: RecurringPayment) {
    const supabase = createClient();
    await supabase.from('recurring_payments').update({ is_active: !p.is_active }).eq('id', p.id);
    fetchAll();
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deletingPayment) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('recurring_payments').delete().eq('id', deletingPayment.id);
    if (error) {
      setToast({ message: 'Failed to delete.', variant: 'error' });
    } else {
      setToast({ message: 'Recurring payment deleted.', variant: 'success' });
      fetchAll();
    }
    setDeletingPayment(null);
    setDeleteLoading(false);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function walletCurrency(walletId: string | null): 'HUF' | 'USD' | 'EUR' {
    return (wallets.find(w => w.id === walletId)?.currency ?? 'HUF') as 'HUF' | 'USD' | 'EUR';
  }

  function dueDateLabel(date: Date): string {
    const d = isoDate(date);
    if (d === isoDate(today)) return 'Today';
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return `In ${diff} days`;
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
  }

  function paymentFormBody(form: FormFields, set: (f: FormFields) => void) {
    return (
      <div className={styles.formGrid}>
        <div className={styles.formFullRow}>
          <FormLabel>Name</FormLabel>
          <Input value={form.name} onChange={e => set({ ...form, name: e.target.value })} placeholder="Mortgage, Phone bill…" />
        </div>

        <div>
          <FormLabel>Type</FormLabel>
          <div className={styles.typeToggle}>
            {(['expense', 'income'] as TransactionType[]).map(t => (
              <button key={t} className={[styles.typeBtn, form.type === t ? styles.typeBtnActive : ''].join(' ')}
                onClick={() => set({ ...form, type: t })}>
                {t === 'expense' ? 'Expense' : 'Income'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FormLabel>Frequency</FormLabel>
          <select className={styles.select} value={form.frequency}
            onChange={e => set({ ...form, frequency: e.target.value as RecurrenceFrequency })}>
            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <div>
          <FormLabel>Amount</FormLabel>
          <NumberInput value={form.amount} onChange={v => set({ ...form, amount: v })} placeholder="0" />
        </div>

        <div>
          <FormLabel>Wallet</FormLabel>
          <select className={styles.select} value={form.walletId}
            onChange={e => set({ ...form, walletId: e.target.value })}>
            <option value="">— select wallet —</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
          </select>
        </div>

        <div>
          <FormLabel>Category</FormLabel>
          <select className={styles.select} value={form.categoryId}
            onChange={e => set({ ...form, categoryId: e.target.value })}>
            <option value="">— none —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        <div>
          <FormLabel>Start date</FormLabel>
          <Input type="date" value={form.startDate} onChange={e => set({ ...form, startDate: e.target.value })} />
        </div>

        <div>
          <FormLabel>End date <span className={styles.optional}>(optional)</span></FormLabel>
          <Input type="date" value={form.endDate} onChange={e => set({ ...form, endDate: e.target.value })} />
        </div>

        <div className={styles.formFullRow}>
          <FormLabel>Payer / payee <span className={styles.optional}>(optional)</span></FormLabel>
          <Input value={form.payer} onChange={e => set({ ...form, payer: e.target.value })} placeholder="e.g. OTP Bank" />
        </div>

        <div className={styles.formFullRow}>
          <FormLabel>Notes <span className={styles.optional}>(optional)</span></FormLabel>
          <Input value={form.notes} onChange={e => set({ ...form, notes: e.target.value })} placeholder="" />
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}><p className={styles.loading}>Loading…</p></main>
      <AppFooter />
    </div>
  );

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Planned payments</h1>
              <p className={styles.pageSubtitle}>Recurring income and expenses — see what&apos;s coming and mark them when they happen.</p>
            </div>
            <Button variant="primary" size="md" onClick={() => { setAddForm({ ...EMPTY_FORM, walletId: wallets.find(w => w.is_default)?.id ?? '' }); setShowAddDialog(true); setAddError(''); }}>
              + Add
            </Button>
          </div>

          {/* ── Due this month ── */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Due this month</h2>
              <div className={styles.monthNav}>
                <button className={styles.monthNavBtn} onClick={prevMonth}>‹</button>
                <span className={styles.monthLabel}>{monthLabel}</span>
                <button className={styles.monthNavBtn} onClick={nextMonth}>›</button>
                {!isCurrentMonth && (
                  <button className={styles.monthNavToday} onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}>
                    Today
                  </button>
                )}
              </div>
            </div>

            {dueItems.length === 0 && (
              <p className={styles.empty}>
                {payments.filter(p => p.is_active).length === 0
                  ? 'No recurring payments yet. Add one above.'
                  : 'All payments for this month have been handled.'}
              </p>
            )}

            {overdueItems.length > 0 && (
              <div className={styles.dueGroup}>
                <p className={styles.dueGroupLabel}>Overdue</p>
                {overdueItems.map(item => (
                  <DueCard key={`${item.payment.id}|${isoDate(item.dueDate)}`}
                    item={item} loading={actionLoading === `${item.payment.id}|${isoDate(item.dueDate)}`}
                    onPay={handlePay} onSkip={handleSkip}
                    currency={walletCurrency(item.payment.wallet_id)} dueDateLabel={dueDateLabel(item.dueDate)} />
                ))}
              </div>
            )}

            {upcomingItems.length > 0 && (
              <div className={styles.dueGroup}>
                {overdueItems.length > 0 && <p className={styles.dueGroupLabel}>Upcoming</p>}
                {upcomingItems.map(item => (
                  <DueCard key={`${item.payment.id}|${isoDate(item.dueDate)}`}
                    item={item} loading={actionLoading === `${item.payment.id}|${isoDate(item.dueDate)}`}
                    onPay={handlePay} onSkip={handleSkip}
                    currency={walletCurrency(item.payment.wallet_id)} dueDateLabel={dueDateLabel(item.dueDate)} />
                ))}
              </div>
            )}
          </section>

          {/* ── All recurring payments ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>All recurring payments</h2>

            {payments.length === 0 && (
              <p className={styles.empty}>No recurring payments defined yet.</p>
            )}

            <div className={styles.paymentList}>
              {payments.map(p => {
                const next = nextDueDate(p);
                const currency = walletCurrency(p.wallet_id);
                return (
                  <div key={p.id} className={[styles.paymentRow, !p.is_active ? styles.paymentRowInactive : ''].join(' ')}>
                    <div className={styles.paymentMeta}>
                      <span className={[styles.paymentTypeDot, p.type === 'income' ? styles.dotIncome : styles.dotExpense].join(' ')} />
                      <div>
                        <p className={styles.paymentName}>{p.name}</p>
                        <p className={styles.paymentSub}>
                          {frequencyLabel(p.frequency)}
                          {p.wallet && ` · ${p.wallet.icon} ${p.wallet.name}`}
                          {p.category && ` · ${p.category.icon} ${p.category.name}`}
                        </p>
                      </div>
                    </div>
                    <div className={styles.paymentRight}>
                      <span className={[styles.paymentAmount, p.type === 'income' ? styles.amtIncome : styles.amtExpense].join(' ')}>
                        {p.type === 'expense' ? '−' : '+'}{formatCurrency(p.amount, currency)}
                      </span>
                      {next && p.is_active && (
                        <span className={styles.nextDue}>Next: {next.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      )}
                      {!p.is_active && <span className={styles.pausedBadge}>Paused</span>}
                    </div>
                    <div className={styles.paymentActions}>
                      <button className={styles.iconBtn} onClick={() => handleToggleActive(p)} title={p.is_active ? 'Pause' : 'Resume'}>
                        {p.is_active ? '⏸' : '▶'}
                      </button>
                      <button className={styles.iconBtn} onClick={() => openEdit(p)} title="Edit">✏️</button>
                      <button className={[styles.iconBtn, styles.iconBtnDanger].join(' ')} onClick={() => setDeletingPayment(p)} title="Delete">🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      </main>
      <AppFooter />

      {/* Add dialog */}
      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} title="Add recurring payment">
        {paymentFormBody(addForm, setAddForm)}
        {addError && <p className={styles.formError}>{addError}</p>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" size="md" onClick={() => setShowAddDialog(false)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleAdd} disabled={addSaving}>
            {addSaving ? 'Saving…' : 'Add'}
          </Button>
        </div>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingPayment} onClose={() => setEditingPayment(null)} title="Edit recurring payment">
        {paymentFormBody(editForm, setEditForm)}
        {editError && <p className={styles.formError}>{editError}</p>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" size="md" onClick={() => setEditingPayment(null)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleEdit} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingPayment}
        title="Delete recurring payment"
        message={`Delete "${deletingPayment?.name}"? This won't affect existing transactions.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingPayment(null)}
        loading={deleteLoading}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

// ─── Due card sub-component ────────────────────────────────────────────────────

function DueCard({ item, loading, onPay, onSkip, currency, dueDateLabel }: {
  item: DueItem;
  loading: boolean;
  onPay: (item: DueItem) => void;
  onSkip: (item: DueItem) => void;
  currency: 'HUF' | 'USD' | 'EUR';
  dueDateLabel: string;
}) {
  const { payment } = item;
  const isOverdue = dueDateLabel.includes('overdue');
  return (
    <div className={[styles.dueCard, isOverdue ? styles.dueCardOverdue : ''].join(' ')}>
      <div className={styles.dueMeta}>
        <span className={[styles.paymentTypeDot, payment.type === 'income' ? styles.dotIncome : styles.dotExpense].join(' ')} />
        <div>
          <p className={styles.dueName}>{payment.name}</p>
          <p className={styles.dueSub}>
            <span className={[styles.dueDateBadge, isOverdue ? styles.dueDateBadgeOverdue : ''].join(' ')}>{dueDateLabel}</span>
            {payment.wallet && ` ${payment.wallet.icon} ${payment.wallet.name}`}
            {payment.category && ` · ${payment.category.icon} ${payment.category.name}`}
          </p>
        </div>
      </div>
      <div className={styles.dueRight}>
        <span className={[styles.dueAmount, payment.type === 'income' ? styles.amtIncome : styles.amtExpense].join(' ')}>
          {payment.type === 'expense' ? '−' : '+'}{formatCurrency(payment.amount, currency)}
        </span>
        <div className={styles.dueActions}>
          <button className={styles.payBtn} onClick={() => onPay(item)} disabled={loading} title="Mark as paid">
            {loading ? '…' : '✓ Pay'}
          </button>
          <button className={styles.skipBtn} onClick={() => onSkip(item)} disabled={loading} title="Skip this occurrence">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
