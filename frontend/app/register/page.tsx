'use client';

import React, { Suspense } from 'react';
import { AuthView } from '@/components/auth/AuthView';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <AuthView initialTab="register" />
    </Suspense>
  );
}
