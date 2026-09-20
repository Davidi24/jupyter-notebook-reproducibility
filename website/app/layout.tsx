import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'NotebookFair — Research notebook workspace',
  description:
    'A private workspace for notebook classification, reproducibility, and optional public sharing.',
  openGraph: {
    title: 'NotebookFair',
    description: 'Private notebook analysis. Share when ready.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'NotebookFair research notebook workspace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NotebookFair',
    description: 'Private notebook analysis. Share when ready.',
    images: ['/og.png'],
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
