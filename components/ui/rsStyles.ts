import type { StylesConfig, GroupBase, Theme } from 'react-select';

export function makeRsStyles<
  Option = unknown,
  IsMulti extends boolean = false,
>(size: 'sm' | 'md' = 'md'): StylesConfig<Option, IsMulti, GroupBase<Option>> {
  const fs = size === 'sm' ? '0.875rem' : '0.9375rem';
  const minH = size === 'sm' ? '38px' : '42px';
  return {
    control: (base, state) => ({
      ...base,
      minHeight: minH,
      background: 'var(--color-surface)',
      borderColor: state.isFocused ? 'var(--color-border-focus)' : 'var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: state.isFocused ? '0 0 0 3px var(--color-accent-light)' : 'none',
      fontFamily: 'var(--font-nunito)',
      fontSize: fs,
      cursor: 'pointer',
      '&:hover': { borderColor: 'var(--color-border-focus)' },
    }),
    valueContainer: (base) => ({ ...base, padding: '0 12px' }),
    singleValue: (base) => ({ ...base, color: 'var(--color-text)' }),
    placeholder: (base) => ({ ...base, color: 'var(--color-text-faint)' }),
    input: (base) => ({ ...base, color: 'var(--color-text)', fontFamily: 'var(--font-nunito)', margin: 0, padding: 0 }),
    menu: (base) => ({
      ...base,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-md)',
      zIndex: 400,
    }),
    menuList: (base) => ({ ...base, padding: '4px 0' }),
    option: (base, state) => ({
      ...base,
      background: state.isSelected
        ? 'var(--color-accent-light)'
        : state.isFocused
        ? 'var(--color-surface-2)'
        : 'transparent',
      color: state.isSelected ? 'var(--color-accent)' : 'var(--color-text)',
      fontFamily: 'var(--font-nunito)',
      fontSize: fs,
      fontWeight: state.isSelected ? 600 : 400,
      cursor: 'pointer',
      padding: '8px 12px',
    }),
    groupHeading: (base) => ({
      ...base,
      color: 'var(--color-text-faint)',
      fontFamily: 'var(--font-nunito)',
      fontSize: '0.75rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      padding: '8px 12px 4px',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({ ...base, color: 'var(--color-text-muted)', padding: '0 8px' }),
    clearIndicator: (base) => ({ ...base, color: 'var(--color-text-muted)' }),
    multiValue: (base) => ({ ...base, background: 'var(--color-surface-2)', borderRadius: '4px' }),
    multiValueLabel: (base) => ({ ...base, color: 'var(--color-text)', fontFamily: 'var(--font-nunito)', fontSize: '0.8125rem' }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--color-text-muted)',
      ':hover': { background: 'var(--color-border)', color: 'var(--color-text)' },
    }),
  };
}

// Pill-shaped control used for the "Add category" trigger — borderless,
// tinted background, bold placeholder, no visible field chrome.
export function makePillRsStyles<
  Option = unknown,
  IsMulti extends boolean = false,
>(): StylesConfig<Option, IsMulti, GroupBase<Option>> {
  return {
    control: (base) => ({
      ...base,
      minHeight: '40px',
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      fontFamily: 'var(--font-nunito)',
      fontSize: '1rem',
      cursor: 'pointer',
    }),
    valueContainer: (base) => ({ ...base, padding: '0 4px' }),
    singleValue: (base) => ({ ...base, color: 'var(--color-text)', fontWeight: 600 }),
    placeholder: (base) => ({ ...base, color: 'var(--color-accent)', fontWeight: 700 }),
    input: (base) => ({ ...base, color: 'var(--color-text)', fontFamily: 'var(--font-nunito)', margin: 0, padding: 0 }),
    menu: (base) => ({
      ...base,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-md)',
      zIndex: 400,
    }),
    menuList: (base) => ({ ...base, padding: '4px 0' }),
    option: (base, state) => ({
      ...base,
      background: state.isSelected
        ? 'var(--color-accent-light)'
        : state.isFocused
        ? 'var(--color-surface-2)'
        : 'transparent',
      color: state.isSelected ? 'var(--color-accent)' : 'var(--color-text)',
      fontFamily: 'var(--font-nunito)',
      fontSize: '0.9375rem',
      fontWeight: state.isSelected ? 600 : 400,
      cursor: 'pointer',
      padding: '8px 12px',
    }),
    groupHeading: (base) => ({
      ...base,
      color: 'var(--color-text-faint)',
      fontFamily: 'var(--font-nunito)',
      fontSize: '0.75rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      padding: '8px 12px 4px',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({ ...base, color: 'var(--color-accent)', padding: '0 8px' }),
    clearIndicator: (base) => ({ ...base, color: 'var(--color-text-muted)' }),
  };
}

// Minimal control used for the compact Account field inside the
// account/date mini-field row — no border, no background, no arrow.
export function makePlainRsStyles<
  Option = unknown,
  IsMulti extends boolean = false,
>(): StylesConfig<Option, IsMulti, GroupBase<Option>> {
  return {
    control: (base) => ({
      ...base,
      minHeight: '22px',
      background: 'transparent',
      border: 'none',
      boxShadow: 'none',
      fontFamily: 'var(--font-nunito)',
      fontSize: '0.9375rem',
      fontWeight: 700,
      cursor: 'pointer',
    }),
    valueContainer: (base) => ({ ...base, padding: 0 }),
    singleValue: (base) => ({ ...base, color: 'var(--color-text)', fontWeight: 700 }),
    placeholder: (base) => ({ ...base, color: 'var(--color-text-faint)' }),
    input: (base) => ({ ...base, color: 'var(--color-text)', fontFamily: 'var(--font-nunito)', margin: 0, padding: 0 }),
    indicatorsContainer: () => ({ display: 'none' }),
    menu: (base) => ({
      ...base,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-md)',
      zIndex: 400,
      minWidth: '220px',
    }),
    menuList: (base) => ({ ...base, padding: '4px 0' }),
    option: (base, state) => ({
      ...base,
      background: state.isSelected
        ? 'var(--color-accent-light)'
        : state.isFocused
        ? 'var(--color-surface-2)'
        : 'transparent',
      color: state.isSelected ? 'var(--color-accent)' : 'var(--color-text)',
      fontFamily: 'var(--font-nunito)',
      fontSize: '0.9375rem',
      fontWeight: state.isSelected ? 600 : 400,
      cursor: 'pointer',
      padding: '8px 12px',
    }),
  };
}

export function rsTheme(theme: Theme): Theme {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      primary: '#b5935a',
      primary25: '#fdf6ee',
      primary50: '#fdf6ee',
      neutral0: '#ffffff',
      neutral20: '#e5e1da',
    },
  };
}
