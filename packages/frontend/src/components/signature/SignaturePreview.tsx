'use client';

interface SignaturePreviewProps {
  dataUrl: string;
  onClear: () => void;
}

export default function SignaturePreview({ dataUrl, onClear }: SignaturePreviewProps) {
  return (
    <div className="border border-gray-300 rounded-md p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">Vista previa de firma</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-red-600 hover:text-red-800"
        >
          Eliminar
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="Firma"
        className="max-h-24 mx-auto border border-gray-200 rounded bg-white p-1"
      />
    </div>
  );
}
