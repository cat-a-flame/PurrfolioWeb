import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import AddRecordProvider from '@/components/transactions/AddRecordProvider';
import BottomNav from '@/components/layout/BottomNav';
import MobileHeader from '@/components/layout/MobileHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RecurringAlertProvider } from '@/contexts/RecurringAlertContext';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display-src', display: 'swap' });
const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body-src', display: 'swap' });

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <RecurringAlertProvider>
            <AddRecordProvider>
              <MobileHeader />
              {children}
              <BottomNav />
            </AddRecordProvider>
          </RecurringAlertProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
