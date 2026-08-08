'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FieldOverrideForm {
  fieldName: string;
  transferFunction: string;
  config: string;
}

interface SectionForm {
  sectionName: string;
  pattern: string;
  patternConfig: string;
  fieldOverrides: FieldOverrideForm[];
}

interface ValidationRule {
  id: string;
  formType: string;
  name: string;
  description: string | null;
  sections: Array<{
    sectionName: string;
    pattern: string;
    patternConfig: Record<string, unknown>;
    fieldOverrides?: Array<{ fieldName: string; transferFunction: string; config: Record<string, unknown> }>;
  }>;
}

const PATTERNS = ['identity', 'required_all', 'numeric_range', 'readonly', 'conditional'];
const TRANSFER_FUNCTIONS = ['identity', 'required', 'range', 'pattern', 'transform', 'lookup', 'computed'];

export default function EditarReglaPage() {
  const params = useParams();
  const router = useRouter();
  const [formType, setFormType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRule = async () => {
      try {
        const rule = await api<ValidationRule>(`/api/validation-rules/${params.id}`);
        setFormType(rule.formType);
        setName(rule.name);
        setDescription(rule.description || '');
        setSections(
          rule.sections.map((s) => ({
            sectionName: s.sectionName,
            pattern: s.pattern,
            patternConfig: JSON.stringify(s.patternConfig || {}, null, 2),
            fieldOverrides: (s.fieldOverrides || []).map((fo) => ({
              fieldName: fo.fieldName,
              transferFunction: fo.transferFunction,
              config: JSON.stringify(fo.config || {}, null, 2),
            })),
          })),
        );
      } catch {
        setError('Regla no encontrada');
      } finally {
        setLoading(false);
      }
    };
    fetchRule();
  }, [params.id]);

  const addSection = () => {
    setSections([...sections, { sectionName: '', pattern: 'required_all', patternConfig: '{}', fieldOverrides: [] }]);
  };

  const removeSection = (idx: number) => {
    setSections(sections.filter((_, i) => i !== idx));
  };

  const updateSection = (idx: number, field: string, value: string) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addFieldOverride = (sectionIdx: number) => {
    setSections(sections.map((s, i) =>
      i === sectionIdx
        ? { ...s, fieldOverrides: [...s.fieldOverrides, { fieldName: '', transferFunction: 'required', config: '{}' }] }
        : s
    ));
  };

  const removeFieldOverride = (sectionIdx: number, foIdx: number) => {
    setSections(sections.map((s, i) =>
      i === sectionIdx
        ? { ...s, fieldOverrides: s.fieldOverrides.filter((_, j) => j !== foIdx) }
        : s
    ));
  };

  const updateFieldOverride = (sectionIdx: number, foIdx: number, field: string, value: string) => {
    setSections(sections.map((s, i) =>
      i === sectionIdx
        ? { ...s, fieldOverrides: s.fieldOverrides.map((fo, j) => j === foIdx ? { ...fo, [field]: value } : fo) }
        : s
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const parsedSections = sections.map((s) => {
        let patternConfig = {};
        try { patternConfig = JSON.parse(s.patternConfig); } catch { /* empty */ }
        const fieldOverrides = s.fieldOverrides.map((fo) => {
          let config = {};
          try { config = JSON.parse(fo.config); } catch { /* empty */ }
          return { fieldName: fo.fieldName, transferFunction: fo.transferFunction, config };
        });
        return { sectionName: s.sectionName, pattern: s.pattern, patternConfig, fieldOverrides };
      });

      await api(`/api/validation-rules/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          form_type: formType,
          name,
          description: description || undefined,
          sections: parsedSections,
        }),
      });

      router.push('/platform/validation-rules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar regla');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-gray-500">Cargando regla...</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Editar Regla de Validación</h1>
        <p className="text-sm text-gray-500 mt-1">Modificar la definición de la regla global</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de formulario</label>
            <input
              type="text"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">Secciones</label>
            <button type="button" onClick={addSection} className="text-sm text-blue-600 hover:text-blue-800">
              + Agregar sección
            </button>
          </div>

          <div className="space-y-4">
            {sections.map((section, sIdx) => (
              <div key={sIdx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-500 uppercase">Sección {sIdx + 1}</span>
                  {sections.length > 1 && (
                    <button type="button" onClick={() => removeSection(sIdx)} className="text-xs text-red-500 hover:text-red-700">
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Nombre de sección</label>
                    <input
                      type="text"
                      value={section.sectionName}
                      onChange={(e) => updateSection(sIdx, 'sectionName', e.target.value)}
                      required
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Patrón</label>
                    <select
                      value={section.pattern}
                      onChange={(e) => updateSection(sIdx, 'pattern', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {PATTERNS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Config (JSON)</label>
                    <input
                      type="text"
                      value={section.patternConfig}
                      onChange={(e) => updateSection(sIdx, 'patternConfig', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Field Overrides */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Overrides de campo</span>
                    <button type="button" onClick={() => addFieldOverride(sIdx)} className="text-xs text-purple-600 hover:text-purple-800">
                      + Campo
                    </button>
                  </div>
                  {section.fieldOverrides.map((fo, foIdx) => (
                    <div key={foIdx} className="flex gap-2 mb-2 items-center">
                      <input
                        type="text"
                        value={fo.fieldName}
                        onChange={(e) => updateFieldOverride(sIdx, foIdx, 'fieldName', e.target.value)}
                        placeholder="campo"
                        required
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                      />
                      <select
                        value={fo.transferFunction}
                        onChange={(e) => updateFieldOverride(sIdx, foIdx, 'transferFunction', e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs"
                      >
                        {TRANSFER_FUNCTIONS.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                      </select>
                      <input
                        type="text"
                        value={fo.config}
                        onChange={(e) => updateFieldOverride(sIdx, foIdx, 'config', e.target.value)}
                        placeholder='{"regex": "..."}'
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                      />
                      <button type="button" onClick={() => removeFieldOverride(sIdx, foIdx)} className="text-red-500 hover:text-red-700 text-sm">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Actualizando...' : 'Actualizar Regla'}
          </button>
          <Link href="/platform/validation-rules" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
