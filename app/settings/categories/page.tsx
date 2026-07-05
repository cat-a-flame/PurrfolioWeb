'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import CategoryCard from '@/components/categories/CategoryCard';
import CategoryEditorModal, { type CategoryDraft } from '@/components/categories/CategoryEditorModal';
import { createClient } from '@/lib/supabase/client';
import type { Category } from '@/lib/types';
import styles from './page.module.css';

type CategoryWithChildren = Category & { children: Category[] };

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; category: CategoryWithChildren };

const DEFAULT_COLOR = '#7a5ce0';

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  const topLevel: CategoryWithChildren[] = categories
    .filter((c) => !c.parent_id)
    .map((c) => ({ ...c, children: categories.filter((x) => x.parent_id === c.id) }));

  function openCreate() { setModal({ mode: 'create' }); }
  function openEdit(category: CategoryWithChildren) { setModal({ mode: 'edit', category }); }
  function closeModal() { setModal(null); }

  async function handleSave(draft: CategoryDraft) {
    if (!modal) return;
    const supabase = createClient();
    const name = draft.name.trim() || 'Untitled';
    const icon = draft.icon.trim() || '📁';
    const subs = draft.subs.filter((s) => s.name.trim());
    setSaving(true);

    if (modal.mode === 'create') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: created, error } = await supabase.from('categories')
        .insert({ user_id: user.id, name, type: draft.type, icon, color: draft.color, is_default: false, parent_id: null })
        .select('id').single();

      if (error || !created) {
        setSaving(false);
        setToast({ message: 'Failed to create category.', variant: 'error' });
        return;
      }

      if (subs.length) {
        await supabase.from('categories').insert(subs.map((s) => ({
          user_id: user.id, name: s.name.trim(), type: draft.type, icon: s.icon.trim() || '📁',
          color: draft.color, is_default: false, parent_id: created.id,
        })));
      }

      setSaving(false);
      setModal(null);
      setToast({ message: 'Category created', variant: 'success' });
      fetchCategories();
      return;
    }

    const category = modal.category;
    const { error } = await supabase.from('categories')
      .update({ name, icon, color: draft.color, type: draft.type })
      .eq('id', category.id);

    if (error) {
      setSaving(false);
      setToast({ message: 'Failed to save category.', variant: 'error' });
      return;
    }

    const keptIds = new Set(subs.filter((s) => s.id).map((s) => s.id as string));
    const removedIds = category.children.map((c) => c.id).filter((id) => !keptIds.has(id));
    const toUpdate = subs.filter((s) => s.id);
    const toInsert = subs.filter((s) => !s.id);
    const { data: { user } } = await supabase.auth.getUser();

    await Promise.all([
      ...toUpdate.map((s) => supabase.from('categories')
        .update({ name: s.name.trim(), icon: s.icon.trim() || '📁', color: draft.color, type: draft.type })
        .eq('id', s.id as string)),
      ...(toInsert.length && user ? [supabase.from('categories').insert(toInsert.map((s) => ({
        user_id: user.id, name: s.name.trim(), type: draft.type, icon: s.icon.trim() || '📁',
        color: draft.color, is_default: false, parent_id: category.id,
      })))] : []),
      ...(removedIds.length ? [supabase.from('categories').delete().in('id', removedIds)] : []),
    ]);

    setSaving(false);
    setModal(null);
    setToast({ message: 'Changes saved', variant: 'success' });
    fetchCategories();
  }

  function requestDelete() {
    if (modal?.mode !== 'edit') return;
    setConfirmDelete({ id: modal.category.id, name: modal.category.name });
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from('categories').delete().eq('parent_id', confirmDelete.id);
    const { error } = await supabase.from('categories').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setToast({ message: 'Failed to delete category.', variant: 'error' });
    } else {
      setModal(null);
      setToast({ message: 'Category deleted', variant: 'success' });
      fetchCategories();
    }
  }

  const draftInitial: CategoryDraft | null = !modal ? null : modal.mode === 'create'
    ? { name: '', icon: '🙂', color: DEFAULT_COLOR, type: 'both', subs: [] }
    : {
      name: modal.category.name,
      icon: modal.category.icon,
      color: modal.category.color,
      type: modal.category.type,
      subs: modal.category.children.map((c) => ({ id: c.id, _key: c.id, icon: c.icon, name: c.name })),
    };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Organize your spending</div>
          <h1 className={styles.title}>Categories</h1>
        </div>
        <Button variant="primary" size="lg" onClick={openCreate}>+ New category</Button>
      </div>

      {loading ? (
        <p className={styles.emptyState}>Loading…</p>
      ) : topLevel.length === 0 ? (
        <p className={styles.emptyState}>No categories yet.</p>
      ) : (
        <div className={styles.grid}>
          {topLevel.map((c) => (
            <CategoryCard key={c.id} category={c} onEdit={openEdit} />
          ))}
        </div>
      )}

      {modal && draftInitial && (
        <CategoryEditorModal
          mode={modal.mode}
          initial={draftInitial}
          canDelete={modal.mode === 'edit' && !modal.category.is_default}
          saving={saving}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={requestDelete}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="This category and its subcategories will be removed. Existing transactions will become uncategorized."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleting}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
