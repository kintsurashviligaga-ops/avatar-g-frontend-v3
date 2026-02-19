"use client";

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Download, Link2 } from 'lucide-react';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

type Output = {
  id: string;
  service_slug: string;
  output_type: 'image' | 'video' | 'audio' | 'text';
  external_url: string | null;
  signed_url?: string | null;
  created_at: string;
};

export default function LibraryPage() {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await fetch('/api/app/outputs', { cache: 'no-store' });
      const data = await response.json();
      setOutputs(data.outputs ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    addToast('success', 'Asset link copied');
  };

  return (
    <div>
      <ServiceHeader title="Assets Library" description="All generated outputs in one premium media library." />

      {loading ? (
        <Card>
          <CardContent className="py-10">
            <Spinner label="Loading assets..." />
          </CardContent>
        </Card>
      ) : outputs.length === 0 ? (
        <EmptyState title="No assets yet" description="Run services to build your output library." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {outputs.map((output) => {
            const assetUrl = output.signed_url || output.external_url;
            return (
              <Card key={output.id}>
                <CardContent>
                  <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-black/35">
                    {output.output_type === 'image' && assetUrl ? (
                      <Image src={assetUrl} alt={output.service_slug} width={1200} height={800} className="h-40 w-full object-cover" unoptimized />
                    ) : (
                      <div className="flex h-40 items-center justify-center text-sm text-app-muted">{output.output_type.toUpperCase()} output</div>
                    )}
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="truncate text-sm font-medium text-app-text">{output.service_slug}</p>
                    <Badge variant="accent">{output.output_type}</Badge>
                  </div>
                  <div className="flex gap-2">
                    {assetUrl ? (
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => window.open(assetUrl, '_blank')}>
                        <Download className="mr-1 h-3.5 w-3.5" /> Download
                      </Button>
                    ) : null}
                    {assetUrl ? (
                      <Button variant="ghost" size="sm" onClick={() => copyLink(assetUrl)}>
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}