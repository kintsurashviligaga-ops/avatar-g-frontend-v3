import { Skeleton } from '@/components/ui/Skeleton';

export default function LoadingServicesPage() {
  return (
    <section className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-5 w-full max-w-2xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-36 lg:col-span-2" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-56 w-full" />
    </section>
  );
}
