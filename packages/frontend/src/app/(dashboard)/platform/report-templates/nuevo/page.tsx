'use client';

import { useSearchParams } from 'next/navigation';
import { SectionBuilder } from '../components/SectionBuilder';

export default function NuevoTemplatePage() {
  const searchParams = useSearchParams();
  const formType = searchParams.get('form_type') || '';
  const tenantSlug = searchParams.get('tenant_slug') || '';
  const tenantFormId = searchParams.get('tenant_form_id') || '';
  const formName = searchParams.get('form_name') || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Template de Reporte</h1>
        <p className="text-sm text-gray-500 mt-1">
          {formName
            ? <>Crear template para <strong>{formName}</strong> en tenant <strong>{tenantSlug}</strong></>
            : 'Define la estructura del PDF generado'
          }
        </p>
      </div>
      <SectionBuilder
        mode="create"
        initialFormType={formType}
        initialTenantSlug={tenantSlug}
        initialTenantFormId={tenantFormId}
        initialName={formName ? `Reporte ${formName}` : ''}
      />
    </div>
  );
}
