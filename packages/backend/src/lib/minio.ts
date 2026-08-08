import * as Minio from 'minio';
import { Readable } from 'node:stream';

const endpoint = (process.env.MINIO_ENDPOINT || 'http://localhost:3900').replace(/^https?:\/\//, '');
const portMatch = endpoint.match(/:(\d+)$/);
const host = portMatch ? endpoint.replace(`:${portMatch[1]}`, '') : endpoint;
const port = portMatch ? parseInt(portMatch[1], 10) : 3900;

const minioClient = new Minio.Client({
  endPoint: host,
  port,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  region: process.env.MINIO_REGION || 'garage',
  pathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET || 'sgr-files';

/**
 * Constructs a tenant-namespaced storage key.
 * Format: {slug}/{path}
 */
export function tenantStorageKey(slug: string, path: string): string {
  return `${slug}/${path}`;
}

/**
 * Upload a file to MinIO/Garage.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string,
  tenantSlug?: string,
): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await minioClient.putObject(BUCKET, finalKey, buffer, buffer.length, {
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

  return minioClient.presignedGetObject(BUCKET, finalKey, expiresIn);
}

/**
 * Delete a file from MinIO/Garage.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function deleteFile(key: string, tenantSlug?: string): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await minioClient.removeObject(BUCKET, finalKey);
}

/**
 * Delete all objects with a given prefix (used for tenant cleanup).
 */
export async function deleteAllWithPrefix(prefix: string): Promise<void> {
  const objectsList: string[] = [];
  const stream = minioClient.listObjectsV2(BUCKET, prefix, true);

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name) objectsList.push(obj.name);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });

  if (objectsList.length > 0) {
    await minioClient.removeObjects(BUCKET, objectsList);
  }
}

/**
 * Get a file as a readable stream.
 */
export async function getFileStream(key: string, tenantSlug?: string): Promise<Readable> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  return minioClient.getObject(BUCKET, finalKey);
}

export { minioClient, BUCKET };
