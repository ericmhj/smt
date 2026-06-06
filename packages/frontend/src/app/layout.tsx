import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SGR - Sistema de Gestión de Ensayos',
  description: 'Sistema de Gestión de Ensayos para técnicos de campo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
