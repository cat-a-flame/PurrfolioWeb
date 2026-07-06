'use client';

import { useState } from 'react';
import ReactSelect from 'react-select';
import { FaTrash } from 'react-icons/fa';
import Button from '@/components/ui/Button';
import ColorSwatchField from '@/components/ui/ColorSwatchField';
import Dialog from '@/components/ui/Dialog';
import FormLabel from '@/components/ui/FormLabel';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import Switch from '@/components/ui/Switch';
import { makeRsStyles, rsTheme } from '@/components/ui/rsStyles';
import type { Currency } from '@/lib/types';
import { hexToRgba } from '@/lib/colorUtils';
import styles from './AccountEditorModal.module.css';

const CURRENCIES: Currency[] = ['HUF', 'USD', 'EUR'];
const CURRENCY_LABELS: Record<Currency, string> = {
  HUF: 'HUF — Hungarian Forint',
  USD: 'USD — US Dollar',
  EUR: 'EUR — Euro',
};

export interface WalletDraft {
  name: string;
  icon: string;
  color: string;
  currency: Currency;
  startingBalance: string;
  isDefault: boolean;
  isArchived: boolean;
}

interface AccountEditorModalProps {
  mode: 'create' | 'edit';
  initial: WalletDraft;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: WalletDraft) => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onToggleArchive: () => void;
}

export default function AccountEditorModal({
  mode, initial, canDelete, saving, onClose, onSave, onDelete, onSetDefault, onToggleArchive,
}: AccountEditorModalProps) {
  const [draft, setDraft] = useState<WalletDraft>(initial);
  const isEdit = mode === 'edit';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(draft);
  }

  const currencyOptions = CURRENCIES.map(c => ({ value: c, label: CURRENCY_LABELS[c] }));

  return (
    <Dialog
      title={isEdit ? 'Edit account' : 'New account'}
      subtitle={isEdit ? 'Update icon, color and balance' : 'Set up an account to track balances'}
      icon={
        <div
          className={styles.previewTile}
          style={{ background: hexToRgba(draft.color, 0.25), boxShadow: `0 10px 22px -8px ${draft.color}` }}
        >
          {draft.icon || '💰'}
        </div>
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.iconNameRow}>
          <div className={styles.iconField}>
            <FormLabel htmlFor="wallet-emoji">Icon</FormLabel>
            <Input
              id="wallet-emoji"
              className={styles.emojiInput}
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              maxLength={4}
              placeholder="💰"
              aria-label="Account emoji"
            />
          </div>
          <div className={styles.nameField}>
            <FormLabel htmlFor="wallet-name" required>Account name</FormLabel>
            <Input
              id="wallet-name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Savings"
              aria-label="Account name"
              autoFocus
            />
          </div>
        </div>

        <div className={styles.section}>
          <FormLabel htmlFor="wallet-currency">Currency</FormLabel>
          {isEdit ? (
            <div className={styles.staticValue}>{CURRENCY_LABELS[draft.currency]}</div>
          ) : (
            <ReactSelect<{ value: Currency; label: string }>
              inputId="wallet-currency"
              options={currencyOptions}
              value={currencyOptions.find(o => o.value === draft.currency) ?? currencyOptions[0]}
              onChange={(opt) => opt && setDraft((d) => ({ ...d, currency: opt.value }))}
              isSearchable={false}
              styles={makeRsStyles<{ value: Currency; label: string }>()}
              theme={rsTheme}
              menuPosition="fixed"
            />
          )}
        </div>

        <div className={styles.section}>
          <FormLabel htmlFor="wallet-balance">Starting balance</FormLabel>
          <NumberInput
            id="wallet-balance"
            value={draft.startingBalance}
            onChange={(v) => setDraft((d) => ({ ...d, startingBalance: v }))}
            placeholder="0"
          />
        </div>

        <div className={styles.section}>
          <FormLabel>Color</FormLabel>
          <ColorSwatchField
            value={draft.color}
            onChange={(color) => setDraft((d) => ({ ...d, color }))}
            ariaLabel="Account color"
          />
        </div>

        {isEdit && (
          <>
            <div className={styles.switchRow}>
              <Switch
                id="wallet-default"
                label="Default account"
                checked={draft.isDefault}
                onChange={onSetDefault}
                disabled={draft.isDefault}
              />
            </div>
            <div className={styles.switchRow}>
              <Switch
                id="wallet-archived"
                label="Archived — cannot be selected for new records"
                checked={draft.isArchived}
                onChange={onToggleArchive}
                disabled={draft.isDefault}
              />
            </div>
          </>
        )}

        <div className={styles.footer}>
          {canDelete && (
            <Button type="button" variant="danger" size="md" onClick={onDelete}>
              <FaTrash style={{ display: 'inline-block' }} /> Delete
            </Button>
          )}
          <div className={styles.spacer} />
          <Button type="button" variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="md" loading={saving}>
            {isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
