'use client';

import React, { useEffect, useState, useCallback } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import Button from '@/components/ui/Button';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Toast from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';
import type { Category, TransactionType } from '@/lib/types';
import styles from './page.module.css';

type CategoryTypeOption = TransactionType | 'both';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryTypeOption>('expense');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#f26e4d');
  const [parentId, setParentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const fetchCategories = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (data) setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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

    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: name.trim(),
      type,
      icon: icon.trim() || '📁',
      color,
      is_default: false,
      parent_id: parentId || null,
    });

    setSaving(false);
    if (error) {
      setFormError(error.message);
    } else {
      setName('');
      setIcon('');
      setColor('#f26e4d');
      setType('expense');
      setParentId('');
      setToast({ message: 'Category added.', variant: 'success' });
      await fetchCategories();
    }
  }

  async function handleDelete() {
    if (!deletingCategory) return;
    setDeleteLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', deletingCategory.id);

    setDeleteLoading(false);
    setDeletingCategory(null);

    if (error) {
      setToast({ message: 'Failed to delete category.', variant: 'error' });
    } else {
      setToast({ message: 'Category deleted.', variant: 'success' });
      await fetchCategories();
    }
  }

  return (
    <div className={styles.layout}>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Categories</h1>

          {/* Add form */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Add category</h2>
            <form onSubmit={handleAdd} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.field}>
                  <FormLabel htmlFor="cat-name" required>
                    Name
                  </FormLabel>
                  <Input
                    id="cat-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Groceries"
                    required
                  />
                </div>

                <div className={styles.field}>
                  <FormLabel htmlFor="cat-type" required>
                    Type
                  </FormLabel>
                  <select
                    id="cat-type"
                    className={styles.select}
                    value={type}
                    onChange={(e) => setType(e.target.value as CategoryTypeOption)}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <FormLabel htmlFor="cat-icon">Icon (emoji)</FormLabel>
                  <Input
                    id="cat-icon"
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="📁"
                    maxLength={4}
                  />
                </div>

                <div className={styles.field}>
                  <FormLabel htmlFor="cat-color">Color</FormLabel>
                  <input
                    id="cat-color"
                    type="color"
                    className={styles.colorPicker}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>

                <div className={styles.field}>
                  <FormLabel htmlFor="cat-parent">Parent category</FormLabel>
                  <select
                    id="cat-parent"
                    className={styles.select}
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                  >
                    <option value="">— Top level —</option>
                    {categories.filter((c) => !c.parent_id).map((c) => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
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

          {/* Category list */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Your categories</h2>
            {loading ? (
              <p className={styles.emptyState}>Loading…</p>
            ) : categories.length === 0 ? (
              <p className={styles.emptyState}>No categories yet.</p>
            ) : (
              <div className={styles.list}>
                {(() => {
                  const topLevel = categories.filter((c) => !c.parent_id);
                  const getChildren = (pid: string) => categories.filter((c) => c.parent_id === pid);
                  return topLevel.map((cat) => (
                    <React.Fragment key={cat.id}>
                      <div className={styles.catItem}>
                        <div className={styles.catIcon} style={{ backgroundColor: cat.color + '22' }}>
                          <span>{cat.icon || '📁'}</span>
                        </div>
                        <span className={styles.catName}>{cat.name}</span>
                        <div className={styles.catBadges}>
                          {cat.type === 'both' ? (
                            <span className={styles.bothBadge}>Both</span>
                          ) : (
                            <Badge variant={cat.type} />
                          )}
                        </div>
                        <div
                          className={styles.colorSwatch}
                          style={{ backgroundColor: cat.color }}
                          title={cat.color}
                        />
                        {!cat.is_default && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeletingCategory(cat)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                      {getChildren(cat.id).map((child) => (
                        <div key={child.id} className={[styles.catItem, styles.catItemChild].join(' ')}>
                          <span className={styles.childIndent}>↳</span>
                          <div className={styles.catIcon} style={{ backgroundColor: child.color + '22' }}>
                            <span>{child.icon || '📁'}</span>
                          </div>
                          <span className={styles.catName}>{child.name}</span>
                          <div className={styles.catBadges}>
                            {child.type === 'both' ? (
                              <span className={styles.bothBadge}>Both</span>
                            ) : (
                              <Badge variant={child.type} />
                            )}
                          </div>
                          <div
                            className={styles.colorSwatch}
                            style={{ backgroundColor: child.color }}
                            title={child.color}
                          />
                          {!child.is_default && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setDeletingCategory(child)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      ))}
                    </React.Fragment>
                  ));
                })()}
              </div>
            )}
          </section>
        </div>
      </main>
      <AppFooter />

      {deletingCategory && (
        <ConfirmDialog
          title="Delete category"
          message={`Delete "${deletingCategory.name}"? Transactions using this category will become uncategorised.`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingCategory(null)}
          loading={deleteLoading}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      )}
    </div>
  );
}
