'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

interface ColorPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  neutral: string;
  background: string;
  text: string;
}

interface BaseTheme {
  id: string;
  name: string;
  description: string;
  category: string;
  preview: string;
}

interface PredefinedPalette {
  id: string;
  name: string;
  primary: string;
}

interface ThemeConfig {
  baseTheme: string;
  palette: ColorPalette;
  typography: {
    fontFamily: string;
    titleSize: number;
    bodySize: number;
    lineHeight: number;
  };
  layout: {
    margins: string;
    headerStyle: string;
    tableStyle: string;
    separator: string;
  };
  branding: {
    showLogo: boolean;
    logoUrl: string | null;
    logoPosition: string;
    showWatermark: boolean;
    watermarkText: string | null;
  };
  footer: {
    showPageNumbers: boolean;
    showDate: boolean;
    customText: string | null;
  };
}

interface ThemePanelProps {
  tenantSlug: string;
  activationId: string;
  formId?: string; // Used for auto-theme extraction
  currentThemeConfig: ThemeConfig | null;
  onSave: () => void;
  onClose: () => void;
}

// ─── Client-side palette generator ──────────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePaletteClientSide(primaryHex: string): ColorPalette {
  const hsl = hexToHSL(primaryHex);
  return {
    primary: primaryHex,
    primaryLight: hslToHex(hsl.h, hsl.s, Math.min(hsl.l + 20, 92)),
    primaryDark: hslToHex(hsl.h, hsl.s, Math.max(hsl.l - 20, 15)),
    secondary: hslToHex((hsl.h + 180) % 360, hsl.s * 0.7, hsl.l),
    accent: hslToHex((hsl.h + 30) % 360, hsl.s * 0.9, hsl.l),
    neutral: hslToHex(hsl.h, 10, 50),
    background: hslToHex(hsl.h, 5, 98),
    text: hslToHex(hsl.h, 10, 15),
  };
}

// ─── Predefined palettes (client-side, no API needed) ────────────────────────

const CLIENT_PALETTES: PredefinedPalette[] = [
  { id: 'blue', name: 'Azul Corporativo', primary: '#2563eb' },
  { id: 'navy', name: 'Azul Marino', primary: '#1e3a5f' },
  { id: 'teal', name: 'Verde Azulado', primary: '#0d9488' },
  { id: 'green', name: 'Verde Institucional', primary: '#16a34a' },
  { id: 'emerald', name: 'Esmeralda', primary: '#059669' },
  { id: 'red', name: 'Rojo Ejecutivo', primary: '#dc2626' },
  { id: 'orange', name: 'Naranja Energía', primary: '#ea580c' },
  { id: 'amber', name: 'Ámbar Dorado', primary: '#d97706' },
  { id: 'purple', name: 'Púrpura', primary: '#7c3aed' },
  { id: 'indigo', name: 'Índigo', primary: '#4f46e5' },
  { id: 'pink', name: 'Rosa', primary: '#db2777' },
  { id: 'slate', name: 'Gris Pizarra', primary: '#475569' },
  { id: 'cyan', name: 'Cian', primary: '#0891b2' },
  { id: 'lime', name: 'Lima', primary: '#65a30d' },
  { id: 'fuchsia', name: 'Fucsia', primary: '#c026d3' },
  { id: 'rose', name: 'Rosa Viejo', primary: '#e11d48' },
  { id: 'sky', name: 'Cielo', primary: '#0284c7' },
  { id: 'stone', name: 'Piedra', primary: '#78716c' },
  { id: 'zinc', name: 'Gris Neutro', primary: '#71717a' },
  { id: 'violet', name: 'Violeta', primary: '#7c3aed' },
];

export function ThemePanel({
  tenantSlug,
  activationId,
  formId,
  currentThemeConfig,
  onSave,
  onClose,
}: ThemePanelProps) {
  const [themes, setThemes] = useState<BaseTheme[]>([]);
  const [palettes, setPalettes] = useState<PredefinedPalette[]>([]);
  const [selectedTheme, setSelectedTheme] = useState(currentThemeConfig?.baseTheme || 'corporativo');
  const [customColor, setCustomColor] = useState(currentThemeConfig?.palette?.primary || '#2563eb');
  const [generatedPalette, setGeneratedPalette] = useState<ColorPalette | null>(currentThemeConfig?.palette || null);
  const [fontFamily, setFontFamily] = useState(currentThemeConfig?.typography?.fontFamily || 'Helvetica');
  const [autoThemeLoading, setAutoThemeLoading] = useState(false);
  const [margins, setMargins] = useState(currentThemeConfig?.layout?.margins || 'normal');
  const [tableStyle, setTableStyle] = useState(currentThemeConfig?.layout?.tableStyle || 'bordered');
  const [headerStyle, setHeaderStyle] = useState(currentThemeConfig?.layout?.headerStyle || 'full');
  const [showLogo, setShowLogo] = useState(currentThemeConfig?.branding?.showLogo ?? true);
  const [showPageNumbers, setShowPageNumbers] = useState(currentThemeConfig?.footer?.showPageNumbers ?? true);
  const [showDate, setShowDate] = useState(currentThemeConfig?.footer?.showDate ?? true);
  const [saving, setSaving] = useState(false);

  // Load catalog (client-side fallback if API not available)
  useEffect(() => {
    api<{ themes: BaseTheme[]; palettes: PredefinedPalette[] }>('/api/report-themes/catalog')
      .then((data) => {
        setThemes(data.themes);
        setPalettes(data.palettes);
      })
      .catch(() => {
        // Fallback: use client-side base themes
        setThemes([
          { id: 'corporativo', name: 'Corporativo', description: 'Profesional con header a color', category: 'Empresarial', preview: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)' },
          { id: 'minimalista', name: 'Minimalista', description: 'Limpio y espacioso', category: 'Moderno', preview: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' },
          { id: 'normativo', name: 'Normativo', description: 'Formal para normas oficiales', category: 'Gobierno', preview: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' },
          { id: 'tecnico', name: 'Técnico', description: 'Datos compactos y densos', category: 'Industrial', preview: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)' },
          { id: 'ejecutivo', name: 'Ejecutivo', description: 'Elegante para alto nivel', category: 'Empresarial', preview: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
          { id: 'clinico', name: 'Clínico', description: 'Profesional para salud', category: 'Salud', preview: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)' },
          { id: 'industrial', name: 'Industrial', description: 'Bold para manufactura', category: 'Industrial', preview: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' },
          { id: 'academico', name: 'Académico', description: 'Clásico con serif', category: 'Educación', preview: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)' },
          { id: 'moderno', name: 'Moderno', description: 'Contemporáneo y amplio', category: 'Moderno', preview: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' },
          { id: 'gobierno', name: 'Gobierno', description: 'Formal e institucional', category: 'Gobierno', preview: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)' },
          { id: 'ambiental', name: 'Ambiental', description: 'Tonos naturales', category: 'Medio Ambiente', preview: 'linear-gradient(135deg, #166534 0%, #15803d 100%)' },
          { id: 'financiero', name: 'Financiero', description: 'Preciso para auditorías', category: 'Finanzas', preview: 'linear-gradient(135deg, #1e293b 0%, #d97706 100%)' },
          { id: 'energia', name: 'Energía', description: 'Vibrante para sector energético', category: 'Industrial', preview: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)' },
          { id: 'farmaceutico', name: 'Farmacéutico', description: 'Estéril y preciso', category: 'Salud', preview: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)' },
          { id: 'personalizado', name: 'Personalizado', description: 'Configuración libre', category: 'Custom', preview: 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)' },
        ]);
        setPalettes(CLIENT_PALETTES);
      });
  }, []);

  // Generate palette client-side (no backend dependency)
  const regeneratePalette = useCallback((color: string) => {
    const palette = generatePaletteClientSide(color);
    setGeneratedPalette(palette);
  }, []);

  useEffect(() => {
    if (customColor && /^#[0-9a-fA-F]{6}$/.test(customColor)) {
      regeneratePalette(customColor);
    }
  }, [customColor, regeneratePalette]);

  const handleAutoTheme = async () => {
    setAutoThemeLoading(true);
    try {
      const result = await api<{ success: boolean; themeConfig: any }>(
        `/api/platform/tenants/${tenantSlug}/report-template-activations/${activationId}/auto-theme`,
        { method: 'POST' },
      );
      if (result.success) {
        onSave(); // Close and refresh
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || 'No se pudo generar el auto-tema'}`);
    } finally {
      setAutoThemeLoading(false);
    }
  };

  const handleSave = async () => {
    if (!generatedPalette) return;
    setSaving(true);

    const themeConfig: ThemeConfig = {
      baseTheme: selectedTheme,
      palette: generatedPalette,
      typography: {
        fontFamily,
        titleSize: 14,
        bodySize: 11,
        lineHeight: 1.5,
      },
      layout: {
        margins: typeof margins === 'string' ? margins : 'normal',
        pageMargins: typeof margins === 'object' ? margins : undefined,
        headerStyle,
        tableStyle,
        separator: 'line',
      },
      branding: {
        showLogo,
        logoUrl: null,
        logoPosition: 'left',
        showWatermark: false,
        watermarkText: null,
      },
      footer: {
        showPageNumbers,
        showDate,
        customText: null,
      },
    };

    try {
      await api(`/api/platform/tenants/${tenantSlug}/report-template-activations/${activationId}/theme`, {
        method: 'PATCH',
        body: JSON.stringify({ theme_config: themeConfig }),
      });
      onSave();
    } catch (error: any) {
      alert(`Error al guardar tema: ${error?.message || 'Verifica que el backend esté actualizado'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">🎨 Configurar Tema del Reporte</h2>
            <button
              onClick={handleAutoTheme}
              disabled={autoThemeLoading}
              className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors"
              title="Detectar colores y fuente del formulario automáticamente"
            >
              {autoThemeLoading ? '⏳ Detectando...' : '🪄 Auto-Tema'}
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
        </div>

        <div className="grid grid-cols-2 gap-6 p-6">
          {/* Left: Configuration */}
          <div className="space-y-5">
            {/* Theme selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Tema base</label>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTheme(t.id)}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      selectedTheme === t.id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className="w-full h-6 rounded mb-1"
                      style={{ background: t.preview }}
                    />
                    <div className="text-[10px] font-medium text-gray-800 truncate">{t.name}</div>
                    <div className="text-[9px] text-gray-400">{t.category}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Color marca del tenant</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm w-24 font-mono"
                  placeholder="#2563eb"
                />
                <span className="text-xs text-gray-400">o elige:</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {palettes.slice(0, 12).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setCustomColor(p.primary)}
                    className="w-6 h-6 rounded-full border border-gray-200 hover:ring-2 hover:ring-blue-300 transition-all"
                    style={{ backgroundColor: p.primary }}
                    title={p.name}
                  />
                ))}
              </div>
            </div>

            {/* Generated palette preview */}
            {generatedPalette && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Paleta generada</label>
                <div className="flex gap-1">
                  {Object.entries(generatedPalette).map(([key, color]) => (
                    <div key={key} className="flex-1 text-center">
                      <div
                        className="w-full h-6 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <div className="text-[8px] text-gray-400 mt-0.5">{key}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Typography */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Fuente</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value="Helvetica">Helvetica (Sans-serif)</option>
                  <option value="Times-Roman">Times Roman (Serif)</option>
                  <option value="Courier">Courier (Monospace)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Márgenes del documento</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[9px] text-gray-400">↑ Sup</label>
                    <select
                      value={(margins as any)?.top || '20mm'}
                      onChange={(e) => setMargins({ ...(typeof margins === 'object' ? margins : { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }), top: e.target.value } as any)}
                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-[10px]"
                    >
                      <option value="10mm">10mm</option>
                      <option value="15mm">15mm</option>
                      <option value="20mm">20mm</option>
                      <option value="25mm">25mm</option>
                      <option value="30mm">30mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400">↓ Inf</label>
                    <select
                      value={(margins as any)?.bottom || '20mm'}
                      onChange={(e) => setMargins({ ...(typeof margins === 'object' ? margins : { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }), bottom: e.target.value } as any)}
                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-[10px]"
                    >
                      <option value="10mm">10mm</option>
                      <option value="15mm">15mm</option>
                      <option value="20mm">20mm</option>
                      <option value="25mm">25mm</option>
                      <option value="30mm">30mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400">← Izq</label>
                    <select
                      value={(margins as any)?.left || '15mm'}
                      onChange={(e) => setMargins({ ...(typeof margins === 'object' ? margins : { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }), left: e.target.value } as any)}
                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-[10px]"
                    >
                      <option value="10mm">10mm</option>
                      <option value="15mm">15mm</option>
                      <option value="20mm">20mm</option>
                      <option value="25mm">25mm</option>
                      <option value="30mm">30mm</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-400">→ Der</label>
                    <select
                      value={(margins as any)?.right || '15mm'}
                      onChange={(e) => setMargins({ ...(typeof margins === 'object' ? margins : { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }), right: e.target.value } as any)}
                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-[10px]"
                    >
                      <option value="10mm">10mm</option>
                      <option value="15mm">15mm</option>
                      <option value="20mm">20mm</option>
                      <option value="25mm">25mm</option>
                      <option value="30mm">30mm</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Layout options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Estilo tablas</label>
                <select
                  value={tableStyle}
                  onChange={(e) => setTableStyle(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value="bordered">Bordes completos</option>
                  <option value="striped">Filas alternadas</option>
                  <option value="minimal">Mínimo</option>
                  <option value="modern">Moderno</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Header</label>
                <select
                  value={headerStyle}
                  onChange={(e) => setHeaderStyle(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                >
                  <option value="full">Barra completa</option>
                  <option value="minimal">Mínimo</option>
                  <option value="centered">Centrado</option>
                  <option value="with-logo">Con logo</option>
                </select>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} className="rounded" />
                Logo
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={showPageNumbers} onChange={(e) => setShowPageNumbers(e.target.checked)} className="rounded" />
                Nº página
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="rounded" />
                Fecha
              </label>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="bg-gray-100 rounded-lg p-3 overflow-auto">
            <div className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Vista previa</div>
            <ThemePreview
              palette={generatedPalette}
              fontFamily={fontFamily}
              headerStyle={headerStyle}
              tableStyle={tableStyle}
              showLogo={showLogo}
              showPageNumbers={showPageNumbers}
              showDate={showDate}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Tema'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Theme Preview Component ─────────────────────────────────────────────────

function ThemePreview({
  palette,
  fontFamily,
  headerStyle,
  tableStyle,
  showLogo,
  showPageNumbers,
  showDate,
}: {
  palette: ColorPalette | null;
  fontFamily: string;
  headerStyle: string;
  tableStyle: string;
  showLogo: boolean;
  showPageNumbers: boolean;
  showDate: boolean;
}) {
  if (!palette) return <div className="text-center text-gray-400 py-20">Selecciona un color</div>;

  const fontMap: Record<string, string> = {
    'Helvetica': 'Helvetica, Arial, sans-serif',
    'Times-Roman': 'Times New Roman, serif',
    'Courier': 'Courier New, monospace',
  };

  return (
    <div
      className="bg-white shadow border border-gray-200 mx-auto"
      style={{
        width: '280px',
        minHeight: '380px',
        padding: '20px 16px',
        fontFamily: fontMap[fontFamily] || fontMap['Helvetica'],
        fontSize: '7px',
        lineHeight: '1.5',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: headerStyle === 'full' ? `2px solid ${palette.primary}` : '1px solid #eee',
          backgroundColor: headerStyle === 'full' ? palette.background : 'transparent',
          padding: headerStyle === 'full' ? '8px' : '0 0 8px 0',
          borderRadius: headerStyle === 'full' ? '3px' : '0',
          textAlign: headerStyle === 'centered' ? 'center' : 'left',
        }}
      >
        {showLogo && (
          <div style={{ fontSize: '6px', color: palette.neutral, marginBottom: '2px' }}>
            [Logo empresa]
          </div>
        )}
        <div style={{ fontSize: '9px', fontWeight: 'bold', color: palette.primary }}>
          Reporte de Evaluación
        </div>
        <div style={{ fontSize: '6px', color: palette.neutral }}>
          Técnico: Juan Pérez • {showDate ? new Date().toLocaleDateString('es-MX') : ''}
        </div>
      </div>

      {/* Section title */}
      <div style={{ fontSize: '8px', fontWeight: 'bold', color: palette.primaryDark, marginBottom: '4px', borderBottom: `1px solid ${palette.primaryLight}`, paddingBottom: '2px' }}>
        Datos del Centro de Trabajo
      </div>

      {/* Table */}
      <table
        style={{
          width: '100%',
          fontSize: '6.5px',
          borderCollapse: 'collapse',
          marginBottom: '10px',
          border: tableStyle === 'bordered' ? `1px solid ${palette.neutral}40` : 'none',
        }}
      >
        <tbody>
          {[
            ['Empresa', 'Lab XYZ S.A.'],
            ['RFC', 'LXY-980101'],
            ['Giro', 'Farmacéutico'],
          ].map(([label, val], i) => (
            <tr
              key={label}
              style={{
                backgroundColor:
                  tableStyle === 'striped' && i % 2 === 1
                    ? palette.background
                    : tableStyle === 'modern' && i % 2 === 1
                      ? `${palette.primary}08`
                      : 'transparent',
                borderBottom: tableStyle === 'bordered' ? `1px solid ${palette.neutral}30` : 'none',
              }}
            >
              <td style={{ padding: '2px 4px', fontWeight: 'bold', color: palette.primaryDark, width: '40%' }}>
                {label}
              </td>
              <td style={{ padding: '2px 4px', color: palette.text }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Section title 2 */}
      <div style={{ fontSize: '8px', fontWeight: 'bold', color: palette.primaryDark, marginBottom: '4px', borderBottom: `1px solid ${palette.primaryLight}`, paddingBottom: '2px' }}>
        Resultados
      </div>

      <table
        style={{
          width: '100%',
          fontSize: '6.5px',
          borderCollapse: 'collapse',
          marginBottom: '10px',
          border: tableStyle === 'bordered' ? `1px solid ${palette.neutral}40` : 'none',
        }}
      >
        <tbody>
          {[['Resultado 1', '85.5'], ['Resultado 2', '92.3'], ['Resultado 3', '78.1']].map(([label, val], i) => (
            <tr
              key={label}
              style={{
                backgroundColor: tableStyle === 'striped' && i % 2 === 1 ? palette.background : 'transparent',
                borderBottom: tableStyle === 'bordered' ? `1px solid ${palette.neutral}30` : 'none',
              }}
            >
              <td style={{ padding: '2px 4px', fontWeight: 'bold', color: palette.primaryDark, width: '40%' }}>{label}</td>
              <td style={{ padding: '2px 4px', color: palette.text }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      {(showPageNumbers || showDate) && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '16px',
            right: '16px',
            fontSize: '6px',
            color: palette.neutral,
            textAlign: 'center',
            borderTop: `1px solid ${palette.neutral}30`,
            paddingTop: '4px',
          }}
        >
          {showPageNumbers && 'Página 1 de 1'}
          {showPageNumbers && showDate && ' • '}
          {showDate && new Date().toLocaleDateString('es-MX')}
        </div>
      )}
    </div>
  );
}
