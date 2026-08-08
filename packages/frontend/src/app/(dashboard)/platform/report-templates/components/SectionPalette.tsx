'use client';

type SectionType = 'static' | 'form_content' | 'signatures' | 'custom_html' | 'observations' | 'state_history';

interface SectionPaletteProps {
  onAdd: (type: SectionType) => void;
}

const SECTION_TYPES: Array<{ type: SectionType; label: string; icon: string; description: string }> = [
  { type: 'static', label: 'Estático', icon: '📄', description: 'Texto fijo (portada, headers)' },
  { type: 'form_content', label: 'Contenido', icon: '📋', description: 'Campos del formulario' },
  { type: 'signatures', label: 'Firmas', icon: '✍️', description: 'Bloques de firma' },
  { type: 'custom_html', label: 'HTML', icon: '🔧', description: 'HTML personalizado' },
  { type: 'observations', label: 'Observaciones', icon: '💬', description: 'Notas del revisor' },
  { type: 'state_history', label: 'Historial', icon: '📊', description: 'Transiciones de estado' },
];

export function SectionPalette({ onAdd }: SectionPaletteProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Agregar sección</h3>
      <div className="grid grid-cols-2 gap-2">
        {SECTION_TYPES.map((st) => (
          <button
            key={st.type}
            onClick={() => onAdd(st.type)}
            className="flex items-center gap-2 px-2 py-2 text-left text-xs border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-200 transition-colors"
            title={st.description}
          >
            <span>{st.icon}</span>
            <span className="font-medium text-gray-700">{st.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
