import { Badge as ChakraBadge } from '@chakra-ui/react';

type BadgeVariant = 'income' | 'expense';

const LABELS: Record<BadgeVariant, string> = {
  income: 'Income',
  expense: 'Expense',
};

const colorMap: Record<BadgeVariant, { bg: string; color: string }> = {
  income:  { bg: 'var(--color-income-light)',  color: 'var(--color-income)'  },
  expense: { bg: 'var(--color-expense-light)', color: 'var(--color-expense)' },
};

interface BadgeProps {
  variant: BadgeVariant;
}

export default function Badge({ variant }: BadgeProps) {
  const { bg, color } = colorMap[variant];
  return (
    <ChakraBadge
      bg={bg}
      color={color}
      borderRadius="var(--radius-full)"
      fontSize="0.75rem"
      fontWeight={600}
      px={2}
      py={0.5}
      textTransform="capitalize"
    >
      {LABELS[variant]}
    </ChakraBadge>
  );
}
