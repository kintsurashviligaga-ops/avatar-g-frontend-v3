import Link from 'next/link';
import Image from 'next/image';
import { safeAvatarFetch } from '@/lib/avatar/safeAvatarFetch';

type AvatarPageProps = {
  params: {
    id: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function AvatarPage({ params }: AvatarPageProps) {
  const avatar = await safeAvatarFetch(params.id);

  if (!avatar) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
          <h1 className="text-2xl font-semibold text-white">Avatar not found yet</h1>
          <p className="mt-2 text-sm text-gray-300">
            This avatar may not exist, may have been removed, or is not available for your session.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/workspace?create=true" className="inline-flex rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-sm font-medium text-white">
              Create Your First Avatar
            </Link>
            <Link href="/workspace" className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5">
              Back to Workspace
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <h1 className="text-2xl font-semibold text-white">{avatar.name || 'Saved Avatar'}</h1>
        <p className="mt-1 text-xs text-gray-400">Created {new Date(avatar.created_at).toLocaleString()}</p>

        {avatar.preview_image_url ? (
          <div className="relative mt-5 h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
            <Image
              src={avatar.preview_image_url}
              alt={avatar.name || 'Avatar preview'}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 960px"
              unoptimized
            />
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-white/20 p-8 text-sm text-gray-300">
            No preview image is available for this avatar yet.
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/workspace" className="inline-flex rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/5">
            Back to Workspace
          </Link>
          <Link href="/services/avatar-builder" className="inline-flex rounded-lg border border-cyan-500/40 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/10">
            Open Avatar Builder
          </Link>
        </div>
      </section>
    </main>
  );
}
