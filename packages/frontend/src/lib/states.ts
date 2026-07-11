// Catálogo de estados — se carga desde la API y se cachea en memoria
// Fallback local si la API no responde

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface EstadoCatalogo {
  codigo: string;
  etiqueta: string;
  color: string;
  orden: number;
  es_terminal: boolean;
}

// Cache en memoria del cliente
let cachedEstados: EstadoCatalogo[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos en cliente

// Fallback si la API no responde
const FALLBACK_ESTADOS: EstadoCatalogo[] = [
  { codigo: 'pendiente', etiqueta: 'Programado', color: 'yellow', orden: 1, es_terminal: false },
  { codigo: 'en_revision', etiqueta: 'En Evaluación', color: 'blue', orden: 2, es_terminal: false },
  { codigo: 'validado', etiqueta: 'Validado', color: 'green', orden: 3, es_terminal: false },
  { codigo: 'rechazado', etiqueta: 'Rechazado', color: 'red', orden: 4, es_terminal: true },
  { codigo: 'finalizado', etiqueta: 'Finalizado', color: 'gray', orden: 5, es_terminal: true },
];

/**
 * Fetch estados from API (with client-side cache)
 */
export async function fetchEstados(): Promise<EstadoCatalogo[]> {
  const now = Date.now();
  if (cachedEstados && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedEstados;
  }

  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/catalogs/estados`, { headers });
    if (res.ok) {
      const data = await res.json();
      cachedEstados = data;
      cacheTimestamp = now;
      return data;
    }
  } catch {
    // API not available, use fallback
  }

  return FALLBACK_ESTADOS;
}

/**
 * Synchronous access to cached estados (use after fetchEstados has been called)
 */
export function getEstadosCached(): EstadoCatalogo[] {
  return cachedEstados || FALLBACK_ESTADOS;
}

// Pre-computed maps for synchronous access (built from fallback, updated when API responds)
export const stateLabels: Record<string, string> = {};
export const stateColors: Record<string, string> = {};
export const stateOptions: Array<{ value: string; label: string }> = [];

// Tailwind CSS color classes by color name
const colorClasses: Record<string, string> = {
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-800',
};

// Initialize with fallback values immediately
function buildMaps(estados: EstadoCatalogo[]) {
  // Clear existing
  Object.keys(stateLabels).forEach(k => delete stateLabels[k]);
  Object.keys(stateColors).forEach(k => delete stateColors[k]);
  stateOptions.length = 0;

  for (const e of estados) {
    stateLabels[e.codigo] = e.etiqueta;
    stateColors[e.codigo] = colorClasses[e.color] || 'bg-gray-100 text-gray-800';
    stateOptions.push({ value: e.codigo, label: e.etiqueta });
  }
}

// Build initial maps from fallback
buildMaps(FALLBACK_ESTADOS);

// Auto-fetch from API on module load (browser only)
if (typeof window !== 'undefined') {
  fetchEstados().then(buildMaps);
}
