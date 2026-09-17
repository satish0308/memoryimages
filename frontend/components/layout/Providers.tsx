'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { TaskQueueProvider } from '@/context/TaskQueueContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TaskQueueProvider>
        {children}
      </TaskQueueProvider>
    </AuthProvider>
  );
}
