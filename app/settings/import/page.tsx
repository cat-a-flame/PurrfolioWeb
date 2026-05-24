'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import Link from 'next/link';
import ReactSelect from 'react-select';
import { createClient } from '@/lib/supabase/client';
import { getExchangeRates } from '@/lib/exchangeRates';
import Button from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import type { Wallet, Category, Label, TransactionType } from '@/lib/types';
import styles from './page.module.css';

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function detectDelimiter(firstLine: string): string {
  const sc = (firstLine.match(/;/g) || []).length;
  const cm = (firstLine.match(/,/g) || []).length;
  return sc >= cm ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === delimiter && !inQ) {
      fields.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  fields.push(cur.trim());
  return fields;
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '').replace(/\r\n|\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  return {
    headers: parseCsvLine(lines[0], delim),
    rows: lines.slice(1).map(l => parseCsvLine(l, delim)),
  };
}

function parseAmount(s: string): number | null {
  const c = s.replace(/[^\d.,\-]/g, '');
  if (!c || c === '-') return null;
  const di = c.lastIndexOf('.');
  const ci = c.lastIndexOf(',');
  let n = c;
  if (di > ci) n = c.replace(/,/g, '');
  else if (ci > di) n = c.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(n);
  return isNaN(v) ? null : v;
}

function parseDate(s: string): string | null {
  const m1 = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  const m3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m3) return `${m3[3]}-${m3[2].padStart(2, '0')}-${m3[1].padStart(2, '0')}`;
  return null;
}

type ImportType = TransactionType | 'transfer';

function autoDetectType(s: string): ImportType | null {
  const l = s.toLowerCase().trim();
  if (/expense|ausgab|kiadás|debit/.test(l)) return 'expense';
  if (/income|einnahm|bevétel|credit|revenue/.test(l)) return 'income';
  if (/transfer|überweis|átutal/.test(l)) return 'transfer';
  return null;
}

function uniqueColValues(rows: string[][], idx: number): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = (row[idx] ?? '').trim();
    if (v) seen.add(v);
  }
  return Array.from(seen).sort();
}

// ─── Internal types ───────────────────────────────────────────────────────────

type TypeSource = 'column' | 'fixed-income' | 'fixed-expense';
type WalletSource = 'fixed' | 'column';
type TransferToWalletSource = 'fixed' | 'column' | 'by-source';

interface ColumnMap {
  amount: string;
  date: string;
  typeSource: TypeSource;
  typeCol: string;
  typeMapping: Record<string, ImportType | ''>;
  walletSource: WalletSource;
  walletCol: string;
  walletFixed: string;
  walletMapping: Record<string, string | null>;
  // Transfer destination
  transferToWalletSource: TransferToWalletSource;
  transferToWalletFixed: string;
  transferToWalletCol: string;
  transferToWalletMapping: Record<string, string | null>; // csv-value→walletId (column mode) or sourceWalletId→destWalletId (by-source mode)
  transferToAmountCol: string;
  // Category
  categoryCol: string;
  categoryMapping: Record<string, string | null>;
  // Other optional
  notesCol: string;
  payerCol: string;
  labelsCol: string;
}

interface PreviewRow {
  index: number;
  raw: string[];
  date: string | null;
  type: ImportType | null;
  amount: number | null;
  walletId: string | null;
  transferToWalletId: string | null;
  transferToAmount: number | null;
  categoryId: string | null;
  notes: string | null;
  payer: string | null;
  labelIds: string[];
  errors: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);

  const [colMap, setColMap] = useState<ColumnMap>({
    amount: '', date: '',
    typeSource: 'column', typeCol: '', typeMapping: {},
    walletSource: 'fixed', walletCol: '', walletFixed: '', walletMapping: {},
    transferToWalletSource: 'fixed', transferToWalletFixed: '', transferToWalletCol: '', transferToWalletMapping: {},
    transferToAmountCol: '',
    categoryCol: '', categoryMapping: {},
    notesCol: '', payerCol: '', labelsCol: '',
  });

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [filterView, setFilterView] = useState<'all' | 'valid' | 'invalid'>('all');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; skipped: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [wRes, cRes, lRes] = await Promise.all([
        supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
        supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
        supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      ]);
      if (wRes.data) {
        setWallets(wRes.data);
        setColMap(m => m.walletFixed ? m : { ...m, walletFixed: wRes.data.find((w: Wallet) => w.is_default)?.id ?? wRes.data[0]?.id ?? '' });
      }
      if (cRes.data) setCategories(cRes.data);
      if (lRes.data) setLabels(lRes.data);
    }
    load();
  }, []);

  // ─── File handling ────────────────────────────────────────────────────────

  function handleFile(file: File) {
    if (!file.name.match(/\.csv$/i)) {
      setToast({ message: 'Please select a CSV file.', variant: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      if (!parsed.headers.length) {
        setToast({ message: 'Could not parse the CSV file.', variant: 'error' });
        return;
      }
      setCsv(parsed);
      setFileName(file.name);
      setImportResult(null);
      setColMap(m => ({
        ...m,
        amount: '', date: '', typeCol: '', typeMapping: {},
        walletCol: '', walletMapping: {},
        transferToWalletCol: '', transferToWalletMapping: {}, transferToAmountCol: '',
        categoryCol: '', categoryMapping: {},
        notesCol: '', payerCol: '', labelsCol: '',
      }));
    };
    reader.readAsText(file, 'utf-8');
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  // ─── Column helpers ────────────────────────────────────────────────────────

  function colIdx(name: string) {
    return (csv?.headers ?? []).indexOf(name);
  }

  function sampleValue(colName: string) {
    const i = colIdx(colName);
    return i >= 0 ? (csv?.rows[0]?.[i] ?? '') : '';
  }

  function onTypeColChange(col: string) {
    if (!csv) return;
    const idx = colIdx(col);
    const vals = idx >= 0 ? uniqueColValues(csv.rows, idx) : [];
    const mapping: Record<string, ImportType | ''> = {};
    for (const v of vals) mapping[v] = autoDetectType(v) ?? '';
    setColMap(m => ({ ...m, typeCol: col, typeMapping: mapping }));
  }

  function onWalletColChange(col: string) {
    if (!csv) return;
    const idx = colIdx(col);
    const vals = idx >= 0 ? uniqueColValues(csv.rows, idx) : [];
    const mapping: Record<string, string | null> = {};
    for (const v of vals) {
      const match = wallets.find(w => w.name.toLowerCase() === v.toLowerCase());
      mapping[v] = match?.id ?? null;
    }
    setColMap(m => ({ ...m, walletCol: col, walletMapping: mapping }));
  }

  function onTransferToWalletColChange(col: string) {
    if (!csv) return;
    const idx = colIdx(col);
    const vals = idx >= 0 ? uniqueColValues(csv.rows, idx) : [];
    const mapping: Record<string, string | null> = {};
    for (const v of vals) {
      const match = wallets.find(w => w.name.toLowerCase() === v.toLowerCase());
      mapping[v] = match?.id ?? null;
    }
    setColMap(m => ({ ...m, transferToWalletCol: col, transferToWalletMapping: mapping }));
  }

  function onCategoryColChange(col: string) {
    if (!col) {
      setColMap(m => ({ ...m, categoryCol: '', categoryMapping: {} }));
      return;
    }
    if (!csv) return;
    const idx = colIdx(col);
    const vals = idx >= 0 ? uniqueColValues(csv.rows, idx) : [];
    const mapping: Record<string, string | null> = {};
    for (const v of vals) {
      const match = categories.find(c => c.name.toLowerCase() === v.toLowerCase());
      mapping[v] = match?.id ?? null;
    }
    setColMap(m => ({ ...m, categoryCol: col, categoryMapping: mapping }));
  }

  // ─── Derived flags ────────────────────────────────────────────────────────

  const hasTransferType = colMap.typeSource === 'column' && Object.values(colMap.typeMapping).includes('transfer');
  const unmappedCategories = Object.entries(colMap.categoryMapping).filter(([, v]) => v === null);

  // Source wallet IDs that appear on transfer rows — used for 'by-source' mode
  const transferSourceWalletIds: string[] = (() => {
    if (!csv || !hasTransferType) return [];
    const typIdx = colIdx(colMap.typeCol);
    const walIdx = colMap.walletSource === 'column' ? colIdx(colMap.walletCol) : -1;
    const seen = new Set<string>();
    for (const row of csv.rows) {
      const typeVal = typIdx >= 0 ? (row[typIdx] ?? '').trim() : '';
      if (colMap.typeMapping[typeVal] !== 'transfer') continue;
      const srcId = colMap.walletSource === 'fixed'
        ? (colMap.walletFixed || null)
        : (walIdx >= 0 ? (colMap.walletMapping[(row[walIdx] ?? '').trim()] ?? null) : null);
      if (srcId) seen.add(srcId);
    }
    return [...seen];
  })();

  // ─── Step 2 validation ────────────────────────────────────────────────────

  function validateStep2(): string | null {
    if (!colMap.amount) return 'Select the Amount column.';
    if (!colMap.date) return 'Select the Date column.';
    if (colMap.typeSource === 'column') {
      if (!colMap.typeCol) return 'Select the Transaction Type column or choose a fixed type.';
      const missing = Object.entries(colMap.typeMapping).find(([, v]) => !v);
      if (missing) return `Map type value "${missing[0]}" to Income, Expense, or Transfer.`;
    }
    if (colMap.walletSource === 'column') {
      if (!colMap.walletCol) return 'Select the Wallet column or choose a fixed wallet.';
      const missing = Object.entries(colMap.walletMapping).find(([, v]) => !v);
      if (missing) return `Assign a wallet for CSV value "${missing[0]}".`;
    } else {
      if (!colMap.walletFixed) return 'Select a wallet.';
    }
    if (hasTransferType) {
      if (colMap.transferToWalletSource === 'column') {
        if (!colMap.transferToWalletCol) return 'Select the destination wallet column for transfers.';
        const missing = Object.entries(colMap.transferToWalletMapping).find(([k, v]) => k && !v);
        if (missing) return `Assign a destination wallet for transfer value "${missing[0]}".`;
      } else if (colMap.transferToWalletSource === 'by-source') {
        for (const srcId of transferSourceWalletIds) {
          if (!colMap.transferToWalletMapping[srcId]) {
            const w = wallets.find(w => w.id === srcId);
            return `Select a destination wallet for transfers from "${w?.name ?? srcId}".`;
          }
        }
      } else {
        if (!colMap.transferToWalletFixed) return 'Select a destination wallet for transfers.';
      }
    }
    return null;
  }

  // ─── Build preview rows ───────────────────────────────────────────────────

  function buildPreview(): PreviewRow[] {
    if (!csv) return [];
    const { rows } = csv;
    const amtI  = colIdx(colMap.amount);
    const datI  = colIdx(colMap.date);
    const typI  = colMap.typeSource === 'column' ? colIdx(colMap.typeCol) : -1;
    const walI  = colMap.walletSource === 'column' ? colIdx(colMap.walletCol) : -1;
    const catI  = colMap.categoryCol ? colIdx(colMap.categoryCol) : -1;
    const notI  = colMap.notesCol ? colIdx(colMap.notesCol) : -1;
    const payI  = colMap.payerCol ? colIdx(colMap.payerCol) : -1;
    const lblI  = colMap.labelsCol ? colIdx(colMap.labelsCol) : -1;
    const ttwI  = colMap.transferToWalletSource === 'column' && colMap.transferToWalletCol ? colIdx(colMap.transferToWalletCol) : -1;
    const ttAmI = colMap.transferToAmountCol ? colIdx(colMap.transferToAmountCol) : -1;

    return rows.map((row, i) => {
      const errors: string[] = [];

      const rawAmt = amtI >= 0 ? (row[amtI] ?? '') : '';
      const parsedAmt = parseAmount(rawAmt);
      if (parsedAmt === null) errors.push('Invalid amount');

      const rawDate = datI >= 0 ? (row[datI] ?? '') : '';
      const parsedDate = parseDate(rawDate);
      if (!parsedDate) errors.push('Invalid date');

      let txType: ImportType | null = null;
      if (colMap.typeSource === 'fixed-income') txType = 'income';
      else if (colMap.typeSource === 'fixed-expense') txType = 'expense';
      else if (typI >= 0) {
        const raw = (row[typI] ?? '').trim();
        txType = (colMap.typeMapping[raw] as ImportType) || null;
        if (!txType) errors.push('Unknown type');
      }

      const amount = parsedAmt !== null ? Math.abs(parsedAmt) : null;

      let walletId: string | null = null;
      if (colMap.walletSource === 'fixed') {
        walletId = colMap.walletFixed || null;
      } else if (walI >= 0) {
        const raw = (row[walI] ?? '').trim();
        walletId = colMap.walletMapping[raw] ?? null;
        if (!walletId) errors.push('Unresolved wallet');
      }
      if (!walletId) errors.push('No wallet');

      // Transfer destination
      let transferToWalletId: string | null = null;
      let transferToAmount: number | null = null;
      if (txType === 'transfer') {
        if (colMap.transferToWalletSource === 'fixed') {
          transferToWalletId = colMap.transferToWalletFixed || null;
        } else if (colMap.transferToWalletSource === 'by-source') {
          transferToWalletId = walletId ? (colMap.transferToWalletMapping[walletId] ?? null) : null;
        } else if (ttwI >= 0) {
          const raw = (row[ttwI] ?? '').trim();
          transferToWalletId = colMap.transferToWalletMapping[raw] ?? null;
        }
        if (!transferToWalletId) errors.push('No destination wallet');
        if (ttAmI >= 0) {
          const raw = (row[ttAmI] ?? '').trim();
          const parsed = parseAmount(raw);
          transferToAmount = parsed !== null ? Math.abs(parsed) : null;
        }
        if (transferToAmount === null) transferToAmount = amount;
      }

      // Category: use the explicit mapping built in Step 2
      let categoryId: string | null = null;
      if (catI >= 0) {
        const raw = (row[catI] ?? '').trim();
        if (raw) categoryId = colMap.categoryMapping[raw] ?? null;
      }

      const notes = notI >= 0 ? ((row[notI] ?? '').trim() || null) : null;
      const payer = payI >= 0 ? ((row[payI] ?? '').trim() || null) : null;

      const labelIds: string[] = [];
      if (lblI >= 0) {
        const raw = (row[lblI] ?? '').trim();
        if (raw) {
          const names = raw.split(/[,|]/).map(s => s.trim()).filter(Boolean);
          for (const name of names) {
            const match = labels.find(l => l.name.toLowerCase() === name.toLowerCase());
            if (match) labelIds.push(match.id);
          }
        }
      }

      return { index: i, raw: row, date: parsedDate, type: txType, amount, walletId, transferToWalletId, transferToAmount, categoryId, notes, payer, labelIds, errors };
    });
  }

  function goToPreview() {
    const err = validateStep2();
    if (err) { setToast({ message: err, variant: 'error' }); return; }
    const rows = buildPreview();
    setPreviewRows(rows);
    setFilterView(rows.some(r => r.errors.length > 0) ? 'invalid' : 'all');
    setStep(3);
  }

  // ─── Import ───────────────────────────────────────────────────────────────

  async function handleImport() {
    const valid = previewRows.filter(r => r.errors.length === 0);
    if (!valid.length) {
      setToast({ message: 'No valid transactions to import.', variant: 'error' });
      return;
    }
    setImporting(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }

    // Pre-fetch exchange rates for all non-HUF dates in one pass
    const datesToFetch = new Set<string>();
    for (const r of valid) {
      const fromWallet = wallets.find(w => w.id === r.walletId);
      if (fromWallet?.currency && fromWallet.currency !== 'HUF') datesToFetch.add(r.date!);
      if (r.type === 'transfer') {
        const toWallet = wallets.find(w => w.id === r.transferToWalletId);
        if (toWallet?.currency && toWallet.currency !== 'HUF') datesToFetch.add(r.date!);
      }
    }
    const ratesCache: Record<string, Record<string, number>> = {};
    await Promise.all([...datesToFetch].map(async date => {
      ratesCache[date] = await getExchangeRates(date);
    }));

    function rateFor(walletId: string | null, date: string | null): number | null {
      if (!walletId || !date) return null;
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet?.currency || wallet.currency === 'HUF') return null;
      return ratesCache[date]?.[wallet.currency] ?? null;
    }

    let success = 0;
    let failed = 0;

    const regular = valid.filter(r => r.type !== 'transfer');
    const transfers = valid.filter(r => r.type === 'transfer');

    // Regular rows: batch insert
    const BATCH = 100;
    for (let i = 0; i < regular.length; i += BATCH) {
      const slice = regular.slice(i, i + BATCH);
      const batch = slice.map(r => ({
        user_id: user.id,
        type: r.type as TransactionType,
        amount: r.amount as number,
        wallet_id: r.walletId as string,
        category_id: r.categoryId,
        date: r.date as string,
        notes: r.notes,
        payer: r.payer,
        exchange_rate_to_huf: rateFor(r.walletId, r.date),
      }));
      const { data: inserted, error } = await supabase.from('transactions').insert(batch).select('id');
      if (error || !inserted) {
        failed += batch.length;
      } else {
        success += inserted.length;
        const labelLinks = inserted.flatMap((tx: { id: string }, idx: number) =>
          slice[idx].labelIds.map(lid => ({ transaction_id: tx.id, label_id: lid }))
        ).filter((link: { transaction_id: string; label_id: string }) => link.label_id);
        if (labelLinks.length > 0) await supabase.from('transaction_labels').insert(labelLinks);
      }
    }

    // Transfer rows: each becomes two linked transactions
    for (const r of transfers) {
      const transferGroupId = crypto.randomUUID();
      const common = { user_id: user.id, date: r.date as string, notes: r.notes, transfer_group_id: transferGroupId };
      const { error } = await supabase.from('transactions').insert([
        {
          ...common,
          type: 'expense',
          amount: r.amount as number,
          wallet_id: r.walletId as string,
          category_id: r.categoryId,
          exchange_rate_to_huf: rateFor(r.walletId, r.date),
        },
        {
          ...common,
          type: 'income',
          amount: (r.transferToAmount ?? r.amount) as number,
          wallet_id: r.transferToWalletId as string,
          exchange_rate_to_huf: rateFor(r.transferToWalletId, r.date),
        },
      ]);
      if (error) failed += 2;
      else success += 2;
    }

    const skipped = previewRows.filter(r => r.errors.length > 0).length + failed;
    setImporting(false);
    setImportResult({ success, skipped });
    if (success > 0) {
      setToast({ message: `${success} transaction${success !== 1 ? 's' : ''} imported.`, variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
    } else {
      setToast({ message: 'Import failed. Please check your data.', variant: 'error' });
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  function reset() {
    setStep(1);
    setCsv(null);
    setFileName('');
    setImportResult(null);
    setPreviewRows([]);
    setFilterView('all');
    setColMap(m => ({
      amount: '', date: '',
      typeSource: 'column', typeCol: '', typeMapping: {},
      walletSource: 'fixed', walletCol: '', walletFixed: m.walletFixed, walletMapping: {},
      transferToWalletSource: 'fixed', transferToWalletFixed: '', transferToWalletCol: '', transferToWalletMapping: {},
      transferToAmountCol: '',
      categoryCol: '', categoryMapping: {},
      notesCol: '', payerCol: '', labelsCol: '',
    }));
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const headers = csv?.headers ?? [];
  const colOptions = headers.map(h => ({ value: h, label: h }));
  const colOptionsWithBlank = [{ value: '', label: '— select column —' }, ...colOptions];
  const colOptionsWithSkip = [{ value: '', label: 'Skip' }, ...colOptions];

  const validCount = previewRows.filter(r => r.errors.length === 0).length;
  const skippedCount = previewRows.length - validCount;
  const displayedRows = filterView === 'valid'
    ? previewRows.filter(r => r.errors.length === 0)
    : filterView === 'invalid'
    ? previewRows.filter(r => r.errors.length > 0)
    : previewRows;

  const hasAnyTransfer = previewRows.some(r => r.type === 'transfer');
  const walletOpts = [{ value: '', label: '— select wallet —' }, ...wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name}` }))];
  const categoryOpts = [{ value: '', label: '— skip (no category) —' }, ...categories.map(c => ({ value: c.id, label: `${c.icon} ${c.name}` }))];

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Import Transactions</h1>
        <div className={styles.stepper}>
          {(['Upload', 'Map columns', 'Preview & import'] as const).map((label, i) => (
            <div
              key={label}
              className={[
                styles.stepItem,
                step === i + 1 ? styles.stepActive : '',
                step > i + 1 ? styles.stepDone : '',
              ].filter(Boolean).join(' ')}
            >
              <span className={styles.stepBubble}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upload a CSV file</h2>
          <p className={styles.helpText}>
            Select a CSV exported from your expense tracker. Both comma and semicolon separators are detected automatically.
          </p>

          <div
            className={[styles.dropZone, dragOver ? styles.dropZoneOver : ''].filter(Boolean).join(' ')}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Upload CSV file"
          >
            <input ref={fileInputRef} type="file" accept=".csv" className={styles.hiddenInput} onChange={onFileInput} />
            <span className={styles.dropIcon}>📂</span>
            {csv ? (
              <div className={styles.fileInfoBlock}>
                <span className={styles.fileName}>{fileName}</span>
                <span className={styles.fileMeta}>{csv.rows.length} rows · {csv.headers.length} columns detected</span>
              </div>
            ) : (
              <div className={styles.fileInfoBlock}>
                <span className={styles.dropPrimary}>Click to browse or drag & drop</span>
                <span className={styles.dropSecondary}>Accepts .csv files</span>
              </div>
            )}
          </div>

          {csv && csv.rows.length > 0 && (
            <div className={styles.previewBlock}>
              <p className={styles.previewLabel}>Preview — first 5 rows</p>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr>{csv.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {csv.rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="primary" size="md" disabled={!csv || csv.rows.length === 0} onClick={() => setStep(2)}>
              Next →
            </Button>
          </div>
        </section>
      )}

      {/* ── Step 2: Map columns ── */}
      {step === 2 && csv && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Map columns</h2>
          <p className={styles.helpText}>
            Tell the app which CSV columns correspond to each field. The sample value is taken from the first data row.
          </p>

          {/* Required fields */}
          <div className={styles.fieldGroup}>
            <p className={styles.groupTitle}>Required</p>

            {/* Amount */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}><span className={styles.req}>*</span>Amount</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithBlank}
                    value={colOptionsWithBlank.find(o => o.value === colMap.amount) ?? colOptionsWithBlank[0]}
                    onChange={opt => setColMap(m => ({ ...m, amount: opt?.value ?? '' }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.amount && <span className={styles.sample}>{sampleValue(colMap.amount)}</span>}
              </div>
            </div>

            {/* Date */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}><span className={styles.req}>*</span>Date</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithBlank}
                    value={colOptionsWithBlank.find(o => o.value === colMap.date) ?? colOptionsWithBlank[0]}
                    onChange={opt => setColMap(m => ({ ...m, date: opt?.value ?? '' }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.date && <span className={styles.sample}>{sampleValue(colMap.date)}</span>}
              </div>
            </div>

            {/* Type */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}><span className={styles.req}>*</span>Type</span>
              <div className={styles.mapControls}>
                {(() => {
                  const typeSourceOptions = [
                    { value: 'column', label: 'From column…' },
                    { value: 'fixed-income', label: 'All Income' },
                    { value: 'fixed-expense', label: 'All Expense' },
                  ];
                  return (
                    <div style={{ minWidth: 200 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={typeSourceOptions}
                        value={typeSourceOptions.find(o => o.value === colMap.typeSource) ?? typeSourceOptions[0]}
                        onChange={opt => {
                          const v = (opt?.value ?? 'column') as TypeSource;
                          if (v === 'column') setColMap(m => ({ ...m, typeSource: 'column' }));
                          else setColMap(m => ({ ...m, typeSource: v, typeMapping: {} }));
                        }}
                        isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                      />
                    </div>
                  );
                })()}
                {colMap.typeSource === 'column' && (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={colOptionsWithBlank}
                      value={colOptionsWithBlank.find(o => o.value === colMap.typeCol) ?? colOptionsWithBlank[0]}
                      onChange={opt => onTypeColChange(opt?.value ?? '')}
                      isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Type value mapping — now includes Transfer */}
            {colMap.typeSource === 'column' && colMap.typeCol && Object.keys(colMap.typeMapping).length > 0 && (
              <div className={styles.valueMapBlock}>
                <p className={styles.valueMapTitle}>Assign each value to Income, Expense, or Transfer:</p>
                {Object.entries(colMap.typeMapping).map(([val, mapped]) => {
                  const typeMappingOpts = [
                    { value: '', label: '— assign —' },
                    { value: 'income', label: 'Income' },
                    { value: 'expense', label: 'Expense' },
                    { value: 'transfer', label: 'Transfer' },
                  ];
                  return (
                    <div key={val} className={styles.valueMapRow}>
                      <span className={styles.csvVal}>&ldquo;{val}&rdquo;</span>
                      <span className={styles.arrow}>→</span>
                      <div style={{ minWidth: 160 }}>
                        <ReactSelect<{ value: string; label: string }>
                          options={typeMappingOpts}
                          value={typeMappingOpts.find(o => o.value === (mapped ?? '')) ?? typeMappingOpts[0]}
                          onChange={opt => setColMap(m => ({
                            ...m,
                            typeMapping: { ...m.typeMapping, [val]: (opt?.value ?? '') as ImportType | '' },
                          }))}
                          isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Wallet */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}><span className={styles.req}>*</span>Wallet</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={[{ value: 'fixed', label: 'Fixed wallet' }, { value: 'column', label: 'From column…' }]}
                    value={colMap.walletSource === 'fixed' ? { value: 'fixed', label: 'Fixed wallet' } : { value: 'column', label: 'From column…' }}
                    onChange={opt => setColMap(m => ({ ...m, walletSource: (opt?.value ?? 'fixed') as WalletSource }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.walletSource === 'fixed' ? (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={walletOpts}
                      value={walletOpts.find(o => o.value === colMap.walletFixed) ?? walletOpts[0]}
                      onChange={opt => setColMap(m => ({ ...m, walletFixed: opt?.value ?? '' }))}
                      isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                    />
                  </div>
                ) : (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={colOptionsWithBlank}
                      value={colOptionsWithBlank.find(o => o.value === colMap.walletCol) ?? colOptionsWithBlank[0]}
                      onChange={opt => onWalletColChange(opt?.value ?? '')}
                      isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                    />
                  </div>
                )}
              </div>
            </div>

            {colMap.walletSource === 'column' && colMap.walletCol && Object.keys(colMap.walletMapping).length > 0 && (
              <div className={styles.valueMapBlock}>
                <p className={styles.valueMapTitle}>Match each wallet name to one of your wallets:</p>
                {Object.entries(colMap.walletMapping).map(([val, wId]) => (
                  <div key={val} className={styles.valueMapRow}>
                    <span className={styles.csvVal}>&ldquo;{val}&rdquo;</span>
                    <span className={styles.arrow}>→</span>
                    <div style={{ minWidth: 200 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={walletOpts}
                        value={walletOpts.find(o => o.value === (wId ?? '')) ?? walletOpts[0]}
                        onChange={opt => setColMap(m => ({ ...m, walletMapping: { ...m.walletMapping, [val]: opt?.value || null } }))}
                        isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transfer settings — shown only when at least one type is mapped to 'transfer' */}
          {hasTransferType && (
            <div className={styles.fieldGroup}>
              <p className={styles.groupTitle}>Transfer settings</p>

              <div className={styles.mapRow}>
                <span className={styles.fieldName}><span className={styles.req}>*</span>To wallet</span>
                <div className={styles.mapControls}>
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={[
                        { value: 'fixed',     label: 'Fixed wallet' },
                        { value: 'by-source', label: 'By source wallet' },
                        { value: 'column',    label: 'From column…' },
                      ]}
                      value={
                        colMap.transferToWalletSource === 'by-source' ? { value: 'by-source', label: 'By source wallet' } :
                        colMap.transferToWalletSource === 'column'    ? { value: 'column',    label: 'From column…' } :
                                                                        { value: 'fixed',     label: 'Fixed wallet' }
                      }
                      onChange={opt => setColMap(m => ({
                        ...m,
                        transferToWalletSource: (opt?.value ?? 'fixed') as TransferToWalletSource,
                        transferToWalletMapping: {},
                      }))}
                      isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                    />
                  </div>
                  {colMap.transferToWalletSource === 'fixed' && (
                    <div style={{ minWidth: 200 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={walletOpts}
                        value={walletOpts.find(o => o.value === colMap.transferToWalletFixed) ?? walletOpts[0]}
                        onChange={opt => setColMap(m => ({ ...m, transferToWalletFixed: opt?.value ?? '' }))}
                        isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                      />
                    </div>
                  )}
                  {colMap.transferToWalletSource === 'column' && (
                    <div style={{ minWidth: 200 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={colOptionsWithBlank}
                        value={colOptionsWithBlank.find(o => o.value === colMap.transferToWalletCol) ?? colOptionsWithBlank[0]}
                        onChange={opt => onTransferToWalletColChange(opt?.value ?? '')}
                        isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* By-source mapping: one destination picker per source wallet */}
              {colMap.transferToWalletSource === 'by-source' && transferSourceWalletIds.length > 0 && (
                <div className={styles.valueMapBlock}>
                  <p className={styles.valueMapTitle}>Where does money go from each wallet?</p>
                  {transferSourceWalletIds.map(srcId => {
                    const srcWallet = wallets.find(w => w.id === srcId);
                    const destId = colMap.transferToWalletMapping[srcId] ?? null;
                    return (
                      <div key={srcId} className={styles.valueMapRow}>
                        <span className={styles.csvVal}>
                          {srcWallet ? `${srcWallet.icon} ${srcWallet.name}` : srcId}
                        </span>
                        <span className={styles.arrow}>→</span>
                        <div style={{ minWidth: 200 }}>
                          <ReactSelect<{ value: string; label: string }>
                            options={walletOpts}
                            value={walletOpts.find(o => o.value === (destId ?? '')) ?? walletOpts[0]}
                            onChange={opt => setColMap(m => ({
                              ...m,
                              transferToWalletMapping: { ...m.transferToWalletMapping, [srcId]: opt?.value || null },
                            }))}
                            isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {colMap.transferToWalletSource === 'by-source' && transferSourceWalletIds.length === 0 && (
                <p className={styles.fieldHint}>Map the wallet and type columns first — source wallets will appear here.</p>
              )}

              {/* Column mapping */}
              {colMap.transferToWalletSource === 'column' && colMap.transferToWalletCol && Object.keys(colMap.transferToWalletMapping).length > 0 && (
                <div className={styles.valueMapBlock}>
                  <p className={styles.valueMapTitle}>Match each destination wallet name:</p>
                  {Object.entries(colMap.transferToWalletMapping).map(([val, wId]) => (
                    <div key={val} className={styles.valueMapRow}>
                      <span className={styles.csvVal}>&ldquo;{val}&rdquo;</span>
                      <span className={styles.arrow}>→</span>
                      <div style={{ minWidth: 200 }}>
                        <ReactSelect<{ value: string; label: string }>
                          options={walletOpts}
                          value={walletOpts.find(o => o.value === (wId ?? '')) ?? walletOpts[0]}
                          onChange={opt => setColMap(m => ({ ...m, transferToWalletMapping: { ...m.transferToWalletMapping, [val]: opt?.value || null } }))}
                          isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.mapRow}>
                <span className={styles.fieldName}>To amount</span>
                <div className={styles.mapControls}>
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={colOptionsWithSkip}
                      value={colOptionsWithSkip.find(o => o.value === colMap.transferToAmountCol) ?? colOptionsWithSkip[0]}
                      onChange={opt => setColMap(m => ({ ...m, transferToAmountCol: opt?.value ?? '' }))}
                      isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                    />
                  </div>
                  {colMap.transferToAmountCol && <span className={styles.sample}>{sampleValue(colMap.transferToAmountCol)}</span>}
                </div>
              </div>
              <p className={styles.fieldHint}>
                Amount received in the destination wallet. Leave as Skip to use the same amount as the source.
              </p>
            </div>
          )}

          {/* Optional fields */}
          <div className={styles.fieldGroup}>
            <p className={styles.groupTitle}>Optional</p>

            {/* Category */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}>Category</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithSkip}
                    value={colOptionsWithSkip.find(o => o.value === colMap.categoryCol) ?? colOptionsWithSkip[0]}
                    onChange={opt => onCategoryColChange(opt?.value ?? '')}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.categoryCol && <span className={styles.sample}>{sampleValue(colMap.categoryCol)}</span>}
              </div>
            </div>

            {/* Category value mapping */}
            {colMap.categoryCol && Object.keys(colMap.categoryMapping).length > 0 && (
              <div className={styles.valueMapBlock}>
                <p className={styles.valueMapTitle}>
                  Map each category to one of yours
                  {unmappedCategories.length > 0 && (
                    <span className={styles.unmappedBadge}>{unmappedCategories.length} unmatched</span>
                  )}:
                </p>
                {Object.entries(colMap.categoryMapping).map(([val, catId]) => (
                  <div key={val} className={styles.valueMapRow}>
                    <span className={styles.csvVal}>&ldquo;{val}&rdquo;</span>
                    <span className={styles.arrow}>→</span>
                    <div style={{ minWidth: 220 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={categoryOpts}
                        value={categoryOpts.find(o => o.value === (catId ?? '')) ?? categoryOpts[0]}
                        onChange={opt => setColMap(m => ({ ...m, categoryMapping: { ...m.categoryMapping, [val]: opt?.value || null } }))}
                        isSearchable styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                      />
                    </div>
                    {catId !== null && <span className={styles.autoMatched}>✓ matched</span>}
                  </div>
                ))}
                {unmappedCategories.length > 0 && (
                  <p className={styles.fieldHint}>Unmatched categories will be imported without a category.</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}>Notes</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithSkip}
                    value={colOptionsWithSkip.find(o => o.value === colMap.notesCol) ?? colOptionsWithSkip[0]}
                    onChange={opt => setColMap(m => ({ ...m, notesCol: opt?.value ?? '' }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.notesCol && <span className={styles.sample}>{sampleValue(colMap.notesCol)}</span>}
              </div>
            </div>

            {/* Payer */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}>Payer / payee</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithSkip}
                    value={colOptionsWithSkip.find(o => o.value === colMap.payerCol) ?? colOptionsWithSkip[0]}
                    onChange={opt => setColMap(m => ({ ...m, payerCol: opt?.value ?? '' }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.payerCol && <span className={styles.sample}>{sampleValue(colMap.payerCol)}</span>}
              </div>
            </div>

            {/* Labels */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}>Labels</span>
              <div className={styles.mapControls}>
                <div style={{ minWidth: 200 }}>
                  <ReactSelect<{ value: string; label: string }>
                    options={colOptionsWithSkip}
                    value={colOptionsWithSkip.find(o => o.value === colMap.labelsCol) ?? colOptionsWithSkip[0]}
                    onChange={opt => setColMap(m => ({ ...m, labelsCol: opt?.value ?? '' }))}
                    isSearchable={false} styles={makeRsStyles('sm')} theme={rsTheme} menuPosition="fixed"
                  />
                </div>
                {colMap.labelsCol && <span className={styles.sample}>{sampleValue(colMap.labelsCol)}</span>}
              </div>
            </div>
            {colMap.labelsCol && (
              <p className={styles.fieldHint}>
                Label names are matched to your existing labels. Multiple labels can be separated by commas. Unrecognised names are ignored.
              </p>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" size="md" onClick={() => setStep(1)}>← Back</Button>
            <Button variant="primary" size="md" onClick={goToPreview}>Preview →</Button>
          </div>
        </section>
      )}

      {/* ── Step 3: Preview & import ── */}
      {step === 3 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Preview & import</h2>

          {!importResult ? (
            <>
              <div className={styles.previewHeader}>
                <div className={styles.importStats}>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{validCount}</span>
                    <span className={styles.statLabel}>ready to import</span>
                  </div>
                  {skippedCount > 0 && (
                    <div className={[styles.stat, styles.statError].join(' ')}>
                      <span className={styles.statNum}>{skippedCount}</span>
                      <span className={styles.statLabel}>cannot be imported</span>
                    </div>
                  )}
                </div>
                <div className={styles.filterTabs}>
                  {(['all', 'valid', 'invalid'] as const).map(v => (
                    <button
                      key={v}
                      className={[styles.filterTab, filterView === v ? styles.filterTabActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setFilterView(v)}
                    >
                      {v === 'all' && `All (${previewRows.length})`}
                      {v === 'valid' && `✓ Valid (${validCount})`}
                      {v === 'invalid' && `✕ Issues (${skippedCount})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Wallet</th>
                      {hasAnyTransfer && <th>To wallet</th>}
                      <th>Category</th>
                      <th>Notes</th>
                      <th>Labels</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map(row => {
                      const wallet    = wallets.find(w => w.id === row.walletId);
                      const toWallet  = wallets.find(w => w.id === row.transferToWalletId);
                      const category  = categories.find(c => c.id === row.categoryId);
                      const bad       = row.errors.length > 0;
                      const isTransfer = row.type === 'transfer';
                      return (
                        <>
                          <tr key={row.index} className={bad ? styles.rowError : ''}>
                            <td className={styles.rowNum}>{row.index + 1}</td>
                            <td>{row.date ?? <span className={styles.missing}>–</span>}</td>
                            <td>
                              {row.type ? (
                                <span className={isTransfer ? styles.tagTransfer : row.type === 'income' ? styles.tagIncome : styles.tagExpense}>
                                  {isTransfer ? '↔ transfer' : row.type}
                                </span>
                              ) : <span className={styles.missing}>–</span>}
                            </td>
                            <td className={isTransfer ? styles.amtTransfer : row.type === 'expense' ? styles.amtExpense : styles.amtIncome}>
                              {row.amount !== null
                                ? (isTransfer ? '' : row.type === 'expense' ? '−' : '+') + row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : <span className={styles.missing}>–</span>}
                            </td>
                            <td>{wallet ? `${wallet.icon} ${wallet.name}` : <span className={styles.missing}>–</span>}</td>
                            {hasAnyTransfer && (
                              <td>
                                {isTransfer
                                  ? (toWallet ? `${toWallet.icon} ${toWallet.name}` : <span className={styles.missing}>–</span>)
                                  : <span className={styles.muted}>—</span>}
                              </td>
                            )}
                            <td>{category?.name ?? <span className={styles.muted}>none</span>}</td>
                            <td className={styles.noteCol}>{row.notes ?? ''}</td>
                            <td>
                              {row.labelIds.map(id => {
                                const lbl = labels.find(l => l.id === id);
                                return lbl ? (
                                  <span key={id} className={styles.labelChip} style={{ background: lbl.color + '33', color: lbl.color }}>
                                    {lbl.name}
                                  </span>
                                ) : null;
                              })}
                            </td>
                            <td>
                              {bad ? (
                                <ul className={styles.errorList}>
                                  {row.errors.map((e, i) => <li key={i} className={styles.statusErr}>✕ {e}</li>)}
                                </ul>
                              ) : <span className={styles.statusOk}>✓</span>}
                            </td>
                          </tr>
                          {bad && (
                            <tr key={`${row.index}-raw`} className={styles.rawRow}>
                              <td />
                              <td colSpan={hasAnyTransfer ? 9 : 8} className={styles.rawCell}>
                                <span className={styles.rawLabel}>Original: </span>
                                {(csv?.headers ?? []).map((h, i) => (
                                  <span key={i} className={styles.rawField}>
                                    <span className={styles.rawKey}>{h}</span>
                                    <span className={styles.rawVal}>{row.raw[i] ?? ''}</span>
                                  </span>
                                ))}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {displayedRows.length === 0 && <p className={styles.truncNote}>No rows to show for this filter.</p>}

              <div className={styles.actions}>
                <Button variant="secondary" size="md" onClick={() => setStep(2)} disabled={importing}>← Back</Button>
                <Button variant="primary" size="md" loading={importing} disabled={validCount === 0 || importing} onClick={handleImport}>
                  Import {validCount} transaction{validCount !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.resultBlock}>
              {importResult.success > 0 && (
                <p className={styles.resultSuccess}>
                  ✓ {importResult.success} transaction{importResult.success !== 1 ? 's' : ''} imported successfully.
                </p>
              )}
              {importResult.skipped > 0 && (
                <p className={styles.resultSkipped}>
                  {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} were skipped due to errors.
                </p>
              )}
              <div className={styles.actions}>
                <Link href="/transactions" className={styles.linkBtn}>View transactions</Link>
                <Button variant="primary" size="md" onClick={reset}>Import another file</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
