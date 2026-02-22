import { POST as canonicalTelegramPost } from '../route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  return canonicalTelegramPost(req);
}