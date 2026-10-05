import TopNav from './TopNav';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <TopNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
