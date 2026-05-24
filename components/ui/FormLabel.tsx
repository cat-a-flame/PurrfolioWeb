import { chakra } from '@chakra-ui/react';

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: React.ReactNode;
}

export default function FormLabel({ required, children, ...props }: FormLabelProps) {
  return (
    <chakra.label
      display="block"
      fontSize="0.875rem"
      fontWeight={500}
      color="var(--color-text)"
      mb="var(--space-1)"
      {...(props as any)}
    >
      {children}
      {required && (
        <chakra.span color="var(--color-danger)" ml="var(--space-1)" aria-hidden>*</chakra.span>
      )}
    </chakra.label>
  );
}
