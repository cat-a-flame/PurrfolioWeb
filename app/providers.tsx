'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ThemeProvider } from 'next-themes';
import { system } from '@/lib/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      {/* attribute="data-theme" keeps our html[data-theme="dark"] CSS variables working
          and aligns with Chakra's built-in _dark condition */}
      <ThemeProvider attribute="data-theme" storageKey="theme" defaultTheme="system" disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ChakraProvider>
  );
}
