'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * El flujo de creación de formularios está DESHABILITADO para todos los roles
 * (incluido superusuario). No se expone ningún enlace ni acción hacia esta
 * ruta. Como defensa ante el acceso directo por URL, este componente no
 * renderiza la UI de alta: redirige de inmediato al listado de formularios.
 */
export default function NewFormPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/forms');
  }, [router]);

  return null;
}
