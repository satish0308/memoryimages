'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { TaskQueueProvider } from '@/context/TaskQueueContext';
import { UploadProvider } from '@/context/UploadContext';
import { CastProvider } from '@/context/CastContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TaskQueueProvider>
        <UploadProvider>
          <CastProvider>
            {children}
          </CastProvider>
        </UploadProvider>
      </TaskQueueProvider>
    </AuthProvider>
  );
}
