'use client';

import { useEffect, useState, useCallback } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { Label } from '@/lib/types';
import styles from './page.module.css';

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6366f1');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete
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
    if (error) {
      setFormError(error.message);
    } else {
      setName(''); setColor('#6366f1');
      setToast({ message: 'Label added.', variant: 'success' });
      await fetchLabels();
    }
  }

  function startEdit(label: Label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setEditError('');
  }

  async function handleEditSave(label: Label) {
    setEditError('');
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('labels').update({ name: editName.trim(), color: editColor }).eq('id', label.id);
    setEditSaving(false);
    if (error) {
      setEditError(error.message);
    } else {
      setEditingId(null);
      setToast({ message: 'Label updated.', variant: 'success' });
      await fetchLabels();
    }
  }

  async function handleDelete() {
    if (!deletingLabel) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from('labels').delete().eq('id', deletingLabel.id);
    setDeleteLoading(false);
    setDeletingLabel(null);
    if (error) {
      setToast({ message: 'Failed to delete label.', variant: 'error' });
    } else {
      setToast({ message: 'Label deleted.', variant: 'success' });
      await fetchLabels();
    }
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Labels</h1>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add label</h2>
            <form onSubmit={handleAdd} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <FormLabel htmlFor="label-name" required>Name</FormLabel>
                  <Input id="label-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Recurring" required />
                </div>
                <div className={styles.field}>
                  <FormLabel htmlFor="label-color">Color</FormLabel>
                  <input id="label-color" type="color" className={styles.colorPicker} value={color} onChange={e => setColor(e.target.value)} />
                </div>
                <div className={styles.submitCol}>
                  <Button type="submit" variant="primary" size="md" loading={saving}>Add</Button>
                </div>
              </div>
              {formError && <p className={styles.formError}>{formError}</p>}
            </form>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your labels</h2>
            {loading ? (
              <p className={styles.emptyState}>Loading…</p>
            ) : labels.length === 0 ? (
              <p className={styles.emptyState}>No labels yet.</p>
            ) : (
              <div className={styles.list}>
                {labels.map(label => {
                  if (editingId === label.id) {
                    return (
                      <div key={label.id} className={styles.labelRow}>
                        <Input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Name"
                        />
                        <input
                          type="color"
                          className={styles.colorPicker}
                          value={editColor}
                          onChange={e => setEditColor(e.target.value)}
                          style={{ width: 52, flexShrink: 0 }}
                        />
                        <span className={styles.labelChip}>
                          <span className={styles.labelDot} style={{ backgroundColor: editColor }} />
                          {editName || 'Preview'}
                        </span>
                        {editError && <p className={styles.formError}>{editError}</p>}
                        <Button variant="primary" size="sm" onClick={() => handleEditSave(label)} loading={editSaving}>Save</Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingId(null)} disabled={editSaving}>Cancel</Button>
                      </div>
                    );
                  }
                  return (
                    <div key={label.id} className={styles.labelRow}>
                      <span className={styles.labelChip}>
                        <span className={styles.labelDot} style={{ backgroundColor: label.color }} />
                        {label.name}
                      </span>
                      <div className={styles.labelActions}>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(label)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => setDeletingLabel(label)}>Delete</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
      <AppFooter />

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
