"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function InvestorPage() {
  return (
    <main className="min-h-screen bg-[#050510] text-white">
      <section className="pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <p className="text-sm md:text-base text-cyan-300 tracking-[0.16em] uppercase mb-3">
              პრემიუმ AI პლატფორმა თბილისიდან
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 text-balance leading-tight">
              სტაბილური, უსაფრთხო და მასშტაბური
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto text-balance leading-relaxed">
              ჩვენ ვქმნით მრავალტენანტურ AI ინფრასტრუქტურას, რომელიც აერთიანებს ავატარებს, ხმოვან და ვიდეო გენერაციას.
              იდეალური გადაწყვეტილება გუნდებისთვის, რომლებიც ეძებენ სტაბილურობას და მასშტაბურობას.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card variant="soft" className="h-full">
              <div className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-bold text-cyan-300">Product & Vision</h2>
                <p className="text-gray-300">
                  Avatar G is a Georgian-built AI studio that unifies avatars, media production, and
                  automation into a single, opinionated platform. We focus on stable tooling,
                  predictable performance, and workflows that let enterprises ship fast without
                  experimental chaos.
                </p>
              </div>
            </Card>

            <Card variant="soft" className="h-full">
              <div className="space-y-4">
                <h2 className="text-2xl md:text-3xl font-bold text-cyan-300">Scale, Security & GTM</h2>
                <p className="text-gray-300">
                  Multi-tenant isolation, audited Stripe billing, and observability are built into the
                  core. The go-to-market focuses on creative agencies, studios, and growth teams who
                  need compliant, API-ready infrastructure rather than a toy demo.
                </p>
              </div>
            </Card>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card variant="soft">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">Market & Monetization</h3>
                <p className="text-sm text-gray-300">
                  Targeting creative agencies, studios, and growth teams operating in a multi-billion
                  dollar AI production market. Initial focus on Georgia and EU clients, expanding to
                  US/EU agencies that need reliable avatar and media infrastructure.
                </p>
                <p className="text-xs text-gray-500">
                  TAM/SAM/SOM breakdown and detailed financial model live in the investor deck.
                </p>
              </div>
            </Card>

            <Card variant="soft">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">Revenue Model</h3>
                <p className="text-sm text-gray-300">
                  Hybrid subscription + usage: predictable base seats for teams, with metered usage for
                  avatars, voice, and video generation. Agencies can resell capacity to their own
                  clients using our marketplace and billing rails.
                </p>
                <p className="text-xs text-gray-500">Designed for high gross margins and expansion revenue.</p>
              </div>
            </Card>

            <Card variant="soft">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">Technology Moat</h3>
                <p className="text-sm text-gray-300">
                  Opinionated workflows, multi-tenant observability, and production-grade integrations
                  (Stripe, Supabase, Telegram, WhatsApp) create a defensible operations layer that is
                  harder to copy than a single model or UI.
                </p>
                <p className="text-xs text-gray-500">Composable &quot;Agent G&quot; routes orchestrate providers safely.</p>
              </div>
            </Card>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card variant="soft">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">Roadmap Highlights</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li>
                    <span className="text-cyan-300">Q1–Q2 2026 ·</span> Enterprise demo mode, observability hardening,
                    and affiliate-driven growth engine.
                  </li>
                  <li>
                    <span className="text-cyan-300">Q3 2026 ·</span> Agency onboarding playbooks, white-label dashboards,
                    and advanced billing for multi-tenant clients.
                  </li>
                  <li>
                    <span className="text-cyan-300">Q4 2026 ·</span> Regional expansion, marketplace liquidity, and
                    deeper AI provider routing.
                  </li>
                </ul>
              </div>
            </Card>

            <Card variant="soft">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">Security & Reliability</h3>
                <p className="text-sm text-gray-300">
                  Strict separation of secrets, audited Stripe webhooks, WhatsApp signature
                  verification, and rate-limited APIs. The platform is built to support regulated and
                  brand-sensitive clients from day one.
                </p>
                <p className="text-xs text-gray-500">Detailed audit trail lives in internal production reports.</p>
              </div>
            </Card>
          </div>

          <div className="mt-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">Demo metrics snapshot (mock)</h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              Non-sensitive, illustrative figures for investor conversations. Live metrics are
              available on request.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-black/40 border-cyan-500/30">
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-300">Active workspaces</p>
                  <p className="mt-2 text-2xl font-semibold text-white">42</p>
                  <p className="mt-1 text-[11px] text-gray-500">Mix of agencies, studios, and growth teams.</p>
                </div>
              </Card>
              <Card className="bg-black/40 border-emerald-500/30">
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">Mock MRR</p>
                  <p className="mt-2 text-2xl font-semibold text-white">$28.4k</p>
                  <p className="mt-1 text-[11px] text-gray-500">Illustrative only; not a financial forecast.</p>
                </div>
              </Card>
              <Card className="bg-black/40 border-blue-500/30">
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-300">Monthly AI jobs</p>
                  <p className="mt-2 text-2xl font-semibold text-white">118k</p>
                  <p className="mt-1 text-[11px] text-gray-500">Avatars, voice, and video generation runs.</p>
                </div>
              </Card>
              <Card className="bg-black/40 border-fuchsia-500/30">
                <div className="p-4">
                  <p className="text-xs uppercase tracking-wide text-fuchsia-300">SLA target</p>
                  <p className="mt-2 text-2xl font-semibold text-white">99.9%</p>
                  <p className="mt-1 text-[11px] text-gray-500">Designed for always-on creative workflows.</p>
                </div>
              </Card>
            </div>
          </div>

          <div className="mt-16 text-center space-y-3">
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="primary"
                size="lg"
                className="px-8 gap-2 shadow-[0_0_32px_rgba(34,211,238,0.35)] hover:shadow-[0_0_40px_rgba(34,211,238,0.45)]"
              >
                დაიწყე უფასოდ
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                size="lg"
                className="px-8 gap-2 border-cyan-300 text-cyan-300 hover:bg-cyan-300 hover:text-black"
              >
                ნახე დემო
              </Button>
            </motion.div>
            <p className="text-xs text-gray-400">
              არ არის საჭირო ბარათი. ნებისმიერ დროს შეგიძლიათ გააუქმოთ.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}