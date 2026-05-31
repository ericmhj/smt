'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ReapplyButtonProps {
  assignmentId: string;
  onSuccess?: () => void;
}

export default function ReapplyButton({ assignmentId, onSuccess }: ReapplyButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleReapply = () => {
    setLoading(true);
    // Navigate to fill form page for re-application
    router.push(`/my-forms/${assignmentId}/fill`);
    onSuccess?.();
    setLoading(false);
  };

  return (
    <button
      onClick={handleReapply}
      disabled={loading}
      className="text-xs text-orange-600 hover:text-orange-800 disabled:opacity-50"
    >
      Re-aplicar
    </button>
  );
}
