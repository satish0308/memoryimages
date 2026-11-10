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
          : 'overflow-y-auto p-3 sm:p-6 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:pb-6 momentum-scroll'
      }`}
    >
      {children}
    </main>
  );
}
