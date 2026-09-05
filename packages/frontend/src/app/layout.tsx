import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MikelCRM - Cumplimiento de Normas Oficiales',
  description: 'Cumplimiento de Normas Oficiales para técnicos de campo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {/* AuthProvider will be added in a subsequent task (8.1) */}
        {children}
      </body>
    </html>
  );
}
