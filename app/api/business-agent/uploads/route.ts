import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { generateKey, uploadBuffer } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return apiError(new Error('No files provided'), 400, 'files[] required');
    }

    const uploaded: Array<{
      id: string;
      name: string;
      size: number;
      type: string;
      uploaded_at: string;
      url: string;
      storage_key: string;
    }> = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return apiError(new Error(`Unsupported file type: ${file.type}`), 400, 'Unsupported file type');
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return apiError(new Error(`File too large: ${file.name}`), 400, 'File exceeds limit');
      }

      const extension = (file.name.split('.').pop() || 'bin').toLowerCase();
      const key = generateKey('business-agent-input', user.id, extension);
      const bytes = await file.arrayBuffer();
      const url = await uploadBuffer(Buffer.from(bytes), key, file.type || 'application/octet-stream');

      uploaded.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
        uploaded_at: new Date().toISOString(),
        url,
        storage_key: key,
      });
    }

    const supabase = createServiceRoleClient();
    const { data: job } = await supabase
      .from('service_jobs')
      .insert({
        user_id: user.id,
        service_slug: 'business-agent-upload',
        title: 'Business Agent upload processing',
        status: 'completed',
        progress: 100,
        input_payload: {
          files: uploaded.map((file) => ({ name: file.name, size: file.size, type: file.type, storage_key: file.storage_key })),
        },
        output_payload: {
          processed_files: uploaded.length,
          completed_at: new Date().toISOString(),
        },
        heartbeat_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return apiSuccess({ files: uploaded, jobId: job?.id ?? null }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to upload Business Agent files');
  }
}
