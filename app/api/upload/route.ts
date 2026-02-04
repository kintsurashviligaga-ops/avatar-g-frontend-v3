import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, generateR2Key, getSignedDownloadUrl } from '@/lib/storage/r2Client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const jobId = searchParams.get('jobId');
    
    if (!service || !jobId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Missing required query params: service, jobId' },
        { status: 400 }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    let buffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'No file provided' },
          { status: 400 }
        );
      }

      filename = file.name;
      mimeType = file.type || 'application/octet-stream';
      buffer = Buffer.from(await file.arrayBuffer());
    }
    else if (contentType.includes('application/json')) {
      const body = await request.json();
      
      if (!body.base64 || !body.filename) {
        return NextResponse.json(
          { error: 'BAD_REQUEST', message: 'JSON body must contain: base64, filename' },
          { status: 400 }
        );
      }

      filename = body.filename;
      mimeType = body.mimeType || 'application/octet-stream';
      
      const base64Data = body.base64.replace(/^data:.*?;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    }
    else {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Content-Type must be multipart/form-data or application/json' },
        { status: 415 }
      );
    }

    const MAX_SIZE = 100 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE', message: `File size exceeds ${MAX_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      );
    }

    const key = generateR2Key(service, jobId, filename);

    const result = await uploadToR2(key, buffer, {
      contentType: mimeType,
      metadata: {
        service,
        jobId,
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      key: result.key,
      etag: result.etag,
      size: result.size,
      url: result.url,
      expiresIn: 3600,
    });

  } catch (error: any) {
    console.error('[Upload API] Error:', error);
    
    return NextResponse.json(
      { error: error.code || 'UPLOAD_FAILED', message: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const expiresIn = parseInt(searchParams.get('expiresIn') || '3600');

    if (!key) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Missing key parameter' },
        { status: 400 }
      );
    }

    const signedUrl = await getSignedDownloadUrl(key, expiresIn);

    return NextResponse.json({
      success: true,
      key,
      url: signedUrl,
      expiresIn,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'SIGNED_URL_FAILED', message: error.message },
      { status: 500 }
    );
  }
}
