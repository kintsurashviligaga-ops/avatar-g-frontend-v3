/**
 * Cloudflare R2 Client (AWS SDK v3)
 * Production-ready with lazy validation (build-time safe)
 */

import { S3Client } from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const requiredEnvVars = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_ENDPOINT',
  'R2_REGION',
] as const;

// Lazy validation - only validate when actually used, not on import
function validateEnv(): void {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[R2] Missing required environment variables: ${missing.join(', ')}\n` +
      `Please set them in Vercel → Settings → Environment Variables\n` +
      `Missing: ${missing.join(', ')}`
    );
  }
}

// Lazy client initialization
let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  // Validate env vars on first use
  if (!_r2Client) {
    validateEnv();
    
    _r2Client = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: false,
    });
  }
  
  return _r2Client;
}

export const r2Client = {
  get client() {
    return getR2Client();
  }
};

// Lazy getters for env vars
export const R2_BUCKET_NAME = () => {
  if (!process.env.R2_BUCKET_NAME) {
    throw new Error('[R2] R2_BUCKET_NAME not set');
  }
  return process.env.R2_BUCKET_NAME;
};

export const R2_ACCOUNT_ID = () => {
  if (!process.env.R2_ACCOUNT_ID) {
    throw new Error('[R2] R2_ACCOUNT_ID not set');
  }
  return process.env.R2_ACCOUNT_ID;
};

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface UploadResult {
  key: string;
  etag: string;
  url: string;
  size: number;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | string,
  options?: UploadOptions
): Promise<UploadResult> {
  try {
    const client = getR2Client();
    const bucket = R2_BUCKET_NAME();
    
    const bodyBuffer = Buffer.isBuffer(body) 
      ? body 
      : typeof body === 'string' 
      ? Buffer.from(body, 'utf-8')
      : Buffer.from(body);

    const input: PutObjectCommandInput = {
      Bucket: bucket,
      Key: key,
      Body: bodyBuffer,
      ContentType: options?.contentType || 'application/octet-stream',
      Metadata: options?.metadata,
      CacheControl: options?.cacheControl || 'public, max-age=31536000, immutable',
    };

    const command = new PutObjectCommand(input);
    const response = await client.send(command);

    const signedUrl = await getSignedDownloadUrl(key, 3600);

    return {
      key,
      etag: response.ETag?.replace(/"/g, '') || '',
      url: signedUrl,
      size: bodyBuffer.length,
    };
  } catch (error: any) {
    console.error('[R2] Upload error:', {
      key,
      errorName: error.name,
      errorCode: error.Code,
      errorMessage: error.message,
    });
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
}

export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const client = getR2Client();
    const bucket = R2_BUCKET_NAME();
    
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(client, command, {
      expiresIn,
    });

    return signedUrl;
  } catch (error: any) {
    console.error('[R2] Signed URL error:', { key, error: error.message });
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const client = getR2Client();
    const bucket = R2_BUCKET_NAME();
    
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(client, command, {
      expiresIn,
    });

    return signedUrl;
  } catch (error: any) {
    throw new Error(`Failed to generate presigned upload URL: ${error.message}`);
  }
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    const client = getR2Client();
    const bucket = R2_BUCKET_NAME();
    
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  try {
    const client = getR2Client();
    const bucket = R2_BUCKET_NAME();
    
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    await client.send(command);
  } catch (error: any) {
    throw new Error(`Failed to delete from R2: ${error.message}`);
  }
}

export function generateR2Key(
  service: string,
  jobId: string,
  filename: string
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
  
  return `${service}/${year}/${month}/${jobId}/${sanitized}`;
}

export default {
  uploadToR2,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  objectExists,
  deleteFromR2,
  generateR2Key,
  get R2_BUCKET_NAME() { return R2_BUCKET_NAME(); },
  get R2_ACCOUNT_ID() { return R2_ACCOUNT_ID(); },
};
