'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  fieldsMetadata: { sections: Array<{ sectionName: string; fields: string[] }> };
}

interface CalcRuleForm {
  sectionName: string;
  scope: 'section' | 'per_row';
  rowPattern: string;
  enabled: boolean;
  rules: Array<{ targetField: string; formula: string; label: string; precision: string }>;
}

export default function NuevaReglaCalculoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<CalcRuleForm[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<FormTemplate[]>('/api/form-templates/all').then((data) => {
      setTemplates(data);
      const formTypeParam = searchParams.get('form_type');
      if (formTypeParam) {
        const match = data.find((t) => t.formType === formTypeParam);
        if (match) setSelectedTemplateId(match.id);
      }
    }).catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    if (!selectedTemplateId) { setSelectedTemplate(null); setSections([]); return; }
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;
    setSelectedTemplate(tmpl);
    setSections((tmpl.fieldsMetadata?.sections || []).map((s) => ({
      sectionName: s.sectionName,
      scope: 'section',
      rowPattern: '',
      enabled: false,
      rules: [{ targetField: '', formula: '', label: '', precision: '2' }],
    })));
  }, [selectedTemplateId, templates]);

  const toggleSection = (idx: number) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s));
  };

  const updateSection = (idx: number, field: string, value: string) => {
    setSections(sections.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addRule = (sIdx: number) => {
    setSections(sections.map((s, i) => i === sIdx
      ? { ...s, rules: [...s.rules, { targetField: '', formula: '', label: '', precision: '2' }] }
      : s
    ));
  };

  const removeRule = (sIdx: number, rIdx: number) => {
    setSections(sections.map((s, i) => i === sIdx
      ? { ...s, rules: s.rules.filter((_, j) => j !== rIdx) }
      : s
    ));
  };

  const updateRule = (sIdx: number, rIdx: number, field: string, value: string) => {
    setSections(sections.map((s, i) => i === sIdx
      ? { ...s, rules: s.rules.map((r, j) => j === rIdx ? { ...r, [field]: value } : r) }
      : s
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const enabled = sections.filter((s) => s.enabled);
    if (enabled.length === 0) { setError('Activa al menos una sección'); return; }

    setSubmitting(true);
    try {
      const calculations = enabled.map((s) => ({
        sectionName: s.sectionName,
        scope: s.scope,
        ...(s.scope === 'per_row' && s.rowPattern ? { rowPattern: s.rowPattern } : {}),
        rules: s.rules.filter((r) => r.targetField && r.formula).map((r) => ({
          targetField: r.targetField,
          formula: r.formula,
          label: r.label || undefined,
          precision: r.precision ? parseInt(r.precision, 10) : undefined,
        })),
      }));

      await api('/api/calculation-rules', {
        method: 'POST',
        body: JSON.stringify({
          form_type: selectedTemplate!.formType,
          name: ruleName,
          description: description || undefined,
          calculations,
        }),
      });
      router.push('/platform/calculation-rules');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Ya existe una regla con ese nombre');
      } else {
        setError(err instanceof Error ? err.message : 'Error al crear');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nueva Regla de Cálculo</h1>
        <p className="text-sm text-gray-500 mt-1">Define fórmulas que se computan automáticamente al llenar el formulario</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-md">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Formulario Padre</label>
            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500">
              <option value="">Seleccionar...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.formType} — {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la regla</label>
            <input type="text" value={ruleName} onChange={(e) => setRuleName(e.target.value)} required placeholder="ej: Cálculos de iluminancia" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" />
        </div>

        {selectedTemplate && sections.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Secciones ({sections.length})</label>
            <div className="space-y-3">
              {sections.map((section, sIdx) => (
                <div key={sIdx} className={`border rounded-lg p-4 ${section.enabled ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 bg-gray-50/50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={section.enabled} onChange={() => toggleSection(sIdx)} className="w-4 h-4 text-indigo-600 rounded" />
                      <span className={`text-sm font-medium ${section.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                        <span className="text-xs text-gray-400 mr-1">{sIdx + 1}.</span>{section.sectionName}
                      </span>
                    </label>
                  </div>

                  {section.enabled && (
                    <div className="ml-7 mt-3 space-y-3">
                      <div className="flex gap-3 items-center">
                        <select value={section.scope} onChange={(e) => updateSection(sIdx, 'scope', e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                          <option value="section">Toda la sección</option>
                          <option value="per_row">Por renglón (per_row)</option>
                        </select>
                        {section.scope === 'per_row' && (
                          <input type="text" value={section.rowPattern} onChange={(e) => updateSection(sIdx, 'rowPattern', e.target.value)} placeholder="ej: r{N}" className="px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
                        )}
                      </div>

                      {/* Rules */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-indigo-700">Fórmulas</span>
                          <button type="button" onClick={() => addRule(sIdx)} className="text-xs text-indigo-600 hover:text-indigo-800">+ Agregar fórmula</button>
                        </div>
                        {section.rules.map((rule, rIdx) => (
                          <div key={rIdx} className="flex gap-2 mb-2 items-center">
                            <input type="text" value={rule.targetField} onChange={(e) => updateRule(sIdx, rIdx, 'targetField', e.target.value)} placeholder="campo_destino" className="w-32 px-2 py-1 border border-gray-300 rounded text-xs font-mono" />
                            <span className="text-xs text-gray-400">=</span>
                            <input type="text" value={rule.formula} onChange={(e) => updateRule(sIdx, rIdx, 'formula', e.target.value)} placeholder="fieldA + fieldB" className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs font-mono" />
                            <input type="text" value={rule.label} onChange={(e) => updateRule(sIdx, rIdx, 'label', e.target.value)} placeholder="etiqueta" className="w-28 px-2 py-1 border border-gray-300 rounded text-xs" />
                            <input type="number" value={rule.precision} onChange={(e) => updateRule(sIdx, rIdx, 'precision', e.target.value)} placeholder="dec" className="w-12 px-2 py-1 border border-gray-300 rounded text-xs" min="0" max="10" />
                            <button type="button" onClick={() => removeRule(sIdx, rIdx)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedTemplate && (
          <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-300 rounded-lg">
            Selecciona un Formulario Padre para ver sus secciones
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button type="submit" disabled={submitting || !selectedTemplate} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm">
            {submitting ? 'Creando...' : 'Crear Regla de Cálculo'}
          </button>
          <Link href="/platform/calculation-rules" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
