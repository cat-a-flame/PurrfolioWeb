'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchAllRows,
  fetchTransactionsForExport,
  buildTransactionsCsv,
  downloadFile,
} from '@/lib/export';
import { todayInputDate } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import FormLabel from '@/components/ui/FormLabel';
import Toast from '@/components/ui/Toast';
import type { Wallet, Category, Label } from '@/lib/types';
import styles from './page.module.css';

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return user.id;
}

export default function ExportPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const rangeError = from && to && from > to ? 'Start date must be before the end date.' : '';

  async function exportCsv() {
    if (rangeError) return;
    setExportingCsv(true);
    try {
      const userId = await requireUserId();
      const [txs, wallets, categories, labels] = await Promise.all([
        fetchTransactionsForExport(userId, from || null, to || null),
        fetchAllRows<Wallet>('wallets', userId),
        fetchAllRows<Category>('categories', userId),
        fetchAllRows<Label>('labels', userId),
      ]);
      if (txs.length === 0) {
        setToast({ message: 'No transactions in the selected period.', variant: 'error' });
        return;
      }
      const csv = buildTransactionsCsv(txs, wallets, categories, labels);
      const suffix = from || to ? `_${from || 'start'}_to_${to || 'today'}` : '';
      downloadFile(csv, `purrfolio-transactions${suffix}.csv`, 'text/csv;charset=utf-8');
      setToast({ message: `Exported ${txs.length} transaction records.`, variant: 'success' });
    } catch {
      setToast({ message: 'Export failed. Please try again.', variant: 'error' });
    } finally {
      setExportingCsv(false);
    }
  }

  async function exportJson() {
    setExportingJson(true);
    try {
      const userId = await requireUserId();
      const [wallets, categories, labels, transactions, recurringPayments, recurringOccurrences, templates] =
        await Promise.all([
          fetchAllRows('wallets', userId),
          fetchAllRows('categories', userId),
          fetchAllRows('labels', userId),
          fetchAllRows('transactions', userId, '*, labels:transaction_labels(*)'),
          fetchAllRows('recurring_payments', userId, '*, labels:recurring_payment_labels(*)'),
          fetchAllRows('recurring_occurrences', userId),
          fetchAllRows('templates', userId, '*, labels:template_labels(*)'),
        ]);
      const backup = {
        app: 'purrfolio',
        version: 1,
        exported_at: new Date().toISOString(),
        wallets,
        categories,
        labels,
        transactions,
        recurring_payments: recurringPayments,
        recurring_occurrences: recurringOccurrences,
        templates,
      };
      downloadFile(
        JSON.stringify(backup, null, 2),
        `purrfolio-backup-${todayInputDate()}.json`,
        'application/json',
      );
      setToast({ message: 'Backup downloaded.', variant: 'success' });
    } catch {
      setToast({ message: 'Backup failed. Please try again.', variant: 'error' });
    } finally {
      setExportingJson(false);
    }
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Export data</h1>

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Transactions (CSV)</h2>
          <p className={styles.helpText}>
            One row per income or expense, and one row per transfer with its destination account.
            Opens in Excel or Google Sheets, and can be imported back on the Import page.
          </p>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <FormLabel htmlFor="export-from">From</FormLabel>
            <Input id="export-from" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className={styles.field}>
            <FormLabel htmlFor="export-to">To</FormLabel>
            <Input id="export-to" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} error={rangeError || undefined} />
          </div>
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}>
              Clear dates
            </Button>
          )}
        </div>
        <p className={styles.hint}>Leave the dates empty to export everything.</p>

        <div className={styles.actions}>
          <Button variant="primary" size="md" loading={exportingCsv} disabled={!!rangeError} onClick={exportCsv}>
            Download CSV
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Full backup (JSON)</h2>
          <p className={styles.helpText}>
            Everything in your account: accounts, categories, labels, transactions, recurring
            payments and templates, with all their fields. Useful as a personal backup.
          </p>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" size="md" loading={exportingJson} onClick={exportJson}>
            Download backup
          </Button>
        </div>
      </section>

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
