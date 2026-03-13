import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { Inter } from 'next/font/google';
import './globals.css';
import DarkModeProvider from '@/components/DarkModeProvider';
import { getSettingsByKeys } from '@/lib/repositories/settingsRepository';
import { parseHeadHtml } from '@/lib/parse-head-html';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ycode - Visual Website Builder',
  description: 'Self-hosted visual website builder',
};

async function fetchCachedCustomHeadCode(): Promise<string | null> {
  try {
    return await unstable_cache(
      async () => {
        const settings = await getSettingsByKeys(['custom_code_head']);
        return (settings.custom_code_head as string) || null;
      },
      ['data-for-global-custom-head-code'],
      { tags: ['all-pages'], revalidate: false }
    )();
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
  head,
}: Readonly<{
  children: React.ReactNode;
  head: React.ReactNode;
}>) {
  const customHeadCode = await fetchCachedCustomHeadCode();

  return (
    <html lang="en">
      <head>
        {customHeadCode && parseHeadHtml(customHeadCode)}
        {head}
      </head>
      <body className={`${inter.variable} font-sans antialiased text-xs`} suppressHydrationWarning>
        <DarkModeProvider>
          {children}
        </DarkModeProvider>
      </body>
    </html>
  );
}
