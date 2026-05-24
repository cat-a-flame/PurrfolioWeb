import type { Metadata } from 'next';
import { Lora, Figtree } from 'next/font/google';
import AddRecordProvider from '@/components/transactions/AddRecordProvider';
import BottomNav from '@/components/layout/BottomNav';
import { Providers } from './providers';
import './globals.css';

const lora = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap' });
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });

export const metadata: Metadata = {
  title: 'PennyPuff',
  description: 'Your personal budget tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${figtree.variable}`} suppressHydrationWarning>
      <body>
        <Providers>
          <AddRecordProvider>
            {children}
            <BottomNav />
          </AddRecordProvider>
        </Providers>
      </body>
    </html>
  );
}
