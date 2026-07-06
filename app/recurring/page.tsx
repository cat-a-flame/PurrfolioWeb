'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import ReactSelect from 'react-select';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import LabelSelect from '@/components/ui/LabelSelect';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import Toast from '@/components/ui/Toast';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { generateDueDates, frequencyLabel, nextDueDate, isoDate, monthBounds } from '@/lib/recurringUtils';
import { FaChevronRight } from "react-icons/fa6";
import { FaChevronLeft } from "react-icons/fa6";
import { BsThreeDotsVertical } from "react-icons/bs";
import type {
  RecurringPayment, RecurringOccurrence, RecurrenceFrequency,
  Wallet, Category, Label, TransactionType,
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
  labelIds: string[];
}

const EMPTY_FORM: FormFields = {
  name: '', type: 'expense', amount: '', walletId: '', categoryId: '',
  frequency: 'monthly', startDate: isoDate(new Date()), endDate: '', notes: '', payer: '',
  labelIds: [],
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
  const [labels, setLabels]         = useState<Label[]>([]);
  const [loading, setLoading]       = useState(true);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
  const [duePromptItem, setDuePromptItem] = useState<DueItem | null>(null);

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

    type RawPayment = Omit<RecurringPayment, 'labels'> & { labels: { label: Label | null }[] };

    const [pmtRes, walletRes, catRes, lblRes] = await Promise.all([
      supabase.from('recurring_payments')
        .select('*, wallet:wallets(*), category:categories(*), labels:recurring_payment_labels(label:labels(*))')
        .eq('user_id', user.id)
        .order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (pmtRes.data) {
      setPayments((pmtRes.data as RawPayment[]).map(p => ({
        ...p,
        labels: p.labels.map(l => l.label).filter((l): l is Label => l !== null),
      })));
    }
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data)    setCategories(catRes.data);
    if (lblRes.data)    setLabels(lblRes.data);

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

  useEffect(() => {
    fetchAll();
    window.addEventListener('transaction-added', fetchAll);

    const supabase = createClient();
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return;
      channel = supabase
        .channel('recurring-page-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_occurrences', filter: `user_id=eq.${user.id}` }, () => fetchAll())
        .subscribe();
    });

    return () => {
      mounted = false;
      window.removeEventListener('transaction-added', fetchAll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  useEffect(() => {
    if (!openMenuId) return;
    function close() { setOpenMenuId(null); }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  // Compute pending due items for the viewed month
  const dueItems: DueItem[] = (() => {
    const [from, to] = monthBounds(viewYear, viewMonth);
    const actionedKeys = new Set(occurrences.map(o => `${o.recurring_payment_id}|${o.due_date.slice(0, 10)}`));
    const items: DueItem[] = [];
    for (const p of payments) {
      for (const date of generateDueDates(p, from, to)) {
        const key = `${p.id}|${isoDate(date)}`;
        if (!actionedKeys.has(key)) items.push({ payment: p, dueDate: date });
      }
    }
    return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  })();

  const todayIsoStr   = isoDate(today);
  const overdueItems  = dueItems.filter(i => isoDate(i.dueDate) < todayIsoStr);
  const todayItems    = dueItems.filter(i => isoDate(i.dueDate) === todayIsoStr);
  const upcomingItems = dueItems.filter(i => isoDate(i.dueDate) > todayIsoStr);

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
      if (item.payment.labels && item.payment.labels.length > 0) {
        await supabase.from('transaction_labels').insert(
          item.payment.labels.map(l => ({ transaction_id: txData.id, label_id: l.id }))
        );
      }
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

    if (error) {
      setToast({ message: 'Failed to skip.', variant: 'error' });
    } else {
      setToast({ message: `${item.payment.name} skipped.`, variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
    }
    setActionLoading(null);
    fetchAll();
  }

  // ─── Add ─────────────────────────────────────────────────────────────────────

  function validateForm(form: FormFields): string | null {
    if (!form.name.trim()) return 'Name is required.';
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return 'Enter a valid amount.';
    if (!form.walletId) return 'Select an account.';
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

    const { data: inserted, error } = await supabase.from('recurring_payments').insert({
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
    }).select().single();

    if (error || !inserted) {
      setAddError('Failed to save. Please try again.');
    } else {
      if (addForm.labelIds.length > 0) {
        await supabase.from('recurring_payment_labels').insert(
          addForm.labelIds.map(lid => ({ recurring_payment_id: inserted.id, label_id: lid }))
        );
      }
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
      labelIds: p.labels?.map(l => l.id) ?? [],
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
      await supabase.from('recurring_payment_labels').delete().eq('recurring_payment_id', editingPayment.id);
      if (editForm.labelIds.length > 0) {
        await supabase.from('recurring_payment_labels').insert(
          editForm.labelIds.map(lid => ({ recurring_payment_id: editingPayment.id, label_id: lid }))
        );
      }
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
    const todayIso = isoDate(today);
    if (d === todayIso) return 'Today';
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((date.getTime() - todayMidnight.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 1) return 'Tomorrow';
    if (diff < 7) return `In ${diff} days`;
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
  }

  if (loading) return (
    <AppShell><p className={styles.loading}>Loading…</p></AppShell>
  );

  return (
    <AppShell>
        <div className={styles.container}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Planned payments</h1>
            </div>
            <Button variant="primary" size="lg" onClick={() => { setAddForm({ ...EMPTY_FORM, walletId: wallets.find(w => w.is_default && !w.is_archived)?.id ?? wallets.find(w => !w.is_archived)?.id ?? '' }); setShowAddDialog(true); setAddError(''); }}>
              + Add
            </Button>
          </div>

          {/* ── Due this month ── */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Due this month</h2>
              <div className={styles.monthNav}>
                <button className={styles.monthNavBtn} onClick={prevMonth}><FaChevronLeft /></button>
                <span className={styles.monthLabel}>{monthLabel}</span>
                <button className={styles.monthNavBtn} onClick={nextMonth}><FaChevronRight /></button>
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
                <div className={styles.recordCard}>
                  {overdueItems.map(item => (
                    <DueCard key={`${item.payment.id}|${isoDate(item.dueDate)}`}
                      item={item}
                      onSelect={setDuePromptItem}
                      currency={walletCurrency(item.payment.wallet_id)} dueDateLabel={dueDateLabel(item.dueDate)} />
                  ))}
                </div>
              </div>
            )}

            {todayItems.length > 0 && (
              <div className={styles.dueGroup}>
                <p className={styles.dueGroupLabel}>Due today</p>
                <div className={styles.recordCard}>
                  {todayItems.map(item => (
                    <DueCard key={`${item.payment.id}|${isoDate(item.dueDate)}`}
                      item={item}
                      onSelect={setDuePromptItem}
                      currency={walletCurrency(item.payment.wallet_id)} dueDateLabel={dueDateLabel(item.dueDate)} />
                  ))}
                </div>
              </div>
            )}

            {upcomingItems.length > 0 && (
              <div className={styles.dueGroup}>
                {(overdueItems.length > 0 || todayItems.length > 0) && <p className={styles.dueGroupLabel}>Upcoming</p>}
                <div className={styles.recordCard}>
                  {upcomingItems.map(item => (
                    <DueCard key={`${item.payment.id}|${isoDate(item.dueDate)}`}
                      item={item}
                      onSelect={setDuePromptItem}
                      currency={walletCurrency(item.payment.wallet_id)} dueDateLabel={dueDateLabel(item.dueDate)} />
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── All recurring payments ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>All recurring payments</h2>

            {payments.length === 0 && (
              <p className={styles.empty}>No recurring payments defined yet.</p>
            )}

            {FREQUENCIES.filter(f => payments.some(p => p.frequency === f.value)).map(f => (
              <div key={f.value} className={styles.dueGroup}>
                <p className={styles.dueGroupLabel}>{f.label}</p>
                <div className={styles.recordCard}>
                  {payments.filter(p => p.frequency === f.value).sort((a, b) => {
                    const na = nextDueDate(a)?.getTime() ?? Infinity;
                    const nb = nextDueDate(b)?.getTime() ?? Infinity;
                    return na - nb;
                  }).map(p => {
                    const next = nextDueDate(p);
                    const currency = walletCurrency(p.wallet_id);
                    const metaParts = [
                      p.category && (
                        <span key="category" className={styles.recordTag}>{p.category.icon} {p.category.name}</span>
                      ),
                      p.wallet && (
                        <span key="wallet" className={styles.recordTag}>
                          <span className={styles.recordDot} style={{ backgroundColor: p.wallet.color }} />
                          {p.wallet.name}
                        </span>
                      ),
                      p.payer && (
                        <span key="payer" className={styles.recordTag}>{p.payer}</span>
                      ),
                      p.notes && (
                        <span key="notes" className={styles.recordNotes}>{p.notes}</span>
                      ),
                    ].filter(Boolean);
                    return (
                      <div
                        key={p.id}
                        className={[styles.record, !p.is_active ? styles.recordInactive : ''].join(' ')}
                        onClick={() => openEdit(p)}
                      >
                        <div
                          className={styles.recordIcon}
                          style={{ backgroundColor: (p.category?.color ?? '#94a3b8') + '22' }}
                        >
                          {p.category?.icon ?? '?'}
                        </div>
                        <div className={styles.recordMain}>
                          <div className={styles.recordTopRow}>
                            <span className={styles.recordTitle}>{p.name}</span>
                            {p.labels && p.labels.length > 0 && (
                              <div className={styles.recordLabels}>
                                {p.labels.map(l => (
                                  <span key={l.id} className={styles.recordLabel}>
                                    <span className={styles.recordLabelDot} style={{ backgroundColor: l.color }} />
                                    {l.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {metaParts.length > 0 && (
                            <div className={styles.recordMetaRow}>
                              {metaParts.map((part, i) => (
                                <Fragment key={i}>
                                  {i > 0 && <span className={styles.recordMetaDot}>·</span>}
                                  {part}
                                </Fragment>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={styles.recordRight}>
                          <span className={[styles.recordAmount, p.type === 'income' ? styles.amtIncome : styles.amtExpense].join(' ')}>
                            {p.type === 'expense' ? '−' : '+'}{formatCurrency(p.amount, currency)}
                          </span>
                          {next && p.is_active && (
                            <span className={styles.nextDue}>Next: {next.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          )}
                          {!p.is_active && <span className={styles.pausedBadge}>Paused</span>}
                        </div>
                        <div className={styles.kebabWrap}>
                          <button
                            className={styles.kebabTrigger}
                            onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === p.id ? null : p.id); }}
                          ><BsThreeDotsVertical /></button>
                          {openMenuId === p.id && (
                            <div className={styles.kebabMenu} onClick={e => e.stopPropagation()}>
                              <button className={styles.kebabItem} onClick={() => { handleToggleActive(p); setOpenMenuId(null); }}>
                                {p.is_active ? 'Pause' : 'Resume'}
                              </button>
                              <button className={[styles.kebabItem, styles.kebabItemDanger].join(' ')} onClick={() => { setDeletingPayment(p); setOpenMenuId(null); }}>Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </div>

      {showAddDialog && (
        <PaymentModal form={addForm} set={setAddForm} title="Add recurring payment"
          error={addError} saving={addSaving} onSave={handleAdd} onClose={() => setShowAddDialog(false)}
          wallets={wallets} categories={categories} labels={labels} />
      )}

      {editingPayment && (
        <PaymentModal form={editForm} set={setEditForm} title="Edit recurring payment"
          error={editError} saving={editSaving} onSave={handleEdit} onClose={() => setEditingPayment(null)}
          wallets={wallets} categories={categories} labels={labels} />
      )}

      {duePromptItem && (
        <ConfirmDialog
          title={duePromptItem.payment.name}
          message={
            <>
              <span className={[
                styles.dueDialogAmount,
                duePromptItem.payment.type === 'income' ? styles.amtIncome : styles.amtExpense,
              ].join(' ')}>
                {duePromptItem.payment.type === 'income' ? '+' : '−'}
                {formatCurrency(duePromptItem.payment.amount, walletCurrency(duePromptItem.payment.wallet_id))}
              </span>
              {`Due ${duePromptItem.dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Add this as a transaction, or skip this occurrence?`}
            </>
          }
          confirmLabel="Add transaction"
          cancelLabel="Skip"
          confirmVariant="primary"
          cancelVariant="ghost"
          onConfirm={async () => { await handlePay(duePromptItem); setDuePromptItem(null); }}
          onCancel={async () => { await handleSkip(duePromptItem); setDuePromptItem(null); }}
          onDismiss={() => setDuePromptItem(null)}
          loading={actionLoading === `${duePromptItem.payment.id}|${isoDate(duePromptItem.dueDate)}`}
        />
      )}

      {/* Delete confirm */}
      {deletingPayment && (
        <ConfirmDialog
          title="Delete recurring payment"
          message={`Delete "${deletingPayment.name}"? This won't affect existing transactions.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeletingPayment(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </AppShell>
  );
}

// ─── Payment modal ─────────────────────────────────────────────────────────────

function buildCategoryOptions(categories: Category[]): SelectOption[] {
  const parents = categories.filter(c => !c.parent_id);
  const children = categories.filter(c => c.parent_id);
  const opts: SelectOption[] = [];
  for (const parent of parents) {
    const kids = children.filter(c => c.parent_id === parent.id);
    if (kids.length > 0) {
      for (const kid of kids) {
        opts.push({ value: kid.id, label: `${kid.icon} ${kid.name}`, group: `${parent.icon} ${parent.name}` });
      }
    } else {
      opts.push({ value: parent.id, label: `${parent.icon} ${parent.name}` });
    }
  }
  for (const child of children.filter(c => !parents.find(p => p.id === c.parent_id))) {
    opts.push({ value: child.id, label: `${child.icon} ${child.name}` });
  }
  return opts;
}

function PaymentModal({ form, set, title, error, saving, onSave, onClose, wallets, categories, labels }: {
  form: FormFields;
  set: (f: FormFields) => void;
  title: string;
  error: string;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  wallets: Wallet[];
  categories: Category[];
  labels: Label[];
}) {
  const rsStyles = makeRsStyles<{ value: string; label: string }>();
  const walletOptions = wallets.filter(w => !w.is_archived || w.id === form.walletId).map(w => ({ value: w.id, label: `${w.icon} ${w.name} (${w.currency})` }));
  const selectedWallet = walletOptions.find(o => o.value === form.walletId) ?? null;
  const freqOptions = FREQUENCIES.map(f => ({ value: f.value, label: f.label }));
  const selectedFreq = freqOptions.find(o => o.value === form.frequency) ?? null;
  const categoryOptions = buildCategoryOptions(categories);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.modalForm}>
          {/* Type tabs */}
          <div className={styles.typeTabs}>
            <button type="button"
              className={[styles.typeTab, form.type === 'expense' ? styles.typeTabExpense : ''].join(' ')}
              onClick={() => set({ ...form, type: 'expense' })}>Expense</button>
            <button type="button"
              className={[styles.typeTab, form.type === 'income' ? styles.typeTabIncome : ''].join(' ')}
              onClick={() => set({ ...form, type: 'income' })}>Income</button>
          </div>

          {/* Name */}
          <div className={styles.field}>
            <FormLabel required>Name</FormLabel>
            <Input value={form.name} onChange={e => set({ ...form, name: e.target.value })} placeholder="Mortgage, Phone bill…" />
          </div>

          {/* Amount + Frequency */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <FormLabel required>Amount</FormLabel>
              <NumberInput value={form.amount} onChange={v => set({ ...form, amount: v })} placeholder="0" />
            </div>
            <div className={styles.field}>
              <FormLabel required>Frequency</FormLabel>
              <ReactSelect<{ value: string; label: string }>
                options={freqOptions}
                value={selectedFreq}
                onChange={opt => opt && set({ ...form, frequency: opt.value as RecurrenceFrequency })}
                isSearchable={false}
                styles={rsStyles}
                theme={rsTheme}
                menuPosition="fixed"
              />
            </div>
          </div>

          {/* Account + Category */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <FormLabel required>Account</FormLabel>
              <ReactSelect<{ value: string; label: string }>
                options={walletOptions}
                value={selectedWallet}
                onChange={opt => set({ ...form, walletId: opt?.value ?? '' })}
                isSearchable
                styles={rsStyles}
                theme={rsTheme}
                menuPosition="fixed"
                placeholder="Select account…"
              />
            </div>
            <div className={styles.field}>
              <FormLabel>Category</FormLabel>
              <SearchableSelect
                options={categoryOptions}
                value={form.categoryId}
                onChange={v => set({ ...form, categoryId: v })}
                placeholder="Choose category"
              />
            </div>
          </div>

          {/* Start + End date */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <FormLabel required>Start date</FormLabel>
              <Input type="date" value={form.startDate} onChange={e => set({ ...form, startDate: e.target.value })} />
            </div>
            <div className={styles.field}>
              <FormLabel>End date <span className={styles.optional}>(optional)</span></FormLabel>
              <Input type="date" value={form.endDate} onChange={e => set({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          {/* Payer + Notes */}
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <FormLabel>Payer / payee <span className={styles.optional}>(optional)</span></FormLabel>
              <Input value={form.payer} onChange={e => set({ ...form, payer: e.target.value })} placeholder="e.g. OTP Bank" />
            </div>
            <div className={styles.field}>
              <FormLabel>Notes <span className={styles.optional}>(optional)</span></FormLabel>
              <Input value={form.notes} onChange={e => set({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div className={styles.field}>
              <FormLabel>Labels <span className={styles.optional}>(optional)</span></FormLabel>
              <LabelSelect labels={labels} selectedIds={form.labelIds} onChange={ids => set({ ...form, labelIds: ids })} />
            </div>
          )}

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.actions}>
            <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Due card sub-component ────────────────────────────────────────────────────

function DueCard({ item, onSelect, currency, dueDateLabel }: {
  item: DueItem;
  onSelect: (item: DueItem) => void;
  currency: 'HUF' | 'USD' | 'EUR';
  dueDateLabel: string;
}) {
  const { payment } = item;
  const isOverdue = dueDateLabel.includes('overdue');
  const metaParts = [
    payment.category && (
      <span key="category" className={styles.recordTag}>{payment.category.icon} {payment.category.name}</span>
    ),
    payment.wallet && (
      <span key="wallet" className={styles.recordTag}>
        <span className={styles.recordDot} style={{ backgroundColor: payment.wallet.color }} />
        {payment.wallet.name}
      </span>
    ),
    payment.payer && (
      <span key="payer" className={styles.recordTag}>{payment.payer}</span>
    ),
    payment.notes && (
      <span key="notes" className={styles.recordNotes}>{payment.notes}</span>
    ),
  ].filter(Boolean);
  return (
    <div className={styles.record} onClick={() => onSelect(item)}>
      <div
        className={styles.recordIcon}
        style={{ backgroundColor: (payment.category?.color ?? '#94a3b8') + '22' }}
      >
        {payment.category?.icon ?? '?'}
      </div>
      <div className={styles.recordMain}>
        <div className={styles.recordTopRow}>
          <span className={styles.recordTitle}>{payment.name}</span>
          {payment.labels && payment.labels.length > 0 && (
            <div className={styles.recordLabels}>
              {payment.labels.map(l => (
                <span key={l.id} className={styles.recordLabel}>
                  <span className={styles.recordLabelDot} style={{ backgroundColor: l.color }} />
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {metaParts.length > 0 && (
          <div className={styles.recordMetaRow}>
            {metaParts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <span className={styles.recordMetaDot}>·</span>}
                {part}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <div className={styles.recordRight}>
        <span className={[styles.recordAmount, payment.type === 'income' ? styles.amtIncome : styles.amtExpense].join(' ')}>
          {payment.type === 'expense' ? '−' : '+'}{formatCurrency(payment.amount, currency)}
        </span>
        <span className={[styles.dueDateBadge, isOverdue ? styles.dueDateBadgeOverdue : ''].join(' ')}>{dueDateLabel}</span>
      </div>
    </div>
  );
}
