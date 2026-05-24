import { Button as ChakraButton } from '@chakra-ui/react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const variantMap: Record<ButtonVariant, { colorPalette: string; variant: string }> = {
  primary:   { colorPalette: 'accent',  variant: 'solid'   },
  secondary: { colorPalette: 'neutral', variant: 'outline' },
  ghost:     { colorPalette: 'neutral', variant: 'ghost'   },
  danger:    { colorPalette: 'danger',  variant: 'solid'   },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const { colorPalette, variant: chakraVariant } = variantMap[variant];
  return (
    <ChakraButton
      colorPalette={colorPalette}
      variant={chakraVariant}
      size={size}
      loading={loading}
      disabled={disabled || loading}
      type={type}
      borderRadius="var(--radius-md)"
      fontFamily="var(--font-figtree)"
      {...(props as any)}
    >
      {children}
    </ChakraButton>
  );
}
