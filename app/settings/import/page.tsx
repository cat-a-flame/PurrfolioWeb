'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import Link from 'next/link';
import ReactSelect from 'react-select';
import { createClient } from '@/lib/supabase/client';
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

function autoDetectType(s: string): TransactionType | null {
  const l = s.toLowerCase().trim();
  if (/expense|ausgab|kiadás|debit/.test(l)) return 'expense';
  if (/income|einnahm|bevétel|credit|revenue/.test(l)) return 'income';
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
type WalletSource = 'column' | 'fixed';

interface ColumnMap {
  amount: string;
  date: string;
  typeSource: TypeSource;
  typeCol: string;
  typeMapping: Record<string, TransactionType | ''>;
  walletSource: WalletSource;
  walletCol: string;
  walletFixed: string;
  walletMapping: Record<string, string | null>;
  categoryCol: string;
  notesCol: string;
  payerCol: string;
  labelsCol: string;
}

interface PreviewRow {
  index: number;
  date: string | null;
  type: TransactionType | null;
  amount: number | null;
  walletId: string | null;
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
    categoryCol: '', notesCol: '', payerCol: '', labelsCol: '',
  });

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
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
      setColMap(m => ({ ...m, amount: '', date: '', typeCol: '', typeMapping: {}, walletCol: '', walletMapping: {}, categoryCol: '', notesCol: '', payerCol: '', labelsCol: '' }));
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
    const mapping: Record<string, TransactionType | ''> = {};
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

  // ─── Step 2 validation ────────────────────────────────────────────────────

  function validateStep2(): string | null {
    if (!colMap.amount) return 'Select the Amount column.';
    if (!colMap.date) return 'Select the Date column.';
    if (colMap.typeSource === 'column') {
      if (!colMap.typeCol) return 'Select the Transaction Type column or choose a fixed type.';
      const missing = Object.entries(colMap.typeMapping).find(([, v]) => !v);
      if (missing) return `Map type value "${missing[0]}" to Income or Expense.`;
    }
    if (colMap.walletSource === 'column') {
      if (!colMap.walletCol) return 'Select the Wallet column or choose a fixed wallet.';
      const missing = Object.entries(colMap.walletMapping).find(([, v]) => !v);
      if (missing) return `Assign a wallet for CSV value "${missing[0]}".`;
    } else {
      if (!colMap.walletFixed) return 'Select a wallet.';
    }
    return null;
  }

  // ─── Build preview rows ───────────────────────────────────────────────────

  function buildPreview(): PreviewRow[] {
    if (!csv) return [];
    const { rows } = csv;
    const amtI = colIdx(colMap.amount);
    const datI = colIdx(colMap.date);
    const typI = colMap.typeSource === 'column' ? colIdx(colMap.typeCol) : -1;
    const walI = colMap.walletSource === 'column' ? colIdx(colMap.walletCol) : -1;
    const catI = colMap.categoryCol ? colIdx(colMap.categoryCol) : -1;
    const notI = colMap.notesCol ? colIdx(colMap.notesCol) : -1;
    const payI = colMap.payerCol ? colIdx(colMap.payerCol) : -1;
    const lblI = colMap.labelsCol ? colIdx(colMap.labelsCol) : -1;

    return rows.map((row, i) => {
      const errors: string[] = [];

      const rawAmt = amtI >= 0 ? (row[amtI] ?? '') : '';
      const parsedAmt = parseAmount(rawAmt);
      if (parsedAmt === null) errors.push('Invalid amount');

      const rawDate = datI >= 0 ? (row[datI] ?? '') : '';
      const parsedDate = parseDate(rawDate);
      if (!parsedDate) errors.push('Invalid date');

      let txType: TransactionType | null = null;
      if (colMap.typeSource === 'fixed-income') txType = 'income';
      else if (colMap.typeSource === 'fixed-expense') txType = 'expense';
      else if (typI >= 0) {
        const raw = (row[typI] ?? '').trim();
        txType = (colMap.typeMapping[raw] as TransactionType) || null;
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

      let categoryId: string | null = null;
      if (catI >= 0) {
        const raw = (row[catI] ?? '').trim();
        if (raw) {
          const match = categories.find(c => c.name.toLowerCase() === raw.toLowerCase());
          categoryId = match?.id ?? null;
        }
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

      return { index: i, date: parsedDate, type: txType, amount, walletId, categoryId, notes, payer, labelIds, errors };
    });
  }

  function goToPreview() {
    const err = validateStep2();
    if (err) { setToast({ message: err, variant: 'error' }); return; }
    setPreviewRows(buildPreview());
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

    let success = 0;
    let failed = 0;
    const BATCH = 100;
    for (let i = 0; i < valid.length; i += BATCH) {
      const slice = valid.slice(i, i + BATCH);
      const batch = slice.map(r => ({
        user_id: user.id,
        type: r.type as TransactionType,
        amount: r.amount as number,
        wallet_id: r.walletId as string,
        category_id: r.categoryId,
        date: r.date as string,
        notes: r.notes,
        payer: r.payer,
      }));
      const { data: inserted, error } = await supabase.from('transactions').insert(batch).select('id');
      if (error || !inserted) {
        failed += batch.length;
      } else {
        success += inserted.length;
        const labelLinks = inserted.flatMap((tx: { id: string }, idx: number) =>
          slice[idx].labelIds.map(lid => ({ transaction_id: tx.id, label_id: lid }))
        ).filter((link: { transaction_id: string; label_id: string }) => link.label_id);
        if (labelLinks.length > 0) {
          await supabase.from('transaction_labels').insert(labelLinks);
        }
      }
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
    setColMap(m => ({
      amount: '', date: '',
      typeSource: 'column', typeCol: '', typeMapping: {},
      walletSource: 'fixed', walletCol: '', walletFixed: m.walletFixed, walletMapping: {},
      categoryCol: '', notesCol: '', payerCol: '', labelsCol: '',
    }));
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const headers = csv?.headers ?? [];

  const colOptions = headers.map(h => ({ value: h, label: h }));
  const colOptionsWithBlank = [{ value: '', label: '— select column —' }, ...colOptions];
  const colOptionsWithSkip = [{ value: '', label: 'Skip' }, ...colOptions];

  const validCount = previewRows.filter(r => r.errors.length === 0).length;
  const skippedCount = previewRows.length - validCount;

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
              <span className={styles.stepBubble}>
                {step > i + 1 ? '✓' : i + 1}
              </span>
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className={styles.hiddenInput}
              onChange={onFileInput}
            />
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
                  <thead>
                    <tr>{csv.headers.map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                      </tr>
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
                    onChange={(opt) => setColMap(m => ({ ...m, amount: opt?.value ?? '' }))}
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.amount && (
                  <span className={styles.sample}>{sampleValue(colMap.amount)}</span>
                )}
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
                    onChange={(opt) => setColMap(m => ({ ...m, date: opt?.value ?? '' }))}
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.date && (
                  <span className={styles.sample}>{sampleValue(colMap.date)}</span>
                )}
              </div>
            </div>

            {/* Transaction Type */}
            <div className={styles.mapRow}>
              <span className={styles.fieldName}><span className={styles.req}>*</span>Type</span>
              <div className={styles.mapControls}>
                {(() => {
                  const typeSourceOptions = [
                    { value: 'column', label: 'From column…' },
                    { value: 'fixed-income', label: 'All Income' },
                    { value: 'fixed-expense', label: 'All Expense' },
                  ];
                  const currentTypeSource = colMap.typeSource === 'column' ? 'column' : colMap.typeSource;
                  return (
                    <div style={{ minWidth: 200 }}>
                      <ReactSelect<{ value: string; label: string }>
                        options={typeSourceOptions}
                        value={typeSourceOptions.find(o => o.value === currentTypeSource) ?? typeSourceOptions[0]}
                        onChange={(opt) => {
                          const v = (opt?.value ?? 'column') as TypeSource;
                          if (v === 'column') setColMap(m => ({ ...m, typeSource: 'column' }));
                          else setColMap(m => ({ ...m, typeSource: v, typeMapping: {} }));
                        }}
                        isSearchable={false}
                        styles={makeRsStyles('sm')}
                        theme={rsTheme}
                        menuPosition="fixed"
                      />
                    </div>
                  );
                })()}
                {colMap.typeSource === 'column' && (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={colOptionsWithBlank}
                      value={colOptionsWithBlank.find(o => o.value === colMap.typeCol) ?? colOptionsWithBlank[0]}
                      onChange={(opt) => onTypeColChange(opt?.value ?? '')}
                      isSearchable={false}
                      styles={makeRsStyles('sm')}
                      theme={rsTheme}
                      menuPosition="fixed"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Type value mapping */}
            {colMap.typeSource === 'column' && colMap.typeCol && Object.keys(colMap.typeMapping).length > 0 && (
              <div className={styles.valueMapBlock}>
                <p className={styles.valueMapTitle}>Assign each value to Income or Expense:</p>
                {Object.entries(colMap.typeMapping).map(([val, mapped]) => {
                  const typeMappingOpts = [
                    { value: '', label: '— assign —' },
                    { value: 'income', label: 'Income' },
                    { value: 'expense', label: 'Expense' },
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
                            typeMapping: { ...m.typeMapping, [val]: (opt?.value ?? '') as TransactionType | '' },
                          }))}
                          isSearchable={false}
                          styles={makeRsStyles('sm')}
                          theme={rsTheme}
                          menuPosition="fixed"
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
                    options={[
                      { value: 'fixed', label: 'Fixed wallet' },
                      { value: 'column', label: 'From column…' },
                    ]}
                    value={colMap.walletSource === 'fixed'
                      ? { value: 'fixed', label: 'Fixed wallet' }
                      : { value: 'column', label: 'From column…' }}
                    onChange={opt => setColMap(m => ({ ...m, walletSource: (opt?.value ?? 'fixed') as WalletSource }))}
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.walletSource === 'fixed' ? (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={[{ value: '', label: '— select wallet —' }, ...wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name}` }))]}
                      value={wallets.find(w => w.id === colMap.walletFixed)
                        ? { value: colMap.walletFixed, label: `${wallets.find(w => w.id === colMap.walletFixed)!.icon} ${wallets.find(w => w.id === colMap.walletFixed)!.name}` }
                        : { value: '', label: '— select wallet —' }}
                      onChange={opt => setColMap(m => ({ ...m, walletFixed: opt?.value ?? '' }))}
                      isSearchable={false}
                      styles={makeRsStyles('sm')}
                      theme={rsTheme}
                      menuPosition="fixed"
                    />
                  </div>
                ) : (
                  <div style={{ minWidth: 200 }}>
                    <ReactSelect<{ value: string; label: string }>
                      options={colOptionsWithBlank}
                      value={colOptionsWithBlank.find(o => o.value === colMap.walletCol) ?? colOptionsWithBlank[0]}
                      onChange={opt => onWalletColChange(opt?.value ?? '')}
                      isSearchable={false}
                      styles={makeRsStyles('sm')}
                      theme={rsTheme}
                      menuPosition="fixed"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Wallet value mapping */}
            {colMap.walletSource === 'column' && colMap.walletCol && Object.keys(colMap.walletMapping).length > 0 && (
              <div className={styles.valueMapBlock}>
                <p className={styles.valueMapTitle}>Match each wallet name to one of your wallets:</p>
                {Object.entries(colMap.walletMapping).map(([val, wId]) => {
                  const walletOpts = [{ value: '', label: '— select wallet —' }, ...wallets.map(w => ({ value: w.id, label: `${w.icon} ${w.name}` }))];
                  return (
                    <div key={val} className={styles.valueMapRow}>
                      <span className={styles.csvVal}>&ldquo;{val}&rdquo;</span>
                      <span className={styles.arrow}>→</span>
                      <div style={{ minWidth: 200 }}>
                        <ReactSelect<{ value: string; label: string }>
                          options={walletOpts}
                          value={walletOpts.find(o => o.value === (wId ?? '')) ?? walletOpts[0]}
                          onChange={opt => setColMap(m => ({
                            ...m,
                            walletMapping: { ...m.walletMapping, [val]: opt?.value || null },
                          }))}
                          isSearchable={false}
                          styles={makeRsStyles('sm')}
                          theme={rsTheme}
                          menuPosition="fixed"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
                    onChange={opt => setColMap(m => ({ ...m, categoryCol: opt?.value ?? '' }))}
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.categoryCol && (
                  <span className={styles.sample}>{sampleValue(colMap.categoryCol)}</span>
                )}
              </div>
            </div>
            {colMap.categoryCol && (
              <p className={styles.fieldHint}>
                Category names are matched by name to your existing categories. Unrecognised names are imported without a category.
              </p>
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
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.notesCol && (
                  <span className={styles.sample}>{sampleValue(colMap.notesCol)}</span>
                )}
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
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.payerCol && (
                  <span className={styles.sample}>{sampleValue(colMap.payerCol)}</span>
                )}
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
                    isSearchable={false}
                    styles={makeRsStyles('sm')}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                </div>
                {colMap.labelsCol && (
                  <span className={styles.sample}>{sampleValue(colMap.labelsCol)}</span>
                )}
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
              <div className={styles.importStats}>
                <div className={styles.stat}>
                  <span className={styles.statNum}>{validCount}</span>
                  <span className={styles.statLabel}>ready to import</span>
                </div>
                {skippedCount > 0 && (
                  <div className={[styles.stat, styles.statWarn].join(' ')}>
                    <span className={styles.statNum}>{skippedCount}</span>
                    <span className={styles.statLabel}>will be skipped</span>
                  </div>
                )}
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
                      <th>Category</th>
                      <th>Notes</th>
                      <th>Labels</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 100).map(row => {
                      const wallet = wallets.find(w => w.id === row.walletId);
                      const category = categories.find(c => c.id === row.categoryId);
                      const bad = row.errors.length > 0;
                      return (
                        <tr key={row.index} className={bad ? styles.rowError : ''}>
                          <td className={styles.rowNum}>{row.index + 1}</td>
                          <td>{row.date ?? <span className={styles.missing}>–</span>}</td>
                          <td>
                            {row.type ? (
                              <span className={row.type === 'income' ? styles.tagIncome : styles.tagExpense}>
                                {row.type}
                              </span>
                            ) : <span className={styles.missing}>–</span>}
                          </td>
                          <td className={row.type === 'expense' ? styles.amtExpense : styles.amtIncome}>
                            {row.amount !== null
                              ? (row.type === 'expense' ? '−' : '+') + row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : <span className={styles.missing}>–</span>}
                          </td>
                          <td>{wallet ? `${wallet.icon} ${wallet.name}` : <span className={styles.missing}>–</span>}</td>
                          <td>{category?.name ?? <span className={styles.muted}>none</span>}</td>
                          <td className={styles.noteCol}>{row.notes ?? ''}</td>
                          <td className={styles.labelCol}>
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
                            {bad
                              ? <span className={styles.statusErr} title={row.errors.join(' · ')}>✕ {row.errors[0]}</span>
                              : <span className={styles.statusOk}>✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {previewRows.length > 100 && (
                <p className={styles.truncNote}>Showing first 100 of {previewRows.length} rows.</p>
              )}

              <div className={styles.actions}>
                <Button variant="secondary" size="md" onClick={() => setStep(2)} disabled={importing}>← Back</Button>
                <Button
                  variant="primary"
                  size="md"
                  loading={importing}
                  disabled={validCount === 0 || importing}
                  onClick={handleImport}
                >
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
