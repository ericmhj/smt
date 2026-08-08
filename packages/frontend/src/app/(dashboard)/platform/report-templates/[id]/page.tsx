'use client';

import { useParams } from 'next/navigation';
import { SectionBuilder } from '../components/SectionBuilder';

export default function EditTemplatePage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar Template de Reporte</h1>
        <p className="text-sm text-gray-500 mt-1">
          Modifica las secciones y configuración del template
        </p>
      </div>
      <SectionBuilder mode="edit" templateId={id} />
    </div>
  );
}
