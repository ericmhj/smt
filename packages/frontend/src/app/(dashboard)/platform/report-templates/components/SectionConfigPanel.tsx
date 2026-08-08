'use client';

import type { TemplateSection } from './SectionBuilder';

interface SectionConfigPanelProps {
  section: TemplateSection;
  onUpdate: (updates: Partial<TemplateSection>) => void;
}

export function SectionConfigPanel({ section, onUpdate }: SectionConfigPanelProps) {
  const updateConfig = (key: string, value: unknown) => {
    onUpdate({ config: { ...section.config, [key]: value } });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase">Configuración</h3>

      {/* Title */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">Título</label>
        <input
          type="text"
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
        />
      </div>

      {/* Type-specific config */}
      {section.type === 'static' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">Contenido</label>
          <textarea
            value={(section.config.content as string) || ''}
            onChange={(e) => updateConfig('content', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            rows={4}
            placeholder="Texto de la portada o sección fija..."
          />
        </div>
      )}

      {section.type === 'form_content' && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showEmptyFields"
            checked={(section.config.showEmptyFields as boolean) || false}
            onChange={(e) => updateConfig('showEmptyFields', e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="showEmptyFields" className="text-xs text-gray-700">
            Mostrar campos vacíos
          </label>
        </div>
      )}

      {section.type === 'signatures' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Roles (uno por línea)
          </label>
          <textarea
            value={((section.config.roles as string[]) || []).join('\n')}
            onChange={(e) =>
              updateConfig(
                'roles',
                e.target.value.split('\n').filter((r) => r.trim()),
              )
            }
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            rows={3}
            placeholder="Técnico&#10;Supervisor&#10;Director"
          />
        </div>
      )}

      {section.type === 'custom_html' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">HTML</label>
          <textarea
            value={(section.config.htmlContent as string) || ''}
            onChange={(e) => updateConfig('htmlContent', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
            rows={5}
            placeholder="<p>Contenido HTML...</p>"
          />
        </div>
      )}

      {(section.type === 'observations' || section.type === 'state_history') && (
        <p className="text-xs text-gray-400 italic">
          Esta sección se renderiza automáticamente con datos del reactivo.
        </p>
      )}
    </div>
  );
}
