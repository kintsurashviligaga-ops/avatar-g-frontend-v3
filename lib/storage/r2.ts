export {
  uploadToR2,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  objectExists,
  deleteFromR2,
  generateR2Key,
  R2_BUCKET_NAME,
  R2_ACCOUNT_ID,
} from './r2Client';

export class R2Storage {
  static async uploadFile(
    service: string,
    jobId: string,
    filename: string,
    body: Buffer | string
  ): Promise<string> {
    const { uploadToR2, generateR2Key } = await import('./r2Client');
    const key = generateR2Key(service, jobId, filename);
    const result = await uploadToR2(key, body);
    return result.url;
  }

  static async uploadText(
    service: string,
    jobId: string,
    filename: string,
    text: string
  ): Promise<string> {
    const { uploadToR2, generateR2Key } = await import('./r2Client');
    const key = generateR2Key(service, jobId, filename);
    const buffer = Buffer.from(text, 'utf-8');
    const result = await uploadToR2(key, buffer, {
      contentType: 'text/plain; charset=utf-8',
    });
    return result.url;
  }

  static async uploadJSON(
    service: string,
    jobId: string,
    filename: string,
    data: any
  ): Promise<string> {
    const { uploadToR2, generateR2Key } = await import('./r2Client');
    const key = generateR2Key(service, jobId, filename);
    const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    const result = await uploadToR2(key, buffer, {
      contentType: 'application/json',
    });
    return result.url;
  }
}
