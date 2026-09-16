'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

export function MainContentWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMapPage = pathname === '/map';

  return (
    <main
      className={`flex-1 min-w-0 ${
        isMapPage
          ? 'overflow-hidden p-0 relative flex flex-col h-full'
          : 'overflow-y-auto p-6'
      }`}
    >
      {children}
    </main>
  );
}
