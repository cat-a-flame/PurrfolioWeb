'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';
import LabelCard from '@/components/labels/LabelCard';
import LabelEditorModal, { type LabelDraft } from '@/components/labels/LabelEditorModal';
import Skeleton from '@/components/ui/Skeleton';
import { createClient } from '@/lib/supabase/client';
import type { Label } from '@/lib/types';
import styles from './page.module.css';
import labelCardStyles from '@/components/labels/LabelCard.module.css';

type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; label: Label };

const DEFAULT_COLOR = '#6366f1';

export default function LabelsSettingsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchLabels = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('labels').select('*').eq('user_id', user.id).order('name');
    if (data) setLabels(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  function openCreate() { setModal({ mode: 'create' }); }
  function openEdit(label: Label) { setModal({ mode: 'edit', label }); }
  function closeModal() { setModal(null); }

  async function handleSave(draft: LabelDraft) {
    if (!modal) return;
    const supabase = createClient();
    const name = draft.name.trim() || 'Untitled';
    setSaving(true);

    if (modal.mode === 'create') {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { error } = await supabase.from('labels').insert({ user_id: user.id, name, color: draft.color });

      setSaving(false);
      if (error) {
        setToast({ message: 'Failed to create label.', variant: 'error' });
        return;
      }
      setModal(null);
      setToast({ message: 'Label created', variant: 'success' });
      fetchLabels();
      return;
    }

    const { error } = await supabase.from('labels')
      .update({ name, color: draft.color })
      .eq('id', modal.label.id);

    setSaving(false);
    if (error) {
      setToast({ message: 'Failed to save label.', variant: 'error' });
      return;
    }
    setModal(null);
    setToast({ message: 'Changes saved', variant: 'success' });
    fetchLabels();
  }

  function requestDelete() {
    if (modal?.mode !== 'edit') return;
    setConfirmDelete({ id: modal.label.id, name: modal.label.name });
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('labels').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setToast({ message: 'Failed to delete label.', variant: 'error' });
    } else {
      setModal(null);
      setToast({ message: 'Label deleted', variant: 'success' });
      fetchLabels();
    }
  }

  const draftInitial: LabelDraft | null = !modal ? null : modal.mode === 'create'
    ? { name: '', color: DEFAULT_COLOR }
    : { name: modal.label.name, color: modal.label.color };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Tag your transactions</div>
          <h1 className={styles.title}>Labels</h1>
        </div>
        <Button variant="primary" size="lg" onClick={openCreate}>+ New label</Button>
      </div>

      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={labelCardStyles.card}>
              <div className={labelCardStyles.head}>
                <Skeleton width={14} height={14} radius="50%" />
                <Skeleton width="60%" height={15} radius={4} />
              </div>
            </div>
          ))}
        </div>
      ) : labels.length === 0 ? (
        <p className={styles.emptyState}>No labels yet.</p>
      ) : (
        <div className={styles.grid}>
          {labels.map((l) => (
            <LabelCard key={l.id} label={l} onEdit={openEdit} />
          ))}
        </div>
      )}

      {modal && draftInitial && (
        <LabelEditorModal
          mode={modal.mode}
          initial={draftInitial}
          canDelete={modal.mode === 'edit'}
          saving={saving}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={requestDelete}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          message="It will be removed from all transactions."
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          loading={deleting}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
