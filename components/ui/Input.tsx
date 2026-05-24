import { Input as ChakraInput } from '@chakra-ui/react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export default function Input({ error, className, style, ...props }: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <ChakraInput
        bg="var(--color-surface)"
        color="var(--color-text)"
        borderColor={error ? 'var(--color-danger)' : 'var(--color-border)'}
        borderRadius="var(--radius-md)"
        height="42px"
        fontSize="0.9375rem"
        fontFamily="var(--font-figtree)"
        _placeholder={{ color: 'var(--color-text-faint)' }}
        _hover={{ borderColor: error ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
        _focus={{ borderColor: 'var(--color-border-focus)', boxShadow: '0 0 0 3px var(--color-accent-glow)', outline: 'none' }}
        className={className}
        style={style}
        {...(props as any)}
      />
      {error && (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-danger)', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}
