'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClassificationsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/analysis?tab=classifications');
  }, [router]);

  return null;
}
