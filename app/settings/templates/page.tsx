'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import SearchableSelect, { SelectOption } from '@/components/ui/SearchableSelect';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import type { Template, Category, Label, Wallet, TransactionType } from '@/lib/types';
import styles from './page.module.css';

type RawTemplateLabel = { label: Label | null };
type RawTemplate = Omit<Template, 'labels'> & {
  wallet: Wallet | null;
  category: Category | null;
  labels: RawTemplateLabel[];
};

interface TemplateFormFields {
  name: string;
  type: TransactionType;
  walletId: string;
  amount: string;
  categoryId: string;
  labelIds: string[];
  payer: string;
  notes: string;
}

const EMPTY_FORM: TemplateFormFields = {
  name: '', type: 'expense', walletId: '', amount: '',
  categoryId: '', labelIds: [], payer: '', notes: '',
};

export default function TemplatesSettingsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState<TemplateFormFields>(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormFields>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [tplRes, walletRes, catRes, lblRes] = await Promise.all([
      supabase.from('templates').select(`*, wallet:wallets(*), category:categories(*), labels:template_labels(label:labels(*))`).eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
    ]);
    if (tplRes.data) {
      setTemplates((tplRes.data as RawTemplate[]).map(t => ({
        ...t,
        labels: t.labels.map(l => l.label).filter((l): l is Label => l !== null),
      })));
    }
    if (walletRes.data) setWallets(walletRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const categoryOptions: SelectOption[] = [];
  const parentCategories = categories.filter(c => !c.parent_id);
  const childCategories = categories.filter(c => c.parent_id);
  for (const parent of parentCategories) {
    const children = childCategories.filter(c => c.parent_id === parent.id);
    if (children.length > 0) {
      for (const child of children) {
        categoryOptions.push({ value: child.id, label: `${child.icon} ${child.name}`, group: `${parent.icon} ${parent.name}` });
      }
    } else {
      categoryOptions.push({ value: parent.id, label: `${parent.icon} ${parent.name}` });
    }
  }

  function handleOpenAdd() {
    const defaultWallet = wallets.find(w => w.is_default) ?? wallets[0];
    setAddForm({ ...EMPTY_FORM, walletId: defaultWallet?.id ?? '' });
    setAddError('');
    setShowAddDialog(true);
  }

  function handleCloseAdd() {
    setShowAddDialog(false); setAddForm(EMPTY_FORM); setAddError('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!addForm.name.trim()) { setAddError('Name is required.'); return; }
    const parsedAmount = Number(addForm.amount);
    if (!addForm.amount || isNaN(parsedAmount) || parsedAmount <= 0) { setAddError('Please enter a valid amount.'); return; }
    if (!addForm.walletId) { setAddError('Please select a wallet.'); return; }
    setAddSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAddSaving(false); return; }
    const { data: inserted, error } = await supabase.from('templates').insert({
      user_id: user.id, name: addForm.name.trim(), type: addForm.type,
      wallet_id: addForm.walletId, amount: parsedAmount,
      category_id: addForm.categoryId || null,
      payer: addForm.payer.trim() || null, notes: addForm.notes.trim() || null,
    }).select().single();
    if (error || !inserted) { setAddError(error?.message ?? 'Something went wrong.'); setAddSaving(false); return; }
    if (addForm.labelIds.length > 0) {
      await supabase.from('template_labels').insert(addForm.labelIds.map(lid => ({ template_id: inserted.id, label_id: lid })));
    }
    setAddSaving(false);
    handleCloseAdd();
    setToast({ message: 'Template created.', variant: 'success' });
    await fetchAll();
  }

  function handleOpenEdit(tpl: Template) {
    setEditForm({ name: tpl.name, type: tpl.type, walletId: tpl.wallet_id ?? '', amount: String(tpl.amount), categoryId: tpl.category_id ?? '', labelIds: tpl.labels?.map(l => l.id) ?? [], payer: tpl.payer ?? '', notes: tpl.notes ?? '' });
    setEditError('');
    setEditingTemplate(tpl);
  }

  function handleCloseEdit() {
    setEditingTemplate(null); setEditForm(EMPTY_FORM); setEditError('');
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTemplate) return;
    setEditError('');
    if (!editForm.name.trim()) { setEditError('Name is required.'); return; }
    const parsedAmount = Number(editForm.amount);
    if (!editForm.amount || isNaN(parsedAmount) || parsedAmount <= 0) { setEditError('Please enter a valid amount.'); return; }
    if (!editForm.walletId) { setEditError('Please select a wallet.'); return; }
    setEditSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('templates').update({
      name: editForm.name.trim(), type: editForm.type, wallet_id: editForm.walletId,
      amount: parsedAmount, category_id: editForm.categoryId || null,
      payer: editForm.payer.trim() || null, notes: editForm.notes.trim() || null,
    }).eq('id', editingTemplate.id);
    if (error) { setEditError(error.message); setEditSaving(false); return; }
    await supabase.from('template_labels').delete().eq('template_id', editingTemplate.id);
    if (editForm.labelIds.length > 0) {
      await supabase.from('template_labels').insert(editForm.labelIds.map(lid => ({ template_id: editingTemplate.id, label_id: lid })));
    }
    setEditSaving(false);
    handleCloseEdit();
    setToast({ message: 'Template updated.', variant: 'success' });
    await fetchAll();
  }

  async function handleDelete() {
    if (!deletingTemplate) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('templates').delete().eq('id', deletingTemplate.id);
    setDeleteLoading(false); setDeletingTemplate(null);
    if (error) { setToast({ message: 'Failed to delete template.', variant: 'error' }); }
    else { setToast({ message: 'Template deleted.', variant: 'success' }); await fetchAll(); }
  }

  function toggleLabel(form: TemplateFormFields, id: string): TemplateFormFields {
    return { ...form, labelIds: form.labelIds.includes(id) ? form.labelIds.filter(l => l !== id) : [...form.labelIds, id] };
  }

  function renderForm(form: TemplateFormFields, setForm: (f: TemplateFormFields) => void, onSubmit: (e: React.FormEvent) => void, saving: boolean, error: string, onClose: () => void, submitLabel: string) {
    const selectedWallet = wallets.find(w => w.id === form.walletId);
    return (
      <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-name" required>Template name</FormLabel>
          <Input id="tpl-name" type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly salary" required autoFocus />
        </div>
        <div className={styles.field}>
          <FormLabel>Type</FormLabel>
          <div className={styles.typeTabs}>
            <button type="button" className={[styles.typeTab, form.type === 'expense' ? styles.typeTabExpenseActive : ''].filter(Boolean).join(' ')} onClick={() => setForm({ ...form, type: 'expense' })}>Expense</button>
            <button type="button" className={[styles.typeTab, form.type === 'income' ? styles.typeTabIncomeActive : ''].filter(Boolean).join(' ')} onClick={() => setForm({ ...form, type: 'income' })}>Income</button>
          </div>
        </div>
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-wallet" required>Account</FormLabel>
          <select id="tpl-wallet" className={styles.select} value={form.walletId} onChange={e => setForm({ ...form, walletId: e.target.value })} required>
            <option value="">Select wallet…</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name} ({w.currency})</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-amount" required>Amount</FormLabel>
          <div className={styles.amountRow}>
            <NumberInput id="tpl-amount" value={form.amount} onChange={v => setForm({ ...form, amount: v })} placeholder="0" required />
            <span className={styles.currencyBadge}>{selectedWallet?.currency ?? ''}</span>
          </div>
        </div>
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-category">Category</FormLabel>
          <SearchableSelect id="tpl-category" options={categoryOptions} value={form.categoryId} onChange={v => setForm({ ...form, categoryId: v })} placeholder="Choose category" />
        </div>
        {labels.length > 0 && (
          <div className={styles.field}>
            <FormLabel>Labels</FormLabel>
            <div className={styles.labelChips}>
              {labels.map(label => {
                const selected = form.labelIds.includes(label.id);
                return (
                  <button key={label.id} type="button" className={[styles.labelChip, selected ? styles.labelChipSelected : ''].filter(Boolean).join(' ')} onClick={() => setForm(toggleLabel(form, label.id))}>
                    <span className={styles.labelDot} style={{ backgroundColor: label.color }} />
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-payer">Payer</FormLabel>
          <Input id="tpl-payer" type="text" value={form.payer} onChange={e => setForm({ ...form, payer: e.target.value })} placeholder="Who pays?" />
        </div>
        <div className={styles.field}>
          <FormLabel htmlFor="tpl-notes">Note</FormLabel>
          <textarea id="tpl-notes" className={styles.textarea} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Optional note" />
        </div>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.dialogActions}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="md" loading={saving}>{submitLabel}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Templates</h1>
          <p className={styles.pageSubtitle}>Save recurring records and apply them with one click when adding a transaction.</p>
        </div>
        <Button variant="primary" size="md" onClick={handleOpenAdd}>+ Add template</Button>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your templates</h2>
        {loading ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : templates.length === 0 ? (
          <p className={styles.emptyState}>No templates yet. Click &quot;+ Add template&quot; to create one.</p>
        ) : (
          <div className={styles.list}>
            {templates.map(tpl => {
              const wallet = tpl.wallet;
              return (
                <div key={tpl.id} className={styles.templateItem}>
                  <div className={styles.templateIcon} style={{ backgroundColor: (tpl.category?.color ?? '#94a3b8') + '22' }}>
                    {tpl.category?.icon ?? (tpl.type === 'income' ? '💰' : '💸')}
                  </div>
                  <div className={styles.templateInfo}>
                    <span className={styles.templateName}>{tpl.name}</span>
                    <div className={styles.templateMeta}>
                      <span className={[styles.typeBadge, tpl.type === 'expense' ? styles.typeBadgeExpense : styles.typeBadgeIncome].join(' ')}>{tpl.type}</span>
                      <span className={styles.templateAmount}>{wallet ? formatCurrency(tpl.amount, wallet.currency) : String(tpl.amount)}</span>
                      {wallet && <span>{wallet.icon} {wallet.name}</span>}
                      {tpl.category && <span>· {tpl.category.icon} {tpl.category.name}</span>}
                      {tpl.labels && tpl.labels.length > 0 && <span>· {tpl.labels.map(l => l.name).join(', ')}</span>}
                    </div>
                  </div>
                  <div className={styles.templateActions}>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(tpl)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setDeletingTemplate(tpl)}>Delete</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {showAddDialog && (
        <Dialog title="Add template" onClose={handleCloseAdd}>
          {renderForm(addForm, setAddForm, handleAdd, addSaving, addError, handleCloseAdd, 'Add template')}
        </Dialog>
      )}

      {editingTemplate && (
        <Dialog title={`Edit "${editingTemplate.name}"`} onClose={handleCloseEdit}>
          {renderForm(editForm, setEditForm, handleEditSave, editSaving, editError, handleCloseEdit, 'Save changes')}
        </Dialog>
      )}

      {deletingTemplate && (
        <ConfirmDialog
          title="Delete template"
          message={`Delete "${deletingTemplate.name}"? This won't affect any past transactions.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingTemplate(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
