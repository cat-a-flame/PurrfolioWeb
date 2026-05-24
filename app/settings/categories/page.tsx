'use client';

import React, { useEffect, useState, useCallback } from 'react';
import ReactSelect from 'react-select';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import { createClient } from '@/lib/supabase/client';
import type { Category } from '@/lib/types';
import styles from './page.module.css';

interface EditFields {
  name: string;
  icon: string;
  color: string;
  parent_id: string;
}

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({ name: '', icon: '', color: '#f26e4d', parent_id: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchCategories = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
    if (data) setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleCloseAdd() {
    setShowAddDialog(false);
    setName(''); setIcon(''); setColor('#f26e4d'); setParentId('');
    setFormError('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const effectiveColor = parentId
      ? (categories.find(c => c.id === parentId)?.color ?? color)
      : color;
    const { error } = await supabase.from('categories').insert({
      user_id: user.id, name: name.trim(), type: 'both',
      icon: icon.trim() || '📁', color: effectiveColor, is_default: false,
      parent_id: parentId || null,
    });
    setSaving(false);
    if (error) { setFormError(error.message); } else {
      handleCloseAdd();
      setToast({ message: 'Category added.', variant: 'success' });
      await fetchCategories();
    }
  }

  function startEdit(cat: Category) {
    setEditingCategory(cat);
    setEditFields({ name: cat.name, icon: cat.icon, color: cat.color, parent_id: cat.parent_id ?? '' });
    setEditError('');
  }

  function handleCloseEdit() {
    setEditingCategory(null); setEditError('');
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    setEditError('');
    if (!editFields.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    const supabase = createClient();
    const parentId = editFields.parent_id || editingCategory.parent_id || null;
    const effectiveColor = parentId
      ? (categories.find(c => c.id === parentId)?.color ?? editFields.color)
      : editFields.color;
    const { error } = await supabase.from('categories').update({
      name: editFields.name.trim(), icon: editFields.icon.trim() || '📁',
      color: effectiveColor, parent_id: editFields.parent_id || null,
    }).eq('id', editingCategory.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); } else {
      handleCloseEdit();
      setToast({ message: 'Category updated.', variant: 'success' });
      await fetchCategories();
    }
  }

  async function handleDelete() {
    if (!deletingCategory) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('categories').delete().eq('id', deletingCategory.id);
    setDeleteLoading(false);
    setDeletingCategory(null);
    if (error) { setToast({ message: 'Failed to delete category.', variant: 'error' }); }
    else { setToast({ message: 'Category deleted.', variant: 'success' }); await fetchCategories(); }
  }

  const topLevel = categories.filter(c => !c.parent_id);
  const getChildren = (pid: string) => categories.filter(c => c.parent_id === pid);

  function renderChildRow(cat: Category) {
    const parentColor = categories.find(c => c.id === cat.parent_id)?.color ?? cat.color;
    return (
      <div key={cat.id} className={[styles.catItem, styles.catItemChild].join(' ')}>
        <span className={styles.childIndent}>↳</span>
        <div className={styles.catIcon} style={{ backgroundColor: parentColor + '22' }}><span>{cat.icon || '📁'}</span></div>
        <span className={styles.catName}>{cat.name}</span>
        <div className={styles.catActions}>
          <Button variant="ghost" size="sm" onClick={() => startEdit(cat)}>Edit</Button>
          {!cat.is_default && <Button variant="danger" size="sm" onClick={() => setDeletingCategory(cat)}>Delete</Button>}
        </div>
      </div>
    );
  }

  function renderParentRow(cat: Category) {
    const children = getChildren(cat.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(cat.id);
    return (
      <div key={cat.id} className={styles.parentGroup}>
        <div className={styles.catItem}>
          <button
            type="button"
            className={[styles.expandBtn, hasChildren ? '' : styles.expandBtnHidden].filter(Boolean).join(' ')}
            onClick={() => hasChildren && toggleExpand(cat.id)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
          <div className={styles.catIcon} style={{ backgroundColor: cat.color + '22' }}><span>{cat.icon || '📁'}</span></div>
          <span className={styles.catName}>
            {cat.name}
            {hasChildren && <span className={styles.childCount}>{children.length}</span>}
          </span>
          <div className={styles.catActions}>
            <Button variant="ghost" size="sm" onClick={() => startEdit(cat)}>Edit</Button>
            {!cat.is_default && <Button variant="danger" size="sm" onClick={() => setDeletingCategory(cat)}>Delete</Button>}
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className={styles.childList}>{children.map(child => renderChildRow(child))}</div>
        )}
      </div>
    );
  }

  const isEditingChild = editingCategory?.parent_id != null && editingCategory.parent_id !== '';

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Categories</h1>
        <Button variant="primary" size="md" onClick={() => setShowAddDialog(true)}>+ Add category</Button>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your categories</h2>
        {loading ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : categories.length === 0 ? (
          <p className={styles.emptyState}>No categories yet.</p>
        ) : (
          <div className={styles.list}>{topLevel.map(cat => renderParentRow(cat))}</div>
        )}
      </section>

      {showAddDialog && (
        <Dialog title="Add category" onClose={handleCloseAdd}>
          <form onSubmit={handleAdd} className={styles.form}>
            <div className={styles.field}>
              <FormLabel htmlFor="cat-name" required>Name</FormLabel>
              <Input id="cat-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Groceries" required autoFocus />
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <FormLabel htmlFor="cat-icon">Icon (emoji)</FormLabel>
                <Input id="cat-icon" type="text" value={icon} onChange={e => setIcon(e.target.value)} placeholder="📁" maxLength={4} />
              </div>
              {!parentId && (
                <div className={styles.field}>
                  <FormLabel htmlFor="cat-color">Color</FormLabel>
                  <input id="cat-color" type="color" className={styles.colorPicker} value={color} onChange={e => setColor(e.target.value)} />
                </div>
              )}
            </div>
            <div className={styles.field}>
              <FormLabel htmlFor="cat-parent">Parent category</FormLabel>
              {(() => {
                const addParentOptions = [
                  { value: '', label: '— Top level —' },
                  ...categories.filter(c => !c.parent_id).map(c => ({ value: c.id, label: `${c.icon} ${c.name}` })),
                ];
                return (
                  <ReactSelect<{ value: string; label: string }>
                    inputId="cat-parent"
                    options={addParentOptions}
                    value={addParentOptions.find(o => o.value === parentId) ?? addParentOptions[0]}
                    onChange={(opt) => setParentId(opt?.value ?? '')}
                    isSearchable
                    styles={makeRsStyles<{ value: string; label: string }>()}
                    theme={rsTheme}
                    menuPosition="fixed"
                  />
                );
              })()}
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" type="button" onClick={handleCloseAdd}>Cancel</Button>
              <Button type="submit" variant="primary" size="md" loading={saving}>Add category</Button>
            </div>
          </form>
        </Dialog>
      )}

      {editingCategory && (
        <Dialog title="Edit category" onClose={handleCloseEdit}>
          <form onSubmit={handleEditSave} className={styles.form}>
            <div className={styles.field}>
              <FormLabel htmlFor="ecat-name" required>Name</FormLabel>
              <Input id="ecat-name" type="text" value={editFields.name} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Groceries" required autoFocus />
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <FormLabel htmlFor="ecat-icon">Icon (emoji)</FormLabel>
                <Input id="ecat-icon" type="text" value={editFields.icon} onChange={e => setEditFields(f => ({ ...f, icon: e.target.value }))} placeholder="📁" maxLength={4} />
              </div>
              {!isEditingChild && (
                <div className={styles.field}>
                  <FormLabel htmlFor="ecat-color">Color</FormLabel>
                  <input id="ecat-color" type="color" className={styles.colorPicker} value={editFields.color} onChange={e => setEditFields(f => ({ ...f, color: e.target.value }))} />
                </div>
              )}
            </div>
            {!isEditingChild && (
              <div className={styles.field}>
                <FormLabel htmlFor="ecat-parent">Parent category</FormLabel>
                {(() => {
                  const parentOptions = [
                    { value: '', label: '— Top level —' },
                    ...categories.filter(c => !c.parent_id && c.id !== editingCategory.id).map(c => ({ value: c.id, label: `${c.icon} ${c.name}` })),
                  ];
                  return (
                    <ReactSelect<{ value: string; label: string }>
                      inputId="ecat-parent"
                      options={parentOptions}
                      value={parentOptions.find(o => o.value === editFields.parent_id) ?? parentOptions[0]}
                      onChange={(opt) => setEditFields(f => ({ ...f, parent_id: opt?.value ?? '' }))}
                      isSearchable
                      styles={makeRsStyles<{ value: string; label: string }>()}
                      theme={rsTheme}
                      menuPosition="fixed"
                    />
                  );
                })()}
              </div>
            )}
            {editError && <p className={styles.formError}>{editError}</p>}
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" type="button" onClick={handleCloseEdit}>Cancel</Button>
              <Button type="submit" variant="primary" size="md" loading={editSaving}>Save</Button>
            </div>
          </form>
        </Dialog>
      )}

      {deletingCategory && (
        <ConfirmDialog
          title="Delete category"
          message={`Delete "${deletingCategory.name}"? Transactions using this category will become uncategorised.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingCategory(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
