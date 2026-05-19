'use client';

import ReactSelect, { MultiValue, components, MultiValueGenericProps } from 'react-select';
import { makeRsStyles, rsTheme } from './rsStyles';
import type { Label } from '@/lib/types';

interface LabelOption {
  value: string;
  label: string;
  color: string;
}

interface LabelSelectProps {
  labels: Label[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginRight: 6,
      }}
    />
  );
}

function MultiValueLabel(props: MultiValueGenericProps<LabelOption>) {
  return (
    <components.MultiValueLabel {...props}>
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <ColorDot color={props.data.color} />
        {props.data.label}
      </span>
    </components.MultiValueLabel>
  );
}

export default function LabelSelect({ labels, selectedIds, onChange }: LabelSelectProps) {
  const options: LabelOption[] = labels.map(l => ({ value: l.id, label: l.name, color: l.color }));
  const value = options.filter(o => selectedIds.includes(o.value));
  const styles = makeRsStyles<LabelOption, true>();

  return (
    <ReactSelect<LabelOption, true>
      isMulti
      options={options}
      value={value}
      onChange={(opts: MultiValue<LabelOption>) => onChange(opts.map(o => o.value))}
      placeholder="Choose labels…"
      formatOptionLabel={(opt) => (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <ColorDot color={opt.color} />
          {opt.label}
        </span>
      )}
      components={{ MultiValueLabel }}
      styles={styles as any}
      theme={rsTheme}
      menuPosition="fixed"
    />
  );
}
