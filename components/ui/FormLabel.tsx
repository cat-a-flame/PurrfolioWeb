import styles from './FormLabel.module.css';

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: React.ReactNode;
}

export default function FormLabel({ required, children, ...props }: FormLabelProps) {
  return (
    <label className={styles.label} {...props}>
      {children}
      {required ? <span className={styles.required}>*</span> : null}
    </label>
  );
}
