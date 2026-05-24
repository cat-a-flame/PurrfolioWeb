'use client';

import { Dialog as ChakraDialog } from '@chakra-ui/react';
import Button from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <ChakraDialog.Root
      open
      onOpenChange={({ open }) => { if (!open) onCancel(); }}
      role="alertdialog"
      modal
    >
      <ChakraDialog.Backdrop bg="var(--color-overlay)" />
      <ChakraDialog.Positioner>
        <ChakraDialog.Content
          bg="var(--color-surface)"
          border="1px solid var(--color-border)"
          borderRadius="var(--radius-xl)"
          boxShadow="var(--shadow-lg)"
          maxW="420px"
          fontFamily="var(--font-figtree)"
        >
          <ChakraDialog.Header px="var(--space-6)" pt="var(--space-5)" pb="var(--space-2)">
            <ChakraDialog.Title
              fontSize="1.0625rem"
              fontWeight={700}
              color="var(--color-text)"
              fontFamily="var(--font-figtree)"
            >
              {title}
            </ChakraDialog.Title>
          </ChakraDialog.Header>
          <ChakraDialog.Body px="var(--space-6)" pb="var(--space-5)">
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
              {message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button variant="secondary" size="md" onClick={onCancel} disabled={loading}>
                {cancelLabel}
              </Button>
              <Button variant="danger" size="md" onClick={onConfirm} loading={loading}>
                {confirmLabel}
              </Button>
            </div>
          </ChakraDialog.Body>
        </ChakraDialog.Content>
      </ChakraDialog.Positioner>
    </ChakraDialog.Root>
  );
}
