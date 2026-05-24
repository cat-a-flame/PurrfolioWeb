import { Switch as ChakraSwitch } from '@chakra-ui/react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export default function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  return (
    <ChakraSwitch.Root
      colorPalette="accent"
      checked={checked}
      onCheckedChange={({ checked }) => onChange(checked)}
      disabled={disabled}
      display="flex"
      alignItems="center"
      gap="var(--space-3)"
    >
      <ChakraSwitch.HiddenInput id={id} />
      <ChakraSwitch.Control>
        <ChakraSwitch.Thumb />
      </ChakraSwitch.Control>
      {label && (
        <ChakraSwitch.Label
          fontSize="0.9375rem"
          fontWeight={500}
          color="var(--color-text)"
        >
          {label}
        </ChakraSwitch.Label>
      )}
    </ChakraSwitch.Root>
  );
}
