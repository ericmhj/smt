'use client';

import { useState } from 'react';

interface HTMLEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function HTMLEditor({ value, onChange }: HTMLEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-700">Contenido HTML</label>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {showPreview ? 'Editar' : 'Vista previa'}
        </button>
      </div>

      {showPreview ? (
        <div className="border border-gray-300 rounded-md p-4 min-h-[200px] bg-white">
          <div dangerouslySetInnerHTML={{ __html: value }} />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          required
          placeholder="<form>&#10;  <label>Campo 1</label>&#10;  <input type='text' name='campo1' />&#10;</form>"
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );
}
