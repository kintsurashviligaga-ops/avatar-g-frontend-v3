'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Sparkles,
} from 'lucide-react';
import {
  DASHBOARD_ACTIVITY,
  DASHBOARD_METRICS,
  DASHBOARD_QUICK_CARDS,
} from '@/components/dashboard/hyperframe.config';

// ─── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'ka';

  return (
    <div className="hf-main-content mx-auto max-w-7xl space-y-6">
      <section className="hf-hero p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/75">
              <Sparkles className="h-3.5 w-3.5" />
              Hyperframe Command Layer
            </p>
            <h1 className="hf-heading text-3xl font-bold text-white sm:text-4xl">Dashboard</h1>
            <p className="mt-1.5 text-sm text-cyan-100/65">MyAvatar.ge - AI Civilization Stack</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-cyan-300/85">
              One Window Dashboard · ერთი ფანჯრის პრინციპი
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${locale}/dashboard/agent-g`}
              className="hf-cta inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            >
              Start with Agent G
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DASHBOARD_METRICS.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.id} className="hf-card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/45">{metric.label}</span>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${metric.color}1f`, border: `1px solid ${metric.color}3b` }}
                >
                  <Icon className="h-4 w-4" style={{ color: metric.color }} />
                </div>
              </div>
              <p className="hf-stat-value text-3xl font-bold text-white">{metric.value}</p>
              <p className="mt-1 text-xs text-cyan-100/50">{metric.sub}</p>
              <p className="mt-2 text-[11px] font-semibold" style={{ color: metric.color }}>
                {metric.trend}
              </p>
            </article>
          );
        })}
      </section>

      <section className="hf-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="hf-heading text-lg font-semibold text-white">Quick Launch</h2>
          <span className="hf-pill rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-cyan-100/75">
            10 Active Modules
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {DASHBOARD_QUICK_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.id}
                href={`/${locale}${card.href}`}
                className="hf-card group p-4 transition-all duration-200 hover:-translate-y-0.5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: `${card.color}22`, border: `1px solid ${card.color}52` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: card.color }} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-cyan-100/35 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="hf-heading text-sm font-semibold text-white/95">{card.label}</p>
                <p className="mt-1 text-[11px] text-cyan-100/45">{card.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="hf-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-cyan-100/10 px-5 py-4">
          <h2 className="hf-heading text-base font-semibold text-white">Recent Activity</h2>
          <button className="text-xs font-medium text-cyan-200/80 transition-colors hover:text-cyan-100">View all</button>
        </div>

        <div>
          {DASHBOARD_ACTIVITY.map((entry, i) => {
            const Icon = entry.icon;
            return (
              <article
                key={entry.id}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-cyan-200/[0.03]"
                style={{ borderBottom: i < DASHBOARD_ACTIVITY.length - 1 ? '1px solid rgba(165,243,252,0.08)' : 'none' }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: `${entry.color}1f`, border: `1px solid ${entry.color}3b` }}
                >
                  <Icon className="h-4 w-4" style={{ color: entry.color }} />
                </div>
                <p className="flex-1 truncate text-sm text-cyan-50/85">{entry.text}</p>
                <div className="flex items-center gap-2 text-[11px] text-cyan-100/45">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{entry.time}</span>
                  {entry.status === 'done' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
