'use client';

import Link from 'next/link';
import { stateLabels } from '@/lib/states';

interface Attempt {
  id: string;
  attempt: number;
  state: string;
  createdAt: string;
}

interface AttemptChainProps {
  attempts: Attempt[];
  currentId: string;
}

export default function AttemptChain({ attempts, currentId }: AttemptChainProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Cadena de intentos</h3>
      <div className="flex flex-wrap gap-2">
        {attempts.map((a) => (
          <Link
            key={a.id}
            href={`/kanban/${a.id}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              a.id === currentId
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            #{a.attempt} - {stateLabels[a.state] || a.state}
          </Link>
        ))}
      </div>
    </div>
  );
}
