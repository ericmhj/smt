import * as Minio from 'minio';
import { Readable } from 'node:stream';

/**
 * Cliente de almacenamiento de objetos S3-compatible.
 *
 * El proveedor es Garage (dxflrs/garage), auto-hospedado y compatible con el
 * protocolo S3. Se usa la librería cliente `minio` únicamente como SDK S3;
 * el servidor NO es MinIO. La nomenclatura de este módulo usa "Garage" para
 * evitar confusiones.
 *
 * Configuración vía variables de entorno GARAGE_* (con compatibilidad hacia
 * atrás con las antiguas MINIO_* mientras se migran los entornos).
 */
const endpoint = (process.env.GARAGE_ENDPOINT || process.env.MINIO_ENDPOINT || 'http://localhost:3900').replace(/^https?:\/\//, '');
const portMatch = endpoint.match(/:(\d+)$/);
const host = portMatch ? endpoint.replace(`:${portMatch[1]}`, '') : endpoint;
const port = portMatch ? parseInt(portMatch[1], 10) : 3900;

const garageClient = new Minio.Client({
  endPoint: host,
  port,
  useSSL: (process.env.GARAGE_USE_SSL ?? process.env.MINIO_USE_SSL) === 'true',
  accessKey: process.env.GARAGE_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || 'garage',
  secretKey: process.env.GARAGE_SECRET_KEY || process.env.MINIO_SECRET_KEY || 'garage',
  region: process.env.GARAGE_REGION || process.env.MINIO_REGION || 'garage',
  pathStyle: true,
});

const BUCKET = process.env.GARAGE_BUCKET || process.env.MINIO_BUCKET || 'sgr-files';

/**
 * Constructs a tenant-namespaced storage key.
 * Format: {slug}/{path}
 */
export function tenantStorageKey(slug: string, path: string): string {
  return `${slug}/${path}`;
}

/**
 * Upload a file to Garage (S3-compatible object storage).
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string,
  tenantSlug?: string,
): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await garageClient.putObject(BUCKET, finalKey, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
}

/**
 * Generate a presigned download URL for a file.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function getFileUrl(
  key: string,
  expiresIn = 3600,
  tenantSlug?: string,
): Promise<string> {
  let finalKey = key;
  if (tenantSlug) {
    if (!key.startsWith(`${tenantSlug}/`)) {
      finalKey = tenantStorageKey(tenantSlug, key);
    }
  } else if (!key.includes('/')) {
    finalKey = tenantStorageKey('default', key);
  }

  return garageClient.presignedGetObject(BUCKET, finalKey, expiresIn);
}

/**
 * Delete a file from Garage (S3-compatible object storage).
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function deleteFile(key: string, tenantSlug?: string): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await garageClient.removeObject(BUCKET, finalKey);
}

/**
 * Delete all objects with a given prefix (used for tenant cleanup).
 */
export async function deleteAllWithPrefix(prefix: string): Promise<void> {
  const objectsList: string[] = [];
  const stream = garageClient.listObjectsV2(BUCKET, prefix, true);

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name) objectsList.push(obj.name);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  if (objectsList.length > 0) {
    await garageClient.removeObjects(BUCKET, objectsList);
  }
}

/**
 * Get a file as a readable stream.
 */
export async function getFileStream(key: string, tenantSlug?: string): Promise<Readable> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  return garageClient.getObject(BUCKET, finalKey);
}

export { garageClient, BUCKET };
