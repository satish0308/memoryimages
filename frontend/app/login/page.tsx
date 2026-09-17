'use client';

import React, { Suspense } from 'react';
import { AuthView } from '@/components/auth/AuthView';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <AuthView initialTab="login" />
    </Suspense>
  );
}
