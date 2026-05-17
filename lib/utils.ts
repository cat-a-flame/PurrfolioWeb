import type { Currency } from './types';

export function formatCurrency(amount: number, currency: Currency): string {
  const locale = currency === 'HUF' ? 'hu-HU' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  }).format(amount);
}

export function formatHUF(amount: number): string {
  return formatCurrency(amount, 'HUF');
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}
