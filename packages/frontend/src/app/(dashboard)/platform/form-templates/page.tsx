'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { createColumnHelper } from '@tanstack/react-table';
import DataTable from '@/components/ui/DataTable';

interface FormTemplate {
  id: string;
  formType: string;
  name: string;
  description: string | null;
  htmlContent?: string;
  currentVersion: number;
  isActive: boolean;
  fieldsMetadata: { sections: Array<{ sectionName: string; fields: string[] }> };
  createdAt: string;
  updatedAt: string;
}

export default function FormTemplatesPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewTemplate, setPreviewTemplate] = useState<FormTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await api<FormTemplate[]>('/api/form-templates/all');
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching form templates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleToggle = async (id: string) => {
    try {
      await api(`/api/form-templates/${id}/toggle`, { method: 'PATCH' });
      await fetchTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
    }
  };

  const handlePreview = async (template: FormTemplate) => {
    setPreviewTemplate(template);
    setLoadingPreview(true);
    try {
      const full = await api<FormTemplate>(`/api/form-templates/${template.id}`);
      setPreviewHtml(full.htmlContent || '<p>Sin contenido HTML</p>');
    } catch {
      setPreviewHtml('<p class="text-red-500">Error al cargar la vista previa</p>');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el template "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/form-templates/${id}`, { method: 'DELETE' });
      await fetchTemplates();
    } catch (err: any) {
      if (err?.data?.code === 'HAS_RELATIONS') {
        alert(err.data.message);
      } else {
        alert(err instanceof Error ? err.message : 'Error al eliminar');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formularios Padre</h1>
          <p className="text-sm text-gray-500 mt-1">Catálogo de templates de formularios para tenants</p>
        </div>
        <Link
          href="/platform/form-templates/nuevo"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Nuevo Template
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-500">Cargando...</div>
        ) : (
          <TemplatesDataTable
            templates={templates}
            onToggle={handleToggle}
            onPreview={handlePreview}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{previewTemplate.name}</h2>
                <p className="text-xs text-gray-500">
                  Tipo: {previewTemplate.formType} · v{previewTemplate.currentVersion} · Solo lectura
                </p>
              </div>
              <button
                onClick={() => { setPreviewTemplate(null); setPreviewHtml(''); }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingPreview ? (
                <div className="text-center text-gray-500 py-12">Cargando vista previa...</div>
              ) : (
                <div
                  className="prose prose-sm max-w-none pointer-events-none select-none opacity-90
                    [&_input]:border [&_input]:border-gray-300 [&_input]:rounded [&_input]:px-2 [&_input]:py-1 [&_input]:w-full [&_input]:mb-3 [&_input]:bg-gray-50
                    [&_select]:border [&_select]:border-gray-300 [&_select]:rounded [&_select]:px-2 [&_select]:py-1 [&_select]:w-full [&_select]:mb-3 [&_select]:bg-gray-50
                    [&_textarea]:border [&_textarea]:border-gray-300 [&_textarea]:rounded [&_textarea]:px-2 [&_textarea]:py-1 [&_textarea]:w-full [&_textarea]:mb-3 [&_textarea]:bg-gray-50
                    [&_label]:font-medium [&_label]:text-gray-700 [&_label]:block [&_label]:mb-1
                    [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1
                    [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
            <div className="flex items-center justify-end px-6 py-3 border-t">
              <button
                onClick={() => { setPreviewTemplate(null); setPreviewHtml(''); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DataTable sub-component ─────────────────────────────────────────────────

const templateColumnHelper = createColumnHelper<FormTemplate>();

function TemplatesDataTable({
  templates,
  onToggle,
  onPreview,
  onDelete,
}: {
  templates: FormTemplate[];
  onToggle: (id: string) => void;
  onPreview: (t: FormTemplate) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const columns = useMemo(() => [
    templateColumnHelper.accessor('formType', {
      header: 'Tipo',
      cell: (info) => (
        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
          {info.getValue()}
        </span>
      ),
    }),
    templateColumnHelper.accessor('name', {
      header: 'Nombre',
      cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>,
    }),
    templateColumnHelper.accessor('updatedAt', {
      header: 'Última modificación',
      filterFn: (row, _columnId, filterValue) => {
        const dateStr = row.original.updatedAt;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const formatted = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return formatted.toLowerCase().includes(filterValue.toLowerCase());
      },
      cell: (info) => {
        const dateStr = info.getValue();
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return <span className="text-gray-500">{d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
      },
    }),
    templateColumnHelper.accessor('isActive', {
      header: 'Estado',
      filterFn: (row, _columnId, filterValue) => {
        const label = row.original.isActive ? 'activo' : 'inactivo';
        return label.startsWith(filterValue.toLowerCase());
      },
      cell: (info) => {
        const t = info.row.original;
        return (
          <button
            onClick={() => onToggle(t.id)}
            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer transition-colors ${
              t.isActive ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
            }`}
          >
            {t.isActive ? 'Activo' : 'Inactivo'}
          </button>
        );
      },
    }),
    templateColumnHelper.display({
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const t = info.row.original;
        return (
          <div className="space-x-2">
            <button onClick={() => onPreview(t)} className="text-gray-600 hover:text-gray-800">Vista previa</button>
            <Link href={`/platform/form-templates/editar/${t.id}`} className="text-blue-600 hover:text-blue-800">Editar</Link>
            <button onClick={() => onDelete(t.id, t.name)} className="text-red-600 hover:text-red-800">Eliminar</button>
          </div>
        );
      },
    }),
  ], [onToggle, onPreview, onDelete]);

  return <DataTable data={templates} columns={columns} columnFiltering globalFilter={false} />;
}
