'use client';

import { useState } from 'react';
import SignaturePreview from './SignaturePreview';

interface SignatureUploadProps {
  onUpload: (dataUrl: string) => void;
}

export default function SignatureUpload({ onUpload }: SignatureUploadProps) {
  const [preview, setPreview] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      onUpload(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setPreview('');
    onUpload('');
  };

  return (
    <div>
      {preview ? (
        <SignaturePreview dataUrl={preview} onClear={handleClear} />
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="signature-upload"
          />
          <label
            htmlFor="signature-upload"
            className="cursor-pointer text-sm text-blue-600 hover:text-blue-800"
          >
            Seleccionar imagen de firma
          </label>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG o SVG</p>
        </div>
      )}
    </div>
  );
}
