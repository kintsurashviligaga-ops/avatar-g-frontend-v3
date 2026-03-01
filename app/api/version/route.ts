import { NextResponse } from 'next/server';

const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const buildTime = new Date().toISOString();

export const dynamic = 'force-static';
export const revalidate = false;

export function GET() {
  return NextResponse.json({
    sha: sha.slice(0, 7),
    shaFull: sha,
    buildTime,
    env: process.env.NODE_ENV,
  });
}
