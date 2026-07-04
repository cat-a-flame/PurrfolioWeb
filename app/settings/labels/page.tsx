'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { Label } from '@/lib/types';
import styles from './page.module.css';

export default function LabelsSettingsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  function handleCloseAdd() {
    setShowAddDialog(false);
    setName(''); setColor('#6366f1'); setFormError('');
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('labels').insert({ user_id: user.id, name: name.trim(), color });
    setSaving(false);
    if (error) { setFormError(error.message); } else {
      handleCloseAdd();
      setToast({ message: 'Label added.', variant: 'success' });
      await fetchLabels();
    }
  }

  function startEdit(label: Label) {
    setEditingLabel(label); setEditName(label.name); setEditColor(label.color); setEditError('');
  }

  function handleCloseEdit() {
    setEditingLabel(null); setEditError('');
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLabel) return;
    setEditError('');
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('labels').update({ name: editName.trim(), color: editColor }).eq('id', editingLabel.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); } else {
      handleCloseEdit();
      setToast({ message: 'Label updated.', variant: 'success' });
      await fetchLabels();
    }
  }

  async function handleDelete() {
    if (!deletingLabel) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('labels').delete().eq('id', deletingLabel.id);
    setDeleteLoading(false); setDeletingLabel(null);
    if (error) { setToast({ message: 'Failed to delete label.', variant: 'error' }); }
    else { setToast({ message: 'Label deleted.', variant: 'success' }); await fetchLabels(); }
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Labels</h1>
        <Button variant="primary" size="lg" onClick={() => setShowAddDialog(true)}>+ Add label</Button>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your labels</h2>
        {loading ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : labels.length === 0 ? (
          <p className={styles.emptyState}>No labels yet.</p>
        ) : (
          <div className={styles.list}>
            {labels.map(label => (
              <div key={label.id} className={styles.labelRow}>
                <span className={styles.labelChip}>
                  <span className={styles.labelDot} style={{ backgroundColor: label.color }} />
                  {label.name}
                </span>
                <div className={styles.labelActions}>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(label)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showAddDialog && (
        <Dialog title="Add label" onClose={handleCloseAdd}>
          <form onSubmit={handleAdd} className={styles.form}>
            <div className={styles.field}>
              <FormLabel htmlFor="label-name" required>Name</FormLabel>
              <Input id="label-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Recurring" required autoFocus />
            </div>
            <div className={styles.twoCol}>
              <div className={styles.field}>
                <FormLabel htmlFor="label-color">Color</FormLabel>
                <input id="label-color" type="color" className={styles.colorPicker} value={color} onChange={e => setColor(e.target.value)} />
              </div>
              <div className={styles.field}>
                <FormLabel>Preview</FormLabel>
                <span className={styles.labelChip}>
                  <span className={styles.labelDot} style={{ backgroundColor: color }} />
                  {name || 'Label'}
                </span>
              </div>
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" type="button" onClick={handleCloseAdd}>Cancel</Button>
              <Button type="submit" variant="primary" size="md" loading={saving}>Add label</Button>
            </div>
          </form>
        </Dialog>
      )}

      {editingLabel && (
        <Dialog title="Edit label" onClose={handleCloseEdit}>
          <form onSubmit={handleEditSave} className={styles.form}>
            <div className={styles.field}>
              <FormLabel htmlFor="edit-label-name" required>Name</FormLabel>
              <Input id="edit-label-name" type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Recurring" required autoFocus />
            </div>
            <div className={styles.field}>
              <FormLabel htmlFor="edit-label-color">Color</FormLabel>
              <input id="edit-label-color" type="color" className={styles.colorPicker} value={editColor} onChange={e => setEditColor(e.target.value)} />
            </div>
            {editError && <p className={styles.formError}>{editError}</p>}
            <div className={styles.dialogActions}>
              <Button variant="danger" size="md" type="button" style={{ marginRight: 'auto' }} onClick={() => { setDeletingLabel(editingLabel); handleCloseEdit(); }}>Delete</Button>
              <Button variant="secondary" size="md" type="button" onClick={handleCloseEdit}>Cancel</Button>
              <Button type="submit" variant="primary" size="md" loading={editSaving}>Save</Button>
            </div>
          </form>
        </Dialog>
      )}

      {deletingLabel && (
        <ConfirmDialog
          title="Delete label"
          message={`Delete label "${deletingLabel.name}"? It will be removed from all transactions.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingLabel(null)}
          loading={deleteLoading}
        />
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />}
    </div>
  );
}
