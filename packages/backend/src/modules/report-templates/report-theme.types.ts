/**
 * Report Theme Types
 *
 * Defines the structure of visual themes for PDF reports.
 * Themes control colors, typography, layout, and branding.
 *
 * @module report-theme.types
 */

export interface ColorPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  neutral: string;
  background: string;
  text: string;
}

export interface ReportThemeConfig {
  baseTheme: string; // ID del tema base
  palette: ColorPalette;
  typography: {
    fontFamily: 'Helvetica' | 'Times-Roman' | 'Courier';
    titleSize: number;
    bodySize: number;
    lineHeight: number;
  };
  layout: {
    margins: 'narrow' | 'normal' | 'wide';
    headerStyle: 'full' | 'minimal' | 'centered' | 'with-logo';
    tableStyle: 'bordered' | 'striped' | 'minimal' | 'modern';
    separator: 'line' | 'space' | 'bar' | 'none';
  };
  branding: {
    showLogo: boolean;
    logoUrl: string | null;
    logoPosition: 'left' | 'center' | 'right';
    showWatermark: boolean;
    watermarkText: string | null;
  };
  footer: {
    showPageNumbers: boolean;
    showDate: boolean;
    customText: string | null;
  };
}

export interface BaseTheme {
  id: string;
  name: string;
  description: string;
  category: string;
  preview: string; // CSS gradient or color for thumbnail
  defaults: Omit<ReportThemeConfig, 'baseTheme' | 'palette'>;
}
