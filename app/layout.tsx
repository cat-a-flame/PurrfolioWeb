import type { Metadata, Viewport } from 'next';
import { Lora, Nunito } from 'next/font/google';
import RoleGate from '@/components/auth/RoleGate';
import ReportBugButton from '@/components/feedback/ReportBugButton';
import AddRecordProvider from '@/components/transactions/AddRecordProvider';
import BottomNav from '@/components/layout/BottomNav';
import MobileHeader from '@/components/layout/MobileHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RecurringAlertProvider } from '@/contexts/RecurringAlertContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { UserProvider } from '@/contexts/UserContext';
import { createClient } from '@/lib/supabase/server';
import { toCurrentUser } from '@/lib/username';
import './globals.css';

const lora = Lora({ subsets: ['latin'], variable: '--font-display-src', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-body-src', display: 'swap' });

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f2ff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0614' },
  ],
};

export const metadata: Metadata = {
  title: 'Purrfolio',
  description: 'Your personal budget tracker',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html lang="en" className={`${lora.variable} ${nunito.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <UserProvider initialUser={toCurrentUser(user)}>
            <RoleProvider>
              <RecurringAlertProvider>
                <AddRecordProvider>
                  <MobileHeader />
                  {children}
                  <BottomNav />
                  <RoleGate allow={['user']}>
                    <ReportBugButton />
                  </RoleGate>
                </AddRecordProvider>
              </RecurringAlertProvider>
            </RoleProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
