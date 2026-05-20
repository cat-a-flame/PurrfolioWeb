import type { Metadata } from 'next';
import { Lora, Figtree } from 'next/font/google';
import AddRecordProvider from '@/components/transactions/AddRecordProvider';
import BottomNav from '@/components/layout/BottomNav';
import { ThemeProvider } from '@/contexts/ThemeContext';
import './globals.css';

const lora = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });

export const metadata: Metadata = {
  title: 'PennyPuff',
  description: 'Your personal budget tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${figtree.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AddRecordProvider>
            {children}
            <BottomNav />
          </AddRecordProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
