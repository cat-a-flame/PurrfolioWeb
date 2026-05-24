'use client';

import { useEffect, useState } from 'react';
import { Alert, CloseButton } from '@chakra-ui/react';

export type ToastVariant = 'success' | 'error';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({
  message,
  variant = 'success',
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hide  = setTimeout(() => setVisible(false), duration - 300);
    const close = setTimeout(onDismiss, duration);
    return () => { clearTimeout(hide); clearTimeout(close); };
  }, [duration, onDismiss]);

  function dismiss() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  const status = variant === 'error' ? 'error' : 'success';

  return (
    <Alert.Root
      status={status}
      role="alert"
      position="fixed"
      bottom="var(--space-6)"
      right="var(--space-6)"
      zIndex={9999}
      maxW="360px"
      minW="240px"
      borderRadius="var(--radius-lg)"
      boxShadow="var(--shadow-lg)"
      border="1px solid"
      borderColor={variant === 'error' ? 'var(--color-danger)' : 'var(--color-border)'}
      bg={variant === 'error' ? 'var(--color-danger-light)' : 'var(--color-surface)'}
      color={variant === 'error' ? 'var(--color-danger)' : 'var(--color-text)'}
      fontFamily="var(--font-figtree)"
      transition="opacity 300ms ease, transform 300ms ease"
      opacity={visible ? 1 : 0}
      transform={visible ? 'translateX(0)' : 'translateX(calc(100% + var(--space-6)))'}
      display="flex"
      alignItems="center"
      gap="var(--space-2)"
      px="var(--space-4)"
      py="var(--space-3)"
    >
      <Alert.Indicator />
      <Alert.Content flex={1}>
        <Alert.Description fontSize="0.9375rem" fontWeight={500}>
          {message}
        </Alert.Description>
      </Alert.Content>
      <CloseButton
        size="sm"
        onClick={dismiss}
        color="inherit"
        opacity={0.7}
        _hover={{ opacity: 1 }}
      />
    </Alert.Root>
  );
}
