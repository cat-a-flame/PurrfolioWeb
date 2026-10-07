'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import { Caret } from '@/components/ui/FilterChip';
import FilterDropdown, { FilterDot, FilterEmpty, FilterOption } from '@/components/ui/FilterDropdown';
import PeriodPicker, { PeriodValue } from '@/components/ui/PeriodPicker';
import SearchInput from '@/components/ui/SearchInput';
import type { AccountType, Category, Currency, Label, Transaction, Wallet } from '@/lib/types';
import styles from './TransactionFilters.module.css';

export type TxKind = 'expense' | 'income' | 'transfer';

export interface TxFilters {
  types: TxKind[];
  /** Category ids; UNCATEGORIZED stands for transactions without one. */
  categoryIds: string[];
  walletIds: string[];
  labelIds: string[];
  currencies: Currency[];
  search: string;
}

export const UNCATEGORIZED = '__none__';

export const EMPTY_FILTERS: TxFilters = {
  types: [],
  categoryIds: [],
  walletIds: [],
  labelIds: [],
  currencies: [],
  search: '',
};

/** Reads saved filters, dropping anything that isn't the current shape. */
export function parseFilters(raw: unknown): TxFilters {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    types: strings(obj.types) as TxKind[],
    categoryIds: strings(obj.categoryIds),
    walletIds: strings(obj.walletIds),
    labelIds: strings(obj.labelIds),
    currencies: strings(obj.currencies) as Currency[],
    search: typeof obj.search === 'string' ? obj.search : '',
  };
}

export function hasActiveFilters(f: TxFilters): boolean {
  return f.types.length > 0 || f.categoryIds.length > 0 || f.walletIds.length > 0
    || f.labelIds.length > 0 || f.currencies.length > 0 || f.search.trim() !== '';
}

export function matchesFilters(t: Transaction, f: TxFilters): boolean {
  const isTransfer = !!t.transfer_group_id;
  if (f.types.length > 0 && !f.types.includes(isTransfer ? 'transfer' : t.type)) return false;
  if (f.categoryIds.length > 0) {
    if (isTransfer) return false;
    const key = t.category_id ?? UNCATEGORIZED;
    if (!f.categoryIds.includes(key)) return false;
  }
  if (f.walletIds.length > 0 && !f.walletIds.includes(t.wallet_id)) return false;
  if (f.labelIds.length > 0 && !t.labels?.some(l => f.labelIds.includes(l.id))) return false;
  if (f.currencies.length > 0 && !f.currencies.includes(t.wallet?.currency ?? 'HUF')) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const matchesNotes = t.notes?.toLowerCase().includes(q);
    const matchesPayee = t.payer?.toLowerCase().includes(q);
    if (!matchesNotes && !matchesPayee) return false;
  }
  return true;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/** Checks every value if any is unchecked, otherwise unchecks them all. */
function toggleAll<T>(list: T[], values: T[]): T[] {
  const allIn = values.every(v => list.includes(v));
  return allIn ? list.filter(v => !values.includes(v)) : [...list, ...values.filter(v => !list.includes(v))];
}

function groupState<T>(list: T[], values: T[]) {
  const n = values.filter(v => list.includes(v)).length;
  return { checked: values.length > 0 && n === values.length, indeterminate: n > 0 && n < values.length };
}

const TYPE_OPTIONS: { value: TxKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const ACCOUNT_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: 'Bank', types: ['bank'] },
  { label: 'Cash', types: ['cash'] },
  { label: 'Savings', types: ['savings'] },
  { label: 'Credit cards', types: ['credit_card'] },
  { label: 'Bonds', types: ['bond'] },
  { label: 'Investments', types: ['investment'] },
  { label: 'Crypto', types: ['crypto'] },
  { label: 'Other', types: ['other'] },
];

const CURRENCY_ORDER: Currency[] = ['HUF', 'EUR', 'USD'];
const CURRENCY_NAMES: Record<Currency, string> = {
  HUF: 'Hungarian forint',
  EUR: 'Euro',
  USD: 'US dollar',
};

interface TransactionFiltersProps {
  filters: TxFilters;
  onChange: (next: TxFilters) => void;
  period: PeriodValue;
  onPeriodChange: (next: PeriodValue) => void;
  categories: Category[];
  wallets: Wallet[];
  labels: Label[];
}

export default function TransactionFilters({
  filters,
  onChange,
  period,
  onPeriodChange,
  categories,
  wallets,
  labels,
}: TransactionFiltersProps) {
  const set = <K extends keyof TxFilters>(key: K, value: TxFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className={styles.bar}>
      <div className={styles.topRow}>
        <PeriodPicker value={period} onChange={onPeriodChange} variant="chip" />
        <SearchInput
          variant="outlined"
          className={styles.search}
          placeholder="Search payee or notes"
          aria-label="Search payee or notes"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
        />
      </div>

      <div className={styles.chipRow}>
        <CategoryFilter
          categories={categories}
          selected={filters.categoryIds}
          onChange={ids => set('categoryIds', ids)}
        />
        <AccountFilter
          wallets={wallets}
          selected={filters.walletIds}
          onChange={ids => set('walletIds', ids)}
        />
        <FilterDropdown label="Type" count={filters.types.length} width={220}>
          {TYPE_OPTIONS.map(o => (
            <FilterOption
              key={o.value}
              checked={filters.types.includes(o.value)}
              onToggle={() => set('types', toggle(filters.types, o.value))}
            >
              {o.label}
            </FilterOption>
          ))}
        </FilterDropdown>
        <LabelFilter
          labels={labels}
          selected={filters.labelIds}
          onChange={ids => set('labelIds', ids)}
        />
        <CurrencyFilter
          wallets={wallets}
          selected={filters.currencies}
          onChange={cs => set('currencies', cs)}
        />
        <Button
          variant="ghost"
          size="sm"
          className={styles.clearAll}
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={!hasActiveFilters(filters)}
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}

interface CategoryNode {
  category: Category;
  children: Category[];
}

function CategoryFilter({ categories, selected, onChange }: {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const nodes: CategoryNode[] = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const result: CategoryNode[] = parents.map(p => ({ category: p, children: children.filter(c => c.parent_id === p.id) }));
    for (const orphan of children.filter(c => !parents.some(p => p.id === c.parent_id))) {
      result.push({ category: orphan, children: [] });
    }
    return result;
  }, [categories]);

  const q = search.trim().toLowerCase();
  // While searching: a matching parent keeps all its children; otherwise only matching children show.
  const visible: CategoryNode[] = q
    ? nodes.flatMap(n => {
        if (n.category.name.toLowerCase().includes(q)) return [n];
        const kids = n.children.filter(c => c.name.toLowerCase().includes(q));
        return kids.length > 0 ? [{ category: n.category, children: kids }] : [];
      })
    : nodes;
  const showUncategorized = !q || 'uncategorized'.includes(q);

  // A fully checked parent also holds its own id; count it as one pick, not one more.
  const parentIds = new Set(nodes.filter(n => n.children.length > 0).map(n => n.category.id));
  const count = selected.filter(id => !parentIds.has(id)).length;

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <FilterDropdown
      label="Category"
      count={count}
      width={340}
      onClose={() => setSearch('')}
      header={
        <SearchInput
          placeholder="Find a category"
          aria-label="Find a category"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      }
      footer={close => (
        <>
          <span className={styles.footerHint}>
            {count > 0 ? `${count} selected` : 'Pick a category or subcategory'}
          </span>
          <Button variant="primary" size="sm" onClick={close}>Done</Button>
        </>
      )}
    >
      {visible.length === 0 && !showUncategorized && <FilterEmpty>No categories found</FilterEmpty>}
      {visible.map(({ category: parent, children }) => {
        const ids = [parent.id, ...children.map(c => c.id)];
        const state = groupState(selected, ids);
        const hasKids = children.length > 0;
        const isOpen = hasKids && (!!q || expanded.has(parent.id));
        return (
          <div key={parent.id}>
            <FilterOption
              {...state}
              onToggle={() => onChange(toggleAll(selected, ids))}
              meta={hasKids ? children.length : undefined}
              leading={hasKids ? (
                <button
                  type="button"
                  className={[styles.expandBtn, isOpen ? styles.expandBtnOpen : ''].filter(Boolean).join(' ')}
                  onClick={() => toggleExpanded(parent.id)}
                  aria-label={isOpen ? `Collapse ${parent.name}` : `Expand ${parent.name}`}
                  aria-expanded={isOpen}
                  disabled={!!q}
                >
                  <Caret />
                </button>
              ) : <span className={styles.expandSpacer} />}
            >
              <span>{parent.icon}</span>
              <span className={styles.ellipsis}>{parent.name}</span>
            </FilterOption>
            {isOpen && children.map(child => (
              <FilterOption
                key={child.id}
                depth={1}
                checked={selected.includes(child.id)}
                onToggle={() => onChange(toggle(selected, child.id))}
                leading={<span className={styles.expandSpacer} />}
              >
                <span>{child.icon}</span>
                <span className={styles.ellipsis}>{child.name}</span>
              </FilterOption>
            ))}
          </div>
        );
      })}
      {showUncategorized && (
        <FilterOption
          checked={selected.includes(UNCATEGORIZED)}
          onToggle={() => onChange(toggle(selected, UNCATEGORIZED))}
          leading={<span className={styles.expandSpacer} />}
        >
          <span>❔</span>
          <span className={styles.ellipsis}>Uncategorized</span>
        </FilterOption>
      )}
    </FilterDropdown>
  );
}

function AccountFilter({ wallets, selected, onChange }: {
  wallets: Wallet[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const groups = ACCOUNT_GROUPS
    // Wallets from before account types existed have no type; count them as bank.
    .map(g => ({ label: g.label, wallets: wallets.filter(w => g.types.includes(w.type ?? 'bank')) }))
    .filter(g => g.wallets.length > 0);

  return (
    <FilterDropdown label="Account" count={selected.length} width={300}>
      {groups.length === 0 && <FilterEmpty>No accounts yet</FilterEmpty>}
      {groups.map(g => {
        const ids = g.wallets.map(w => w.id);
        return (
          <div key={g.label} className={styles.group}>
            <FilterOption heading {...groupState(selected, ids)} onToggle={() => onChange(toggleAll(selected, ids))}>
              {g.label}
            </FilterOption>
            {g.wallets.map(w => (
              <FilterOption
                key={w.id}
                depth={1}
                checked={selected.includes(w.id)}
                onToggle={() => onChange(toggle(selected, w.id))}
                meta={w.currency}
              >
                <FilterDot color={w.color} />
                <span className={styles.ellipsis}>{w.name}</span>
              </FilterOption>
            ))}
          </div>
        );
      })}
    </FilterDropdown>
  );
}

function LabelFilter({ labels, selected, onChange }: {
  labels: Label[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const visible = q ? labels.filter(l => l.name.toLowerCase().includes(q)) : labels;

  return (
    <FilterDropdown
      label="Label"
      count={selected.length}
      width={260}
      onClose={() => setSearch('')}
      header={
        <SearchInput
          placeholder="Find a label"
          aria-label="Find a label"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      }
    >
      {visible.length === 0 && <FilterEmpty>{labels.length === 0 ? 'No labels yet' : 'No labels found'}</FilterEmpty>}
      {visible.map(l => (
        <FilterOption key={l.id} checked={selected.includes(l.id)} onToggle={() => onChange(toggle(selected, l.id))}>
          <FilterDot color={l.color} />
          <span className={styles.ellipsis}>{l.name}</span>
        </FilterOption>
      ))}
    </FilterDropdown>
  );
}

function CurrencyFilter({ wallets, selected, onChange }: {
  wallets: Wallet[];
  selected: Currency[];
  onChange: (cs: Currency[]) => void;
}) {
  const used = new Set(wallets.map(w => w.currency ?? 'HUF'));
  const currencies = CURRENCY_ORDER.filter(c => used.has(c));

  return (
    <FilterDropdown label="Currency" count={selected.length} width={260}>
      {currencies.length === 0 && <FilterEmpty>No accounts yet</FilterEmpty>}
      {currencies.map(c => (
        <FilterOption key={c} checked={selected.includes(c)} onToggle={() => onChange(toggle(selected, c))} meta={CURRENCY_NAMES[c]}>
          {c}
        </FilterOption>
      ))}
    </FilterDropdown>
  );
}
