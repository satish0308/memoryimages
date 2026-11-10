import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { AppShell } from '@/components/layout/AppShell';
import { PwaManager } from '@/components/common/PwaManager';

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'MyMemoryPics - World-Class AI Photo Manager',
  description: 'AI-driven photo organization with smart triage, face recognition, and dual sync.',
  referrer: 'no-referrer',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MyMemoryPics',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-slate-50 text-slate-900 antialiased">
        <Providers>
          <AppShell>
            {children}
          </AppShell>
          <PwaManager />
        </Providers>
      </body>
    </html>
  );
}
