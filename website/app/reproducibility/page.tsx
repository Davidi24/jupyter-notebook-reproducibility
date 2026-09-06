'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReproducibilityPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analysis?tab=reproducibility');
  }, [router]);

  return null;
}
