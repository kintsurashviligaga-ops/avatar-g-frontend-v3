import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!
  }
});

const BUCKET = process.env.STORAGE_BUCKET || "avatar-g-generations";

export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read"
    }));

    return `${process.env.STORAGE_ENDPOINT}/${BUCKET}/${key}`;
  } catch (error) {
    console.error("Upload error:", error);
    throw new Error("Failed to upload file");
  }
}

export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export function generateKey(type: string, userId: string, ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}/${userId}/${timestamp}-${random}.${ext}`;
}
