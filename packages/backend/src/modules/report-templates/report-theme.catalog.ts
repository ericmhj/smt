/**
 * Report Theme Catalog
 *
 * Built-in base themes and color palette generator.
 * Provides 15 curated base themes + algorithmic palette generation.
 *
 * @module report-theme.catalog
 */

import type { BaseTheme, ColorPalette } from './report-theme.types.js';

// ─── Color Utility Functions ─────────────────────────────────────────────────

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

/**
 * Generate a full color palette from a single primary color.
 */
export function generatePalette(primaryHex: string): ColorPalette {
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

// ─── Predefined Palettes ─────────────────────────────────────────────────────

export const PREDEFINED_PALETTES: Array<{ id: string; name: string; primary: string }> = [
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
  { id: 'zinc', name: 'Gris Neutro', primary: '#71717a' },
  { id: 'stone', name: 'Piedra', primary: '#78716c' },
  { id: 'cyan', name: 'Cian', primary: '#0891b2' },
  { id: 'lime', name: 'Lima', primary: '#65a30d' },
  { id: 'fuchsia', name: 'Fucsia', primary: '#c026d3' },
  { id: 'rose', name: 'Rosa Viejo', primary: '#e11d48' },
  { id: 'sky', name: 'Cielo', primary: '#0284c7' },
  { id: 'violet', name: 'Violeta', primary: '#7c3aed' },
];

// ─── Base Themes ─────────────────────────────────────────────────────────────

export const BASE_THEMES: BaseTheme[] = [
  {
    id: 'corporativo',
    name: 'Corporativo',
    description: 'Estilo profesional con header a color completo y tablas con bordes',
    category: 'Empresarial',
    preview: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 14, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'minimalista',
    name: 'Minimalista',
    description: 'Diseño limpio y espacioso con mínimos elementos decorativos',
    category: 'Moderno',
    preview: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 16, bodySize: 11, lineHeight: 1.6 },
      layout: { margins: 'wide', headerStyle: 'minimal', tableStyle: 'minimal', separator: 'space' },
      branding: { showLogo: false, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: false, customText: null },
    },
  },
  {
    id: 'normativo',
    name: 'Normativo',
    description: 'Estilo formal para cumplimiento de normas oficiales (NOM)',
    category: 'Gobierno',
    preview: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
    defaults: {
      typography: { fontFamily: 'Times-Roman', titleSize: 14, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'centered', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'center', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: 'Documento oficial — Uso interno' },
    },
  },
  {
    id: 'tecnico',
    name: 'Técnico',
    description: 'Datos compactos con alta densidad de información',
    category: 'Industrial',
    preview: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
    defaults: {
      typography: { fontFamily: 'Courier', titleSize: 12, bodySize: 10, lineHeight: 1.4 },
      layout: { margins: 'narrow', headerStyle: 'minimal', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: false, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'ejecutivo',
    name: 'Ejecutivo',
    description: 'Elegante y distinguido para reportes de alto nivel',
    category: 'Empresarial',
    preview: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    defaults: {
      typography: { fontFamily: 'Times-Roman', titleSize: 16, bodySize: 11, lineHeight: 1.6 },
      layout: { margins: 'wide', headerStyle: 'centered', tableStyle: 'modern', separator: 'bar' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'center', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: 'Confidencial' },
    },
  },
  {
    id: 'clinico',
    name: 'Clínico',
    description: 'Limpio y profesional para entornos de salud',
    category: 'Salud',
    preview: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 13, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'striped', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Alto contraste y elementos bold para manufactura',
    category: 'Industrial',
    preview: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 14, bodySize: 11, lineHeight: 1.4 },
      layout: { margins: 'narrow', headerStyle: 'full', tableStyle: 'bordered', separator: 'bar' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'academico',
    name: 'Académico',
    description: 'Estilo clásico con tipografía serif para entornos educativos',
    category: 'Educación',
    preview: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 100%)',
    defaults: {
      typography: { fontFamily: 'Times-Roman', titleSize: 14, bodySize: 12, lineHeight: 1.6 },
      layout: { margins: 'wide', headerStyle: 'centered', tableStyle: 'minimal', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'center', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'moderno',
    name: 'Moderno',
    description: 'Diseño contemporáneo con esquinas redondeadas y espacios amplios',
    category: 'Moderno',
    preview: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 15, bodySize: 11, lineHeight: 1.6 },
      layout: { margins: 'normal', headerStyle: 'minimal', tableStyle: 'modern', separator: 'space' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: false, customText: null },
    },
  },
  {
    id: 'gobierno',
    name: 'Gobierno',
    description: 'Formal y austero para documentos institucionales',
    category: 'Gobierno',
    preview: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)',
    defaults: {
      typography: { fontFamily: 'Times-Roman', titleSize: 13, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'with-logo', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: true, watermarkText: 'OFICIAL' },
      footer: { showPageNumbers: true, showDate: true, customText: 'Documento oficial' },
    },
  },
  {
    id: 'ambiental',
    name: 'Ambiental',
    description: 'Tonos naturales para reportes medioambientales',
    category: 'Medio Ambiente',
    preview: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 14, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'striped', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'financiero',
    name: 'Financiero',
    description: 'Preciso y elegante para reportes contables y auditorías',
    category: 'Finanzas',
    preview: 'linear-gradient(135deg, #1e293b 0%, #d97706 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 13, bodySize: 10, lineHeight: 1.4 },
      layout: { margins: 'narrow', headerStyle: 'full', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: 'Confidencial — Uso interno' },
    },
  },
  {
    id: 'energia',
    name: 'Energía',
    description: 'Bold y vibrante para sector energético e industrial pesado',
    category: 'Industrial',
    preview: 'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 14, bodySize: 11, lineHeight: 1.4 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'bordered', separator: 'bar' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
  {
    id: 'farmaceutico',
    name: 'Farmacéutico',
    description: 'Estéril y preciso para industria farmacéutica y química',
    category: 'Salud',
    preview: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 13, bodySize: 10, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'striped', separator: 'line' },
      branding: { showLogo: true, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: 'Lote / Batch: {batch_number}' },
    },
  },
  {
    id: 'personalizado',
    name: 'Personalizado',
    description: 'Configuración completamente libre — define cada aspecto',
    category: 'Custom',
    preview: 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)',
    defaults: {
      typography: { fontFamily: 'Helvetica', titleSize: 14, bodySize: 11, lineHeight: 1.5 },
      layout: { margins: 'normal', headerStyle: 'full', tableStyle: 'bordered', separator: 'line' },
      branding: { showLogo: false, logoUrl: null, logoPosition: 'left', showWatermark: false, watermarkText: null },
      footer: { showPageNumbers: true, showDate: true, customText: null },
    },
  },
];
