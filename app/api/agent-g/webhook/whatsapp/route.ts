import { GET as canonicalGet, POST as canonicalPost } from '@/app/api/webhooks/whatsapp/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return canonicalGet(request);
}

export async function POST(request: Request) {
  return canonicalPost(request);
}
