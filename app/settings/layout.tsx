import AppHeader from '@/components/layout/AppHeader';
import AppFooter from '@/components/layout/AppFooter';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import styles from './layout.module.css';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.layout}>
      <AppHeader />
      <div className={styles.body}>
        <SettingsSidebar />
        <main className={styles.main}>{children}</main>
      </div>
      <AppFooter />
    </div>
  );
}
