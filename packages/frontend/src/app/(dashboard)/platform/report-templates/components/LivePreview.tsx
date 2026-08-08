'use client';

import type { TemplateSection } from './SectionBuilder';

interface LivePreviewProps {
  sections: TemplateSection[];
  selectedSectionId: string | null;
}

// Mock data for preview
const MOCK_RESPONSES: Record<string, string> = {
  nombre_empresa: 'Laboratorios XYZ S.A. de C.V.',
  rfc: 'LXY-980101-ABC',
  domicilio: 'Av. Principal #123, Col. Centro, CDMX',
  giro: 'Farmacéutico',
  num_trabajadores: '150',
  resultado_1: '85.5',
  resultado_2: '92.3',
  resultado_3: '78.1',
  conclusion_texto: 'Los resultados cumplen con los parámetros establecidos en la norma.',
};

const MOCK_OBSERVATIONS = [
  { content: 'Revisión de calibración completada satisfactoriamente.', date: '2026-07-15T10:30:00Z' },
  { content: 'Se adjuntan documentos de soporte.', date: '2026-07-16T14:00:00Z' },
];

const MOCK_TRANSITIONS = [
  { from: 'Pendiente', to: 'En Revisión', reason: null, date: '2026-07-10T09:00:00Z' },
  { from: 'En Revisión', to: 'Validado', reason: 'Datos correctos', date: '2026-07-15T11:00:00Z' },
];

// PDF-like styles
const pdfStyles = {
  page: {
    width: '595px',
    minHeight: '842px',
    padding: '56px 42px',
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
    fontSize: '11px',
    lineHeight: '1.6',
    color: '#1e293b',
    transform: 'scale(0.72)',
    transformOrigin: 'top center',
    position: 'relative' as const,
  },
  header: {
    fontSize: '9px',
    color: '#64748b',
    marginBottom: '20px',
    borderBottom: '2px solid #2563eb',
    paddingBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '700' as const,
    color: '#1e293b',
    marginBottom: '8px',
    paddingBottom: '4px',
    borderBottom: '1px solid #e2e8f0',
  },
  table: {
    width: '100%',
    fontSize: '10px',
    borderCollapse: 'collapse' as const,
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden' as const,
  },
  tableHeader: {
    background: '#f8fafc',
    borderBottom: '2px solid #e2e8f0',
  },
  tableHeaderCell: {
    padding: '6px 10px',
    textAlign: 'left' as const,
    fontWeight: '600' as const,
    color: '#475569',
    fontSize: '9px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tableCell: {
    padding: '6px 10px',
    borderBottom: '1px solid #f1f5f9',
  },
  tableCellLabel: {
    padding: '6px 10px',
    borderBottom: '1px solid #f1f5f9',
    fontWeight: '600' as const,
    color: '#475569',
    backgroundColor: '#f8fafc',
    width: '35%',
  },
  footer: {
    position: 'absolute' as const,
    bottom: '20px',
    left: '42px',
    right: '42px',
    fontSize: '9px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    borderTop: '1px solid #e2e8f0',
    paddingTop: '8px',
  },
};

export function LivePreview({ sections, selectedSectionId }: LivePreviewProps) {
  const activeSections = sections
    .filter((s) => s.is_active)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase">Vista Previa PDF</h3>
        <span className="text-[10px] text-gray-400">Simulación A4 • Los estilos reflejan el PDF generado</span>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
        <div className="mx-auto bg-white shadow-lg border border-gray-300" style={pdfStyles.page}>
          {/* Header */}
          <div style={pdfStyles.header}>
            <div>
              <strong style={{ fontSize: '12px', color: '#2563eb' }}>Formulario de Ejemplo</strong>
              <div style={{ marginTop: '2px' }}>Técnico: Juan Pérez • Intento #1</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{new Date().toLocaleDateString('es-MX')}</div>
            </div>
          </div>

          {activeSections.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', marginTop: '200px' }}>
              <p style={{ fontSize: '14px' }}>📄</p>
              <p>Agrega secciones para ver la vista previa</p>
            </div>
          ) : (
            activeSections.map((section) => (
              <div
                key={section.id}
                style={{
                  marginBottom: '18px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: selectedSectionId === section.id ? '2px solid #3b82f6' : '1px solid transparent',
                  backgroundColor: selectedSectionId === section.id ? '#eff6ff' : 'transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                <PreviewSection section={section} />
              </div>
            ))
          )}

          {/* Footer */}
          <div style={pdfStyles.footer}>
            Página 1 de 1 • Generado por SGR
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewSection({ section }: { section: TemplateSection }) {
  return (
    <div>
      <h2 style={pdfStyles.sectionTitle}>
        {section.title}
      </h2>

      {section.type === 'static' && (
        <div style={{ fontSize: '11px', color: '#334155', whiteSpace: 'pre-wrap' }}>
          {(section.config.content as string) || (
            <em style={{ color: '#94a3b8' }}>Sin contenido definido — escribe texto en la configuración</em>
          )}
        </div>
      )}

      {section.type === 'form_content' && (
        <table style={pdfStyles.table}>
          <tbody>
            {Object.entries(MOCK_RESPONSES).map(([key, val], index) => {
              if (!section.config.showEmptyFields && !val) return null;
              return (
                <tr key={key} style={{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  <td style={pdfStyles.tableCellLabel}>{formatFieldLabel(key)}</td>
                  <td style={pdfStyles.tableCell}>{val || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {section.type === 'signatures' && (
        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          {((section.config.roles as string[]) || []).map((role) => (
            <div key={role} style={{ textAlign: 'center' }}>
              <div style={{ height: '60px' }} />
              <div style={{ borderTop: '1px solid #1e293b', width: '180px', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '500' }}>{role}</span>
            </div>
          ))}
        </div>
      )}

      {section.type === 'custom_html' && (
        <div
          style={{
            fontSize: '11px',
            color: '#334155',
            padding: '8px',
            border: '1px dashed #cbd5e1',
            borderRadius: '4px',
            backgroundColor: '#f8fafc',
          }}
          dangerouslySetInnerHTML={{
            __html: (section.config.htmlContent as string) || '<em style="color:#94a3b8">Sin contenido HTML definido</em>',
          }}
        />
      )}

      {section.type === 'observations' && (
        <div style={{ marginTop: '4px' }}>
          {MOCK_OBSERVATIONS.map((obs, i) => (
            <div key={i} style={{ borderLeft: '3px solid #2563eb', paddingLeft: '10px', marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', marginBottom: '2px' }}>
                {new Date(obs.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div style={{ fontSize: '10px', color: '#334155' }}>{obs.content}</div>
            </div>
          ))}
        </div>
      )}

      {section.type === 'state_history' && (
        <table style={pdfStyles.table}>
          <thead>
            <tr style={pdfStyles.tableHeader}>
              <th style={pdfStyles.tableHeaderCell}>Fecha</th>
              <th style={pdfStyles.tableHeaderCell}>Transición</th>
              <th style={pdfStyles.tableHeaderCell}>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_TRANSITIONS.map((t, i) => (
              <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                <td style={pdfStyles.tableCell}>
                  {new Date(t.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td style={pdfStyles.tableCell}>
                  <span style={{ color: '#dc2626' }}>{t.from}</span>
                  {' → '}
                  <span style={{ color: '#16a34a' }}>{t.to}</span>
                </td>
                <td style={pdfStyles.tableCell}>{t.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Formats a snake_case field name to a human-readable label */
function formatFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
