import AppShell from '@/components/layout/AppShell';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import styles from './layout.module.css';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className={styles.body}>
        <SettingsSidebar />
        <main className={styles.main}>{children}</main>
      </div>
    </AppShell>
  );
}
