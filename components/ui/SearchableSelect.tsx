'use client';

import ReactSelect, { SingleValue, StylesConfig, GroupBase } from 'react-select';
import { makeRsStyles, makePillRsStyles, rsTheme } from './rsStyles';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'pill';
  openMenuOnFocus?: boolean;
}

// Convert flat options with optional group into react-select grouped format
function toRsOptions(options: SelectOption[]) {
  const ungrouped: SelectOption[] = [];
  const groups: Map<string, SelectOption[]> = new Map();

  for (const opt of options) {
    if (opt.group) {
      if (!groups.has(opt.group)) groups.set(opt.group, []);
      groups.get(opt.group)!.push(opt);
    } else {
      ungrouped.push(opt);
    }
  }

  const result: (SelectOption | { label: string; options: SelectOption[] })[] = [...ungrouped];
  for (const [groupLabel, items] of groups) {
    result.push({ label: groupLabel, options: items });
  }
  return result;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Choose',
  id,
  size = 'md',
  variant = 'default',
  openMenuOnFocus,
}: SearchableSelectProps) {
  const rsOptions = toRsOptions(options);
  // Find selected option (search both ungrouped and inside groups)
  const selected = options.find(o => o.value === value) ?? null;

  const styles = variant === 'pill' ? makePillRsStyles<SelectOption>() : makeRsStyles<SelectOption>(size);

  return (
    <ReactSelect<SelectOption>
      inputId={id}
      options={rsOptions as any}
      value={selected}
      onChange={(opt: SingleValue<SelectOption>) => onChange(opt?.value ?? '')}
      placeholder={placeholder}
      isSearchable
      openMenuOnFocus={openMenuOnFocus}
      styles={styles as StylesConfig<SelectOption, false, GroupBase<SelectOption>>}
      theme={rsTheme}
      menuPosition="fixed"
    />
  );
}
