import { NextRequest, NextResponse } from 'next/server';
import { uploadToR2, generateR2Key, getSignedDownloadUrl } from '@/lib/storage/r2Client';

export const runtime = 'nodejs';

const ALLOWED_TYPES: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// POST /api/image-generator
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const imageFile = formData.get('image') as File | null;
    const jobId     = formData.get('jobId')  as string | null;
    const service   = (formData.get('service') as string | null) ?? 'image-generator';

    if (!imageFile) {
      return NextResponse.json({ success: false, error: 'Missing field: image' }, { status: 400 });
    }
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'Missing field: jobId' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[imageFile.type];
    if (!ext) {
      return NextResponse.json(
        { success: false, error: `Invalid image type "${imageFile.type}". Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
        { status: 400 }
      );
    }
    if (imageFile.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (${(imageFile.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_SIZE_MB} MB` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const key    = generateR2Key(service, jobId, `output.${ext}`);

    const result = await uploadToR2(key, buffer, {
      contentType: imageFile.type,
      metadata: { service, jobId, originalName: imageFile.name },
    });

    return NextResponse.json({
      success:     true,
      url:         result.url,
      key:         result.key,
      size:        imageFile.size,
      contentType: imageFile.type,
    });

  } catch (error: any) {
    console.error('[POST /api/image-generator]', error);
    return NextResponse.json({ success: false, error: error.message ?? 'Upload failed' }, { status: 500 });
  }
}

// GET /api/image-generator?key=<r2-key>
export async function GET(request: NextRequest) {
  try {
    const key = new URL(request.url).searchParams.get('key');

    if (!key) {
      return NextResponse.json({ success: false, error: 'Missing query param: key' }, { status: 400 });
    }

    const url = await getSignedDownloadUrl(key);
    return NextResponse.json({ success: true, url, key });

  } catch (error: any) {
    console.error('[GET /api/image-generator]', error);
    return NextResponse.json({ success: false, error: error.message ?? 'Failed to generate URL' }, { status: 500 });
  }
}
