'use client';

import { CloseButton, Dialog as ChakraDialog } from '@chakra-ui/react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

export default function Dialog({ title, onClose, children, maxWidth }: DialogProps) {
  return (
    <ChakraDialog.Root
      open
      onOpenChange={({ open }) => { if (!open) onClose(); }}
      modal
    >
      <ChakraDialog.Backdrop bg="var(--color-overlay)" />
      <ChakraDialog.Positioner>
        <ChakraDialog.Content
          bg="var(--color-surface)"
          border="1px solid var(--color-border)"
          borderRadius="var(--radius-xl)"
          boxShadow="var(--shadow-lg)"
          maxH="90vh"
          overflowY="auto"
          fontFamily="var(--font-figtree)"
          style={maxWidth ? { maxWidth } : undefined}
        >
          <ChakraDialog.Header
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            px="var(--space-6)"
            pt="var(--space-5)"
            pb="var(--space-4)"
            borderBottom="1px solid var(--color-border)"
            position="sticky"
            top={0}
            bg="var(--color-surface)"
            zIndex={1}
          >
            <ChakraDialog.Title
              fontSize="1.125rem"
              fontWeight={700}
              color="var(--color-text)"
              fontFamily="var(--font-figtree)"
            >
              {title}
            </ChakraDialog.Title>
            <ChakraDialog.CloseTrigger asChild>
              <CloseButton
                size="sm"
                color="var(--color-text-muted)"
                _hover={{ color: 'var(--color-text)', bg: 'var(--color-surface-2)' }}
              />
            </ChakraDialog.CloseTrigger>
          </ChakraDialog.Header>
          <ChakraDialog.Body px="var(--space-6)" py="var(--space-5)">
            {children}
          </ChakraDialog.Body>
        </ChakraDialog.Content>
      </ChakraDialog.Positioner>
    </ChakraDialog.Root>
  );
}
