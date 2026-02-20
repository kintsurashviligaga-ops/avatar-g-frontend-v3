'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SpaceBackground from '@/components/SpaceBackground';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createBrowserClient } from '@/lib/supabase/browser';
import { fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type Task = {
  id: string;
  goal: string;
  status: string;
  created_at: string;
};

type SubTask = {
  id: string;
  task_id: string;
  agent_name: string;
  status: string;
};

export default function AgentGDashboardPage() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);

  useEffect(() => {
    const run = async () => {
      const supabase = createBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchJson<{ tasks: Task[]; subtasks: SubTask[] }>('/api/agent-g/status');
        setTasks(data.tasks || []);
        setSubtasks(data.subtasks || []);
      } catch (err) {
        setError(toUserMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SubTask[]>();
    subtasks.forEach((item) => {
      const arr = map.get(item.task_id) || [];
      arr.push(item);
      map.set(item.task_id, arr);
    });
    return map;
  }, [subtasks]);

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />
      <div className="relative z-10 mx-auto max-w-6xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold text-white">{isEn ? 'Agent G Dashboard' : 'Agent G Dashboard'}</h1>
            <Link href={withLocalePath('/services/agent-g', locale)}><Button variant="secondary">{isEn ? 'Back to Agent G' : 'Agent G-ზე დაბრუნება'}</Button></Link>
          </div>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </Card>

        {!authenticated ? (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{isEn ? 'Login required to view task history.' : 'ისტორიის სანახავად საჭიროა ავტორიზაცია.'}</Card>
        ) : loading ? (
          <Card className="h-52 animate-pulse border-white/10 bg-white/5" />
        ) : (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-300">{isEn ? 'No Agent G tasks yet.' : 'Agent G task-ები ჯერ არ არის.'}</Card>
            ) : tasks.map((task) => (
              <Card key={task.id} className="border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{task.goal}</p>
                    <p className="text-xs text-gray-400">{new Date(task.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={task.status === 'completed' ? 'success' : task.status === 'failed' ? 'danger' : 'warning'}>{task.status}</Badge>
                    <a href={`/api/agent-g/output?task_id=${encodeURIComponent(task.id)}&format=pdf`}><Button size="sm" variant="secondary">PDF</Button></a>
                    <a href={`/api/agent-g/output?task_id=${encodeURIComponent(task.id)}&format=zip`}><Button size="sm" variant="secondary">ZIP</Button></a>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get(task.id) || []).map((subtask) => (
                    <div key={subtask.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                      <p className="text-white">{subtask.agent_name}</p>
                      <p className="text-gray-400">{subtask.status}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
