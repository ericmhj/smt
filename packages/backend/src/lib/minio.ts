import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:3900',
  region: process.env.MINIO_REGION || 'garage',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true, // Required for S3-compatible storage
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
 * Upload a file to MinIO/S3.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  mimeType: string,
  tenantSlug?: string,
): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: finalKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );
}

/**
 * Generate a presigned download URL for a file.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 * Backward compatibility: if the key doesn't contain a slash prefix matching a tenant,
 * it's treated as belonging to the 'default' tenant.
 */
export async function getFileUrl(
  key: string,
  expiresIn = 3600,
  tenantSlug?: string,
): Promise<string> {
  let finalKey = key;
  if (tenantSlug) {
    // If key already starts with a tenant prefix, use as-is
    if (!key.startsWith(`${tenantSlug}/`)) {
      finalKey = tenantStorageKey(tenantSlug, key);
    }
  } else if (!key.includes('/')) {
    // Backward compat: non-prefixed keys map to "default" tenant
    finalKey = tenantStorageKey('default', key);
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: finalKey,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from MinIO/S3.
 * If tenantSlug is provided, the key is prefixed with the tenant slug.
 */
export async function deleteFile(key: string, tenantSlug?: string): Promise<void> {
  const finalKey = tenantSlug ? tenantStorageKey(tenantSlug, key) : key;
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: finalKey,
    }),
  );
}

/**
 * Delete all objects with a given prefix (used for tenant cleanup).
 */
export async function deleteAllWithPrefix(prefix: string): Promise<void> {
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: BUCKET,
              Key: obj.Key,
            }),
          );
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
}

export { s3Client, BUCKET };
