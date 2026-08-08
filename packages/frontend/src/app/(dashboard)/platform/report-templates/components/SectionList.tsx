'use client';

import { useCallback } from 'react';
import type { TemplateSection } from './SectionBuilder';

interface SectionListProps {
  sections: TemplateSection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (sections: TemplateSection[]) => void;
  onToggle: (id: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  static: '📄',
  form_content: '📋',
  signatures: '✍️',
  custom_html: '🔧',
  observations: '💬',
  state_history: '📊',
};

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
  onToggle,
}: SectionListProps) {
  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const arr = [...sections];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      onReorder(arr);
    },
    [sections, onReorder],
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index === sections.length - 1) return;
      const arr = [...sections];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      onReorder(arr);
    },
    [sections, onReorder],
  );

  if (sections.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center text-sm text-gray-400">
        Agrega secciones desde la paleta superior
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <h3 className="text-xs font-semibold text-gray-500 uppercase px-3 py-2 bg-gray-50 border-b">
        Secciones ({sections.length})
      </h3>
      <div className="divide-y divide-gray-100">
        {sections.map((section, index) => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
              selectedId === section.id
                ? 'bg-blue-50 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-50'
            } ${!section.is_active ? 'opacity-50' : ''}`}
          >
            <span className="text-sm">{TYPE_ICONS[section.type] || '📄'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate">
                {section.title}
              </div>
              <div className="text-[10px] text-gray-400">{section.type}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); moveUp(index); }}
                disabled={index === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="Subir"
              >
                ↑
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveDown(index); }}
                disabled={index === sections.length - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                title="Bajar"
              >
                ↓
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(section.id); }}
                className={`text-xs px-1 rounded ${
                  section.is_active ? 'text-green-600' : 'text-red-500'
                }`}
                title={section.is_active ? 'Desactivar' : 'Activar'}
              >
                {section.is_active ? '●' : '○'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(section.id); }}
                className="text-red-400 hover:text-red-600 text-xs"
                title="Eliminar"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
