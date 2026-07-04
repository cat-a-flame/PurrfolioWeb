import type { Metadata } from 'next';
import { Lora, Nunito } from 'next/font/google';
import AddRecordProvider from '@/components/transactions/AddRecordProvider';
import BottomNav from '@/components/layout/BottomNav';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RecurringAlertProvider } from '@/contexts/RecurringAlertContext';
import './globals.css';

const lora = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: 'Purrfolio',
  description: 'Your personal budget tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <RecurringAlertProvider>
            <AddRecordProvider>
              {children}
              <BottomNav />
            </AddRecordProvider>
          </RecurringAlertProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
