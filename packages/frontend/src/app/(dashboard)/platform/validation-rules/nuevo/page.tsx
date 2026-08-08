'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  fieldsMetadata: {
    sections: Array<{ sectionName: string; fields: string[] }>;
  };
}

interface FieldGroup {
  pattern: string;
  sample: string;
  count: number;
  allFields: string[];
}

interface SectionState {
  sectionName: string;
  enabled: boolean;
  sectionPattern: string;
  patternConfig: string;
  fieldOverrides: FieldOverrideState[];
  uniqueFields: string[];
  fieldGroups: FieldGroup[];
}

interface FieldOverrideState {
  fieldName: string;
  transferFunction: string;
  config: string;
  appliesToGroup?: string; // pattern name if applies to a group
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PATTERNS = ['identity', 'required_all', 'numeric_range', 'readonly', 'conditional'];
const PATTERN_LABELS: Record<string, string> = {
  identity: 'Identidad (sin validación)',
  required_all: 'Todos obligatorios',
  numeric_range: 'Rango numérico',
  readonly: 'Solo lectura',
  conditional: 'Condicional',
};
const TRANSFER_FUNCTIONS = ['identity', 'required', 'range', 'pattern', 'transform', 'lookup', 'computed'];
const TF_LABELS: Record<string, string> = {
  identity: 'Identidad (skip)',
  required: 'Obligatorio',
  range: 'Rango numérico',
  pattern: 'Patrón (regex)',
  transform: 'Transformación',
  lookup: 'Lista permitida',
  computed: 'Calculado',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detects repetitive field patterns like punto_1_area, punto_2_area → punto_{N}_area
 * Returns unique fields and grouped fields.
 */
function groupFields(fields: string[]): { uniqueFields: string[]; fieldGroups: FieldGroup[] } {
  const groups: Map<string, { sample: string; allFields: string[] }> = new Map();
  const unique: string[] = [];

  // Detect numeric patterns: replace digits with {N}
  const patternMap: Map<string, string[]> = new Map();

  for (const field of fields) {
    const pattern = field.replace(/\d+/g, '{N}');
    if (pattern !== field && pattern.includes('{N}')) {
      if (!patternMap.has(pattern)) patternMap.set(pattern, []);
      patternMap.get(pattern)!.push(field);
    }
  }

  // Groups with 3+ fields are "repetitive"
  const groupedFieldNames = new Set<string>();
  for (const [pattern, fieldList] of patternMap) {
    if (fieldList.length >= 3) {
      groups.set(pattern, { sample: fieldList[0], allFields: fieldList });
      for (const f of fieldList) groupedFieldNames.add(f);
    }
  }

  // Everything not in a group is unique
  for (const field of fields) {
    if (!groupedFieldNames.has(field)) {
      unique.push(field);
    }
  }

  const fieldGroups: FieldGroup[] = Array.from(groups.entries()).map(([pattern, data]) => ({
    pattern,
    sample: data.sample,
    count: data.allFields.length,
    allFields: data.allFields,
  }));

  return { uniqueFields: unique, fieldGroups };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NuevaReglaPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);

  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<SectionState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load templates and auto-select from query param
  const searchParams = useSearchParams();
  useEffect(() => {
    api<FormTemplate[]>('/api/form-templates/all').then((data) => {
      setTemplates(data);
      // Auto-select if form_type is in query params
      const formTypeParam = searchParams.get('form_type');
      if (formTypeParam) {
        const match = data.find((t) => t.formType === formTypeParam);
        if (match) setSelectedTemplateId(match.id);
      }
    }).catch(() => {});
  }, [searchParams]);

  // When template is selected, build sections from metadata
  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      setSections([]);
      return;
    }

    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;

    setSelectedTemplate(tmpl);

    const sectionStates: SectionState[] = (tmpl.fieldsMetadata?.sections || []).map((s, idx) => {
      const { uniqueFields, fieldGroups } = groupFields(s.fields);
      return {
        sectionName: s.sectionName,
        enabled: false,
        sectionPattern: 'required_all',
        patternConfig: '{}',
        fieldOverrides: [],
        uniqueFields,
        fieldGroups,
      };
    });

    setSections(sectionStates);
  }, [selectedTemplateId, templates]);

  // Section toggle
  const toggleSection = (idx: number) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s));
  };

  // Section pattern change
  const updateSectionPattern = (idx: number, pattern: string) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, sectionPattern: pattern } : s));
  };

  const updateSectionConfig = (idx: number, config: string) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, patternConfig: config } : s));
  };

  // Field override management
  const addFieldOverride = (sectionIdx: number, fieldName: string, groupPattern?: string) => {
    setSections(sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        fieldOverrides: [...s.fieldOverrides, {
          fieldName,
          transferFunction: 'required',
          config: '{}',
          appliesToGroup: groupPattern,
        }],
      };
    }));
  };

  const removeFieldOverride = (sectionIdx: number, foIdx: number) => {
    setSections(sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return { ...s, fieldOverrides: s.fieldOverrides.filter((_, j) => j !== foIdx) };
    }));
  };

  const updateFieldOverride = (sectionIdx: number, foIdx: number, field: string, value: string) => {
    setSections(sections.map((s, i) => {
      if (i !== sectionIdx) return s;
      return {
        ...s,
        fieldOverrides: s.fieldOverrides.map((fo, j) => j === foIdx ? { ...fo, [field]: value } : fo),
      };
    }));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const enabledSections = sections.filter((s) => s.enabled);
    if (enabledSections.length === 0) {
      setError('Debe activar al menos una sección');
      return;
    }

    setSubmitting(true);
    try {
      const parsedSections = enabledSections.map((s) => {
        let patternConfig = {};
        try { patternConfig = JSON.parse(s.patternConfig); } catch { /* empty */ }

        const fieldOverrides = s.fieldOverrides.map((fo) => {
          let config = {};
          try { config = JSON.parse(fo.config); } catch { /* empty */ }
          return { fieldName: fo.fieldName, transferFunction: fo.transferFunction, config };
        });

        return {
          sectionName: s.sectionName,
          pattern: s.sectionPattern,
          patternConfig,
          fieldOverrides,
        };
      });

      await api('/api/validation-rules', {
        method: 'POST',
        body: JSON.stringify({
          form_type: selectedTemplate!.formType,
          name: ruleName,
          description: description || undefined,
          sections: parsedSections,
        }),
      });

      router.push('/platform/validation-rules');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(`Ya existe una regla con ese nombre para este form_type`);
      } else {
        setError(err instanceof Error ? err.message : 'Error al crear regla');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nueva Regla de Validación</h1>
        <p className="text-sm text-gray-500 mt-1">Selecciona un template y activa las secciones que deseas validar</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{error}</div>
        )}

        {/* Template + Rule Name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Formulario Padre</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.formType} — {t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la regla</label>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              required
              placeholder="ej: Campos obligatorios sección identificación"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe brevemente qué valida esta regla"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sections from template */}
        {selectedTemplate && sections.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Secciones del template ({sections.length})
            </label>

            <div className="space-y-3">
              {sections.map((section, sIdx) => (
                <div
                  key={sIdx}
                  className={`border rounded-lg p-4 transition-colors ${
                    section.enabled ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  {/* Section header with checkbox */}
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={() => toggleSection(sIdx)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className={`text-sm font-medium ${section.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                        <span className="text-xs text-gray-400 mr-1">{sIdx + 1}.</span>
                        {section.sectionName}
                      </span>
                    </label>
                    <span className="text-xs text-gray-400">
                      {section.uniqueFields.length + section.fieldGroups.reduce((a, g) => a + g.count, 0)} campos
                    </span>
                  </div>

                  {/* Section details (when enabled) */}
                  {section.enabled && (
                    <div className="ml-7 mt-3 space-y-3">
                      {/* Pattern selector */}
                      <div className="flex gap-3 items-center">
                        <select
                          value={section.sectionPattern}
                          onChange={(e) => updateSectionPattern(sIdx, e.target.value)}
                          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                        >
                          {PATTERNS.map((p) => (
                            <option key={p} value={p}>{PATTERN_LABELS[p]}</option>
                          ))}
                        </select>
                        {(section.sectionPattern === 'numeric_range' || section.sectionPattern === 'conditional') && (
                          <input
                            type="text"
                            value={section.patternConfig}
                            onChange={(e) => updateSectionConfig(sIdx, e.target.value)}
                            placeholder='{"min": 0, "max": 100000}'
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </div>

                      {/* Unique fields */}
                      {section.uniqueFields.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Campos únicos:</p>
                          <div className="flex flex-wrap gap-1">
                            {section.uniqueFields.map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => addFieldOverride(sIdx, f)}
                                className="inline-flex px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700 transition-colors cursor-pointer"
                                title="Click para agregar override"
                              >
                                {f}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Field groups (repetitive) */}
                      {section.fieldGroups.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Campos repetitivos (adoptan regla del campo muestra):</p>
                          <div className="space-y-1">
                            {section.fieldGroups.map((g) => (
                              <div key={g.pattern} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => addFieldOverride(sIdx, g.sample, g.pattern)}
                                  className="inline-flex px-2 py-0.5 text-xs rounded bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors cursor-pointer"
                                  title="Click para agregar override al grupo"
                                >
                                  {g.sample}
                                </button>
                                <span className="text-xs text-gray-400">
                                  → aplica a {g.count} campos ({g.pattern})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Field overrides */}
                      {section.fieldOverrides.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs font-medium text-purple-700 mb-2">Overrides de campo:</p>
                          {section.fieldOverrides.map((fo, foIdx) => (
                            <div key={foIdx} className="flex gap-2 mb-2 items-center">
                              <span className="text-xs text-gray-600 min-w-[120px] truncate" title={fo.fieldName}>
                                {fo.fieldName}
                                {fo.appliesToGroup && (
                                  <span className="text-orange-500 ml-1">(grupo)</span>
                                )}
                              </span>
                              <select
                                value={fo.transferFunction}
                                onChange={(e) => updateFieldOverride(sIdx, foIdx, 'transferFunction', e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                              >
                                {TRANSFER_FUNCTIONS.map((tf) => (
                                  <option key={tf} value={tf}>{TF_LABELS[tf]}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={fo.config}
                                onChange={(e) => updateFieldOverride(sIdx, foIdx, 'config', e.target.value)}
                                placeholder='{"regex": "..."}'
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => removeFieldOverride(sIdx, foIdx)}
                                className="text-red-500 hover:text-red-700 text-sm px-1"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No template selected */}
        {!selectedTemplate && (
          <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
            Selecciona un Formulario Padre para ver sus secciones y campos
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting || !selectedTemplate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Creando...' : 'Crear Regla'}
          </button>
          <Link href="/platform/validation-rules" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
