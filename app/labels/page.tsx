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

  // Delete
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchLabels = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('labels')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (data) setLabels(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setSaving(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('labels').insert({
      user_id: user.id,
      name: name.trim(),
      color,
    });

    setSaving(false);
    if (error) {
      setFormError(error.message);
    } else {
      setName('');
      setColor('#6366f1');
      setToast({ message: 'Label added.', variant: 'success' });
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

          {/* Add form */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add label</h2>
            <form onSubmit={handleAdd} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <FormLabel htmlFor="label-name" required>
                    Name
                  </FormLabel>
                  <Input
                    id="label-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Recurring"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <FormLabel htmlFor="label-color">Color</FormLabel>
                  <input
                    id="label-color"
                    type="color"
                    className={styles.colorPicker}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>

                <div className={styles.submitCol}>
                  <Button type="submit" variant="primary" size="md" loading={saving}>
                    Add
                  </Button>
                </div>
              </div>
              {formError && <p className={styles.formError}>{formError}</p>}
            </form>
          </section>

          {/* Labels list */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your labels</h2>
            {loading ? (
              <p className={styles.emptyState}>Loading…</p>
            ) : labels.length === 0 ? (
              <p className={styles.emptyState}>No labels yet.</p>
            ) : (
              <div className={styles.chipList}>
                {labels.map((label) => (
                  <div key={label.id} className={styles.labelRow}>
                    <span
                      className={styles.labelChip}
                      style={{
                        backgroundColor: label.color + '22',
                        color: label.color,
                        borderColor: label.color,
                      }}
                    >
                      {label.name}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeletingLabel(label)}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
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

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      )}
    </div>
  );
}
