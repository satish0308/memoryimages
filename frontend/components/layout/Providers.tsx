'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { TaskQueueProvider } from '@/context/TaskQueueContext';
import { UploadProvider } from '@/context/UploadContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TaskQueueProvider>
        <UploadProvider>
          {children}
        </UploadProvider>
      </TaskQueueProvider>
    </AuthProvider>
  );
}
