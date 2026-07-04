import styles from './AppFooter.module.css';

export default function AppFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>Purrfolio</span>
        <span className={styles.tagline}>Your personal budget tracker</span>
      </div>
    </footer>
  );
}
