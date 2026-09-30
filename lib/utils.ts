import type { AccountType, Currency } from './types';

export const ACCOUNT_TYPES: AccountType[] = ['bank', 'cash', 'savings', 'credit_card', 'investment', 'bond', 'crypto', 'other'];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  cash: 'Cash',
  savings: 'Savings',
  credit_card: 'Credit card',
  investment: 'Investment',
  bond: 'Bond',
  crypto: 'Crypto',
  other: 'Other',
};

export function formatCurrency(amount: number, currency: Currency): string {
  const locale = currency === 'HUF' ? 'hu-HU' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  }).formatToParts(amount).map(p => p.type === 'group' ? ' ' : p.value).join('');
}

export function formatHUF(amount: number): string {
  return formatCurrency(amount, 'HUF');
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    .formatToParts(amount).map(p => p.type === 'group' ? ' ' : p.value).join('');
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function todayInputDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
