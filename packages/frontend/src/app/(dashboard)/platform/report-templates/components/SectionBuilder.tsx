'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { SectionPalette } from './SectionPalette';
import { SectionList } from './SectionList';
import { SectionConfigPanel } from './SectionConfigPanel';
import { LivePreview } from './LivePreview';

export interface TemplateSection {
  id: string;
  type: 'static' | 'form_content' | 'signatures' | 'custom_html' | 'observations' | 'state_history';
  title: string;
  order: number;
  is_active: boolean;
  config: Record<string, unknown>;
}

interface SectionBuilderProps {
  mode: 'create' | 'edit';
  templateId?: string;
  initialFormType?: string;
  initialTenantSlug?: string;
  initialTenantFormId?: string;
  initialName?: string;
}

export function SectionBuilder({ mode, templateId, initialFormType, initialTenantSlug, initialTenantFormId, initialName }: SectionBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName || '');
  const [description, setDescription] = useState('');
  const [formType, setFormType] = useState(initialFormType || '');
  const [tenantSlug] = useState(initialTenantSlug || '');
  const [tenantFormId] = useState(initialTenantFormId || '');
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formTypes, setFormTypes] = useState<string[]>([]);

  // Load form types
  useEffect(() => {
    api<Array<{ formType: string }>>('/api/form-templates/all')
      .then((data) => {
        const types = [...new Set(data.map((t) => t.formType))];
        setFormTypes(types);
      })
      .catch(() => {});
  }, []);

  // Load existing template in edit mode
  useEffect(() => {
    if (mode === 'edit' && templateId) {
      api<{
        name: string;
        description: string | null;
        formType: string | null;
        sections: TemplateSection[];
      }>(`/api/report-templates/${templateId}`)
        .then((data) => {
          setName(data.name);
          setDescription(data.description || '');
          setFormType(data.formType || '');
          setSections(data.sections);
        })
        .catch((error) => {
          console.error('Error loading template:', error);
        });
    }
  }, [mode, templateId]);

  const addSection = useCallback((type: TemplateSection['type']) => {
    const newSection: TemplateSection = {
      id: crypto.randomUUID(),
      type,
      title: getDefaultTitle(type),
      order: sections.length,
      is_active: true,
      config: getDefaultConfig(type),
    };
    setSections((prev) => [...prev, newSection]);
    setSelectedSectionId(newSection.id);
  }, [sections.length]);

  const removeSection = useCallback((id: string) => {
    setSections((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, i) => ({ ...s, order: i }));
    });
    if (selectedSectionId === id) setSelectedSectionId(null);
  }, [selectedSectionId]);

  const reorderSections = useCallback((reordered: TemplateSection[]) => {
    setSections(reordered.map((s, i) => ({ ...s, order: i })));
  }, []);

  const updateSection = useCallback((id: string, updates: Partial<TemplateSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    );
  }, []);

  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;

  const handleSave = async () => {
    if (!name.trim()) {
      alert('El nombre es requerido');
      return;
    }
    if (sections.length === 0) {
      alert('Se requiere al menos una sección');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: description || undefined,
        form_type: formType || null,
        sections,
        tenant_slug: tenantSlug || null,
        tenant_form_id: tenantFormId || null,
      };

      if (mode === 'create') {
        await api('/api/report-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else {
        await api(`/api/report-templates/${templateId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }

      router.push('/platform/report-templates');
    } catch (error: any) {
      alert(error?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="Template NOM-035"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de formulario</label>
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value)}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 cursor-not-allowed opacity-70"
          >
            <option value="">Sin tipo (genérico)</option>
            {formTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder="Descripción opcional"
          />
        </div>
      </div>

      {/* Builder Layout */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: '600px' }}>
        {/* Left Panel: Palette + Sections List */}
        <div className="col-span-4 space-y-4">
          <SectionPalette onAdd={addSection} />
          <SectionList
            sections={sections}
            selectedId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onRemove={removeSection}
            onReorder={reorderSections}
            onToggle={(id) =>
              updateSection(id, {
                is_active: !sections.find((s) => s.id === id)?.is_active,
              })
            }
          />
          {selectedSection && (
            <SectionConfigPanel
              section={selectedSection}
              onUpdate={(updates) => updateSection(selectedSection.id, updates)}
            />
          )}
        </div>

        {/* Right Panel: Live Preview */}
        <div className="col-span-8">
          <LivePreview sections={sections} selectedSectionId={selectedSectionId} />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          onClick={() => router.push('/platform/report-templates')}
          className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : mode === 'create' ? 'Crear Template' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}

function getDefaultTitle(type: TemplateSection['type']): string {
  const titles: Record<string, string> = {
    cover_page: 'Carátula',
    static: 'Contenido Estático',
    form_content: 'Contenido del Formulario',
    signatures: 'Firmas de Autorización',
    custom_html: 'Contenido HTML',
    observations: 'Observaciones',
    state_history: 'Historial de Estados',
  };
  return titles[type] || 'Nueva Sección';
}

function getDefaultConfig(type: TemplateSection['type']): Record<string, unknown> {
  switch (type) {
    case 'cover_page':
      return { content: '', showDate: true, showTecnico: true };
    case 'static':
      return { content: '' };
    case 'form_content':
      return { showEmptyFields: false };
    case 'signatures':
      return { roles: ['Técnico', 'Supervisor'] };
    case 'custom_html':
      return { htmlContent: '' };
    case 'observations':
    case 'state_history':
      return {};
    default:
      return {};
  }
}
