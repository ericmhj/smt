'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type SectionPattern = 'identity' | 'required_all' | 'numeric_range' | 'readonly' | 'conditional';
type FieldTransferFunction = 'identity' | 'required' | 'range' | 'pattern' | 'transform' | 'lookup' | 'computed';

interface FieldOverride {
  fieldName: string;
  transferFunction: FieldTransferFunction;
  config: Record<string, unknown>;
}

interface RuleSection {
  sectionName: string;
  pattern: SectionPattern;
  patternConfig: Record<string, unknown>;
  fieldOverrides?: FieldOverride[];
}

interface EffectiveRule {
  id: string;
  name: string;
  source: 'global' | 'custom';
  sections: RuleSection[];
  description?: string;
}

interface RuleOverride {
  id: string;
  formId: string;
  ruleTemplateId: string | null;
  overrideType: 'deactivate' | 'custom';
  customRule: RuleSection[] | null;
  createdBy: string;
  createdAt: string;
}

interface ValidationRulesTabProps {
  formId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<SectionPattern, string> = {
  identity: 'Identidad (sin validación)',
  required_all: 'Todos obligatorios',
  numeric_range: 'Rango numérico',
  readonly: 'Solo lectura',
  conditional: 'Condicional',
};

const TRANSFER_FUNCTION_LABELS: Record<FieldTransferFunction, string> = {
  identity: 'Identidad',
  required: 'Obligatorio',
  range: 'Rango',
  pattern: 'Patrón (regex)',
  transform: 'Transformación',
  lookup: 'Lista permitida',
  computed: 'Calculado',
};

// ─── Custom Rule Form State ──────────────────────────────────────────────────

interface CustomRuleFormState {
  sectionName: string;
  pattern: SectionPattern;
  patternConfig: string;
  fieldOverrides: {
    fieldName: string;
    transferFunction: FieldTransferFunction;
    config: string;
  }[];
}

const EMPTY_CUSTOM_RULE_FORM: CustomRuleFormState = {
  sectionName: '',
  pattern: 'required_all',
  patternConfig: '{}',
  fieldOverrides: [],
};


// ─── Main Component ──────────────────────────────────────────────────────────

export default function ValidationRulesTab({ formId }: ValidationRulesTabProps) {
  const [effectiveRules, setEffectiveRules] = useState<EffectiveRule[]>([]);
  const [overrides, setOverrides] = useState<RuleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState<CustomRuleFormState>(EMPTY_CUSTOM_RULE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesData, overridesData] = await Promise.all([
        api<EffectiveRule[]>(`/api/forms/${formId}/effective-rules`),
        api<RuleOverride[]>(`/api/forms/${formId}/validation-overrides`),
      ]);
      setEffectiveRules(rulesData);
      setOverrides(overridesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reglas de validación');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [formId]);

  // ─── Deactivation Helpers ────────────────────────────────────────────────

  const getDeactivationOverrideId = (ruleId: string): string | null => {
    const override = overrides.find(
      (o) => o.overrideType === 'deactivate' && o.ruleTemplateId === ruleId,
    );
    return override?.id || null;
  };

  // ─── Toggle Deactivation ────────────────────────────────────────────────

  const handleToggleRule = async (ruleId: string) => {
    const existingOverrideId = getDeactivationOverrideId(ruleId);

    try {
      if (existingOverrideId) {
        // Re-activate: delete the deactivation override
        await api(`/api/forms/${formId}/validation-overrides/${existingOverrideId}`, {
          method: 'DELETE',
        });
        showNotification('success', 'Regla reactivada correctamente');
      } else {
        // Deactivate: create a deactivation override
        await api(`/api/forms/${formId}/validation-overrides`, {
          method: 'POST',
          body: JSON.stringify({
            override_type: 'deactivate',
            rule_template_id: ruleId,
          }),
        });
        showNotification('success', 'Regla desactivada correctamente');
      }
      await fetchData();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error al actualizar regla');
    }
  };

  // ─── Delete Custom Rule ─────────────────────────────────────────────────

  const handleDeleteCustomRule = async (overrideId: string) => {
    if (!confirm('¿Eliminar esta regla personalizada?')) return;

    try {
      await api(`/api/forms/${formId}/validation-overrides/${overrideId}`, {
        method: 'DELETE',
      });
      showNotification('success', 'Regla personalizada eliminada');
      await fetchData();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error al eliminar regla');
    }
  };

  // ─── Submit Custom Rule ─────────────────────────────────────────────────

  const handleSubmitCustomRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      let patternConfig: Record<string, unknown> = {};
      try {
        patternConfig = JSON.parse(customForm.patternConfig);
      } catch {
        showNotification('error', 'El JSON de configuración del patrón no es válido');
        setSubmitting(false);
        return;
      }

      const fieldOverrides: FieldOverride[] = customForm.fieldOverrides.map((fo) => {
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(fo.config);
        } catch {
          throw new Error(`JSON inválido en configuración del campo "${fo.fieldName}"`);
        }
        return {
          fieldName: fo.fieldName,
          transferFunction: fo.transferFunction,
          config,
        };
      });

      const customRule: RuleSection[] = [
        {
          sectionName: customForm.sectionName,
          pattern: customForm.pattern,
          patternConfig,
          fieldOverrides,
        },
      ];

      await api(`/api/forms/${formId}/validation-overrides`, {
        method: 'POST',
        body: JSON.stringify({
          override_type: 'custom',
          custom_rule: customRule,
        }),
      });

      showNotification('success', 'Regla personalizada creada correctamente');
      setCustomForm(EMPTY_CUSTOM_RULE_FORM);
      setShowCustomForm(false);
      await fetchData();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Error al crear regla');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Field Override Management ──────────────────────────────────────────

  const addFieldOverride = () => {
    setCustomForm((prev) => ({
      ...prev,
      fieldOverrides: [
        ...prev.fieldOverrides,
        { fieldName: '', transferFunction: 'required', config: '{}' },
      ],
    }));
  };

  const removeFieldOverride = (index: number) => {
    setCustomForm((prev) => ({
      ...prev,
      fieldOverrides: prev.fieldOverrides.filter((_, i) => i !== index),
    }));
  };

  const updateFieldOverride = (index: number, field: string, value: string) => {
    setCustomForm((prev) => ({
      ...prev,
      fieldOverrides: prev.fieldOverrides.map((fo, i) =>
        i === index ? { ...fo, [field]: value } : fo,
      ),
    }));
  };

  // ─── Notification ───────────────────────────────────────────────────────

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // ─── Derived Data ───────────────────────────────────────────────────────

  // Separate effective rules (currently active) from deactivated ones
  const deactivatedRuleIds = overrides
    .filter((o) => o.overrideType === 'deactivate')
    .map((o) => o.ruleTemplateId);

  const customOverrides = overrides.filter((o) => o.overrideType === 'custom');

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">Cargando reglas de validación...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Reglas de Validación</h2>
        <button
          onClick={() => setShowCustomForm(!showCustomForm)}
          className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition-colors"
        >
          {showCustomForm ? 'Cancelar' : 'Agregar regla personalizada'}
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`p-3 rounded-md text-sm ${
            notification.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Custom Rule Form */}
      {showCustomForm && (
        <div className="bg-white border border-purple-200 rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-medium text-purple-800 mb-3">Nueva regla personalizada</h3>
          <form onSubmit={handleSubmitCustomRule} className="space-y-4">
            {/* Section Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nombre de sección
              </label>
              <input
                type="text"
                value={customForm.sectionName}
                onChange={(e) => setCustomForm((p) => ({ ...p, sectionName: e.target.value }))}
                placeholder="e.g., mediciones"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Pattern Select */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Patrón de sección
              </label>
              <select
                value={customForm.pattern}
                onChange={(e) => setCustomForm((p) => ({ ...p, pattern: e.target.value as SectionPattern }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
              >
                {(Object.keys(PATTERN_LABELS) as SectionPattern[]).map((p) => (
                  <option key={p} value={p}>{PATTERN_LABELS[p]}</option>
                ))}
              </select>
            </div>

            {/* Pattern Config */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Configuración del patrón (JSON)
              </label>
              <input
                type="text"
                value={customForm.patternConfig}
                onChange={(e) => setCustomForm((p) => ({ ...p, patternConfig: e.target.value }))}
                placeholder='{"min": 0, "max": 100}'
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Field Overrides */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">
                  Overrides de campo (opcional)
                </label>
                <button
                  type="button"
                  onClick={addFieldOverride}
                  className="text-xs text-purple-600 hover:text-purple-800"
                >
                  + Agregar campo
                </button>
              </div>
              {customForm.fieldOverrides.map((fo, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-start">
                  <input
                    type="text"
                    value={fo.fieldName}
                    onChange={(e) => updateFieldOverride(idx, 'fieldName', e.target.value)}
                    placeholder="campo"
                    required
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                  />
                  <select
                    value={fo.transferFunction}
                    onChange={(e) => updateFieldOverride(idx, 'transferFunction', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs"
                  >
                    {(Object.keys(TRANSFER_FUNCTION_LABELS) as FieldTransferFunction[]).map((tf) => (
                      <option key={tf} value={tf}>{TRANSFER_FUNCTION_LABELS[tf]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={fo.config}
                    onChange={(e) => updateFieldOverride(idx, 'config', e.target.value)}
                    placeholder='{"regex": "..."}'
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeFieldOverride(idx)}
                    className="text-red-500 hover:text-red-700 text-sm px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Submit */}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Guardando...' : 'Guardar regla'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCustomForm(false); setCustomForm(EMPTY_CUSTOM_RULE_FORM); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Effective Rules List */}
      {effectiveRules.length === 0 && customOverrides.length === 0 && deactivatedRuleIds.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No hay reglas de validación configuradas para este formulario.
        </div>
      )}

      {/* Active Rules */}
      {effectiveRules.length > 0 && (
        <div className="space-y-3">
          {effectiveRules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              isDeactivated={false}
              onToggle={rule.source === 'global' ? () => handleToggleRule(rule.id) : undefined}
              onDelete={rule.source === 'custom'
                ? () => {
                    const customOverride = customOverrides.find((o) => o.id === rule.id);
                    if (customOverride) handleDeleteCustomRule(customOverride.id);
                  }
                : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Deactivated Rules Section */}
      {deactivatedRuleIds.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Reglas desactivadas</h3>
          <div className="space-y-3 opacity-60">
            {deactivatedRuleIds.map((ruleTemplateId) => {
              if (!ruleTemplateId) return null;
              return (
                <div
                  key={ruleTemplateId}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 line-through">
                      Regla global desactivada (ID: {ruleTemplateId.slice(0, 8)}...)
                    </span>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      Global
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={false}
                    onChange={() => handleToggleRule(ruleTemplateId)}
                    label="Reactivar"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: EffectiveRule;
  isDeactivated: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
}

function RuleCard({ rule, isDeactivated, onToggle, onDelete }: RuleCardProps) {
  return (
    <div
      className={`bg-white border rounded-lg p-4 shadow-sm ${
        isDeactivated ? 'border-gray-200 opacity-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-800">{rule.name}</h4>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              rule.source === 'global'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-purple-100 text-purple-800'
            }`}
          >
            {rule.source === 'global' ? 'Global' : 'Personalizada'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onToggle && (
            <ToggleSwitch
              checked={!isDeactivated}
              onChange={onToggle}
              label={isDeactivated ? 'Activar' : 'Desactivar'}
            />
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-red-500 hover:text-red-700 text-sm p-1"
              title="Eliminar regla personalizada"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {rule.description && (
        <p className="text-xs text-gray-500 mb-2">{rule.description}</p>
      )}

      {/* Sections/Fields Info */}
      <div className="space-y-1">
        {rule.sections.map((section, idx) => (
          <div key={idx} className="text-xs text-gray-600">
            <span className="font-medium">{section.sectionName}</span>
            <span className="text-gray-400 mx-1">·</span>
            <span className="text-gray-500">{PATTERN_LABELS[section.pattern]}</span>
            {section.fieldOverrides && section.fieldOverrides.length > 0 && (
              <span className="text-gray-400 ml-1">
                ({section.fieldOverrides.length} campo{section.fieldOverrides.length > 1 ? 's' : ''} con override)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Toggle Switch ───────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
}

function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <label className="inline-flex items-center cursor-pointer gap-2">
      {label && <span className="text-xs text-gray-500">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
