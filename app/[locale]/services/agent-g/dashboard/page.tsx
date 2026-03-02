'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type SubtaskRow = {
  id: string;
  agent: string;
  action: string;
  status: string;
  error?: string;
};

type TaskRow = {
  task_id: string;
  created_at: string;
  status: string;
  demo_mode: boolean;
  subtasks: SubtaskRow[];
  summary?: string;
};

type DashboardResponse = { tasks: TaskRow[] };

export default function AgentGDashboardPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJson<DashboardResponse>('/api/agent-g/dashboard');
        setTasks(data.tasks || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <main className="relative min-h-screen bg-transparent px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={withLocalePath('/services/agent-g', locale)}>
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />{isEn ? 'Back' : 'უკან'}</Button>
          </Link>
          <h1 className="text-xl font-semibold text-white">{isEn ? 'Task History' : 'ტასკების ისტორია'}</h1>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-cyan-400" /></div>}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && tasks.length === 0 && <p className="text-sm text-gray-400">{isEn ? 'No tasks yet.' : 'ტასკები ჯერ არ არის.'}</p>}

        {tasks.map((t) => (
          <Card key={t.task_id} className="border-white/10 bg-white/5 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-gray-400"><Clock className="inline mr-1 h-3.5 w-3.5" />{new Date(t.created_at).toLocaleString()}</span>
              <Badge variant={t.status === 'completed' ? 'success' : t.status === 'failed' ? 'danger' : 'warning'}>{t.status}</Badge>
            </div>
            {t.summary && <p className="text-sm text-gray-200">{t.summary}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {t.subtasks.map((s) => (
                <div key={s.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                  <p className="text-white">{s.agent} / {s.action}</p>
                  <Badge variant={s.status === 'completed' ? 'success' : s.status === 'failed' ? 'danger' : 'secondary'}>{s.status}</Badge>
                  {s.error && <p className="mt-1 text-red-300">{s.error}</p>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
