'use client';

import { useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Button from '@/components/ui/Button';
import FilterDropdown, { FilterDot, FilterEmpty, FilterGroupHeading, FilterOption } from '@/components/ui/FilterDropdown';
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

interface TransactionFiltersProps {
  filters: TxFilters;
  onChange: (next: TxFilters) => void;
  period: PeriodValue;
  onPeriodChange: (next: PeriodValue) => void;
  categories: Category[];
  wallets: Wallet[];
  labels: Label[];
}

export default function TransactionFilters({ filters, onChange, period, onPeriodChange, categories, wallets, labels }: TransactionFiltersProps) {
  const set = <K extends keyof TxFilters>(key: K, value: TxFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className={styles.bar}>
      <div className={styles.lead}>
        <PeriodPicker value={period} onChange={onPeriodChange} variant="select" />
        <SearchInput
          variant="field"
          className={styles.search}
          placeholder="Search payee or notes"
          aria-label="Search payee or notes"
          value={filters.search}
          onChange={e => set('search', e.target.value)}
        />
      </div>

      <span className={styles.divider} aria-hidden />

      <div className={styles.selects}>
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
        <FilterDropdown
          placeholder="Type"
          selectedLabels={TYPE_OPTIONS.filter(o => filters.types.includes(o.value)).map(o => o.label)}
          minMenuWidth={180}
        >
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
          variant="secondary"
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

/** Drills into a parent the way the transaction form's CategoryPicker does, but with checkboxes. */
function CategoryFilter({ categories, selected, onChange }: {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [drillId, setDrillId] = useState<string | null>(null);

  const nodes: CategoryNode[] = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    const children = categories.filter(c => c.parent_id);
    const result: CategoryNode[] = parents.map(p => ({ category: p, children: children.filter(c => c.parent_id === p.id) }));
    for (const orphan of children.filter(c => !parents.some(p => p.id === c.parent_id))) {
      result.push({ category: orphan, children: [] });
    }
    return result;
  }, [categories]);

  const drillNode = drillId ? nodes.find(n => n.category.id === drillId) ?? null : null;
  const q = search.trim().toLowerCase();
  const searchResults = q ? categories.filter(c => c.name.toLowerCase().includes(q)) : null;
  const showUncategorized = !drillNode && (!q || 'uncategorized'.includes(q));

  // A fully checked parent also holds its own id; it shouldn't show up as one more pick.
  const parentIds = new Set(nodes.filter(n => n.children.length > 0).map(n => n.category.id));
  const selectedLabels = [
    ...categories.filter(c => selected.includes(c.id) && !parentIds.has(c.id)).map(c => `${c.icon} ${c.name}`),
    ...(selected.includes(UNCATEGORIZED) ? ['Uncategorized'] : []),
  ];

  // A parent's checkbox covers the parent and all its children.
  function idsFor(c: Category): string[] {
    const node = nodes.find(n => n.category.id === c.id);
    return node && node.children.length > 0 ? [c.id, ...node.children.map(k => k.id)] : [c.id];
  }

  function renderOption(c: Category, canDrill = true, label = `${c.icon} ${c.name}`) {
    const ids = idsFor(c);
    const hasKids = ids.length > 1;
    return (
      <FilterOption
        key={c.id}
        {...groupState(selected, ids)}
        onToggle={() => onChange(hasKids ? toggleAll(selected, ids) : toggle(selected, c.id))}
        trailing={hasKids && canDrill && !q ? (
          <button
            type="button"
            className={styles.drillBtn}
            onClick={() => setDrillId(c.id)}
            aria-label={`Show ${c.name} subcategories`}
          >
            <FiChevronRight />
          </button>
        ) : undefined}
      >
        {label}
      </FilterOption>
    );
  }

  const rows = searchResults ?? (drillNode ? drillNode.children : nodes.map(n => n.category));

  return (
    <FilterDropdown
      placeholder="Category"
      selectedLabels={selectedLabels}
      minMenuWidth={260}
      onClose={() => { setSearch(''); setDrillId(null); }}
      header={
        <SearchInput
          placeholder="Search categories…"
          aria-label="Search categories"
          value={search}
          onChange={e => { setSearch(e.target.value); setDrillId(null); }}
        />
      }
    >
      {drillNode && !q && (
        <>
          <button type="button" className={styles.backItem} onClick={() => setDrillId(null)} data-filter-option>
            <FiChevronLeft /> {drillNode.category.icon} {drillNode.category.name}
          </button>
          {renderOption(drillNode.category, false, `All of ${drillNode.category.name}`)}
        </>
      )}
      {rows.length === 0 && !showUncategorized && <FilterEmpty>No categories found</FilterEmpty>}
      {rows.map(c => renderOption(c))}
      {showUncategorized && (
        <FilterOption
          checked={selected.includes(UNCATEGORIZED)}
          onToggle={() => onChange(toggle(selected, UNCATEGORIZED))}
        >
          — Uncategorized
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
    <FilterDropdown
      placeholder="Account"
      selectedLabels={wallets.filter(w => selected.includes(w.id)).map(w => `${w.icon} ${w.name}`)}
      minMenuWidth={260}
    >
      {groups.length === 0 && <FilterEmpty>No accounts yet</FilterEmpty>}
      {groups.map(g => {
        const ids = g.wallets.map(w => w.id);
        return (
          <div key={g.label}>
            <FilterGroupHeading {...groupState(selected, ids)} onToggle={() => onChange(toggleAll(selected, ids))}>
              {g.label}
            </FilterGroupHeading>
            {g.wallets.map(w => (
              <FilterOption
                key={w.id}
                nested
                checked={selected.includes(w.id)}
                onToggle={() => onChange(toggle(selected, w.id))}
                meta={w.currency}
              >
                {w.icon} {w.name}
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
      placeholder="Label"
      selectedLabels={labels.filter(l => selected.includes(l.id)).map(l => l.name)}
      minMenuWidth={220}
      onClose={() => setSearch('')}
      header={
        <SearchInput
          placeholder="Search labels…"
          aria-label="Search labels"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      }
    >
      {visible.length === 0 && <FilterEmpty>{labels.length === 0 ? 'No labels yet' : 'No labels found'}</FilterEmpty>}
      {visible.map(l => (
        <FilterOption key={l.id} checked={selected.includes(l.id)} onToggle={() => onChange(toggle(selected, l.id))}>
          <FilterDot color={l.color} />
          {l.name}
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
    <FilterDropdown placeholder="Currency" selectedLabels={currencies.filter(c => selected.includes(c))} minMenuWidth={160}>
      {currencies.length === 0 && <FilterEmpty>No accounts yet</FilterEmpty>}
      {currencies.map(c => (
        <FilterOption key={c} checked={selected.includes(c)} onToggle={() => onChange(toggle(selected, c))}>
          {c}
        </FilterOption>
      ))}
    </FilterDropdown>
  );
}
