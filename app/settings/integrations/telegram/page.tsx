"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type TelegramStatusResponse = {
  ok?: boolean;
  data?: {
    ok?: boolean;
    telegram_ok?: boolean;
    http_ok?: boolean;
    webhook?: {
      url?: string | null;
      pending_update_count?: number;
      has_custom_certificate?: boolean | null;
      max_connections?: number | null;
      ip_address?: string | null;
      allowed_updates?: string[];
    };
    last_error?: {
      date?: number | null;
      message?: string | null;
      sync_date?: number | null;
    };
    raw?: unknown;
  };
  error?: { message?: string };
};

type TelegramSetupResponse = {
  ok?: boolean;
  data?: {
    ok?: boolean;
    webhook_url?: string;
    telegram?: {
      ok?: boolean;
      description?: string;
    };
  };
  error?: { message?: string };
};

export default function TelegramIntegrationSettingsPage() {
  const [secret, setSecret] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [status, setStatus] = useState<TelegramStatusResponse["data"] | null>(null);
  const [setupResult, setSetupResult] = useState<TelegramSetupResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => secret.trim().length > 0, [secret]);

  const fetchStatus = async () => {
    if (!canSubmit) return;
    setLoadingStatus(true);
    setError(null);

    try {
      const response = await fetch(`/api/agent-g/telegram/status?secret=${encodeURIComponent(secret.trim())}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as TelegramStatusResponse;
      if (!response.ok || payload.ok === false) {
        const message = payload.error?.message || "Failed to load Telegram status";
        throw new Error(message);
      }

      setStatus(payload.data || null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Failed to load Telegram status");
    } finally {
      setLoadingStatus(false);
    }
  };

  const setWebhook = async () => {
    if (!canSubmit) return;
    setLoadingSetup(true);
    setError(null);

    try {
      const response = await fetch(`/api/agent-g/telegram/set-webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: secret.trim(),
        }),
        cache: "no-store",
      });

      const payload = (await response.json()) as TelegramSetupResponse;
      if (!response.ok || payload.ok === false) {
        const message = payload.error?.message || "Failed to set Telegram webhook";
        throw new Error(message);
      }

      setSetupResult(payload.data || null);
    } catch (err) {
      setSetupResult(null);
      setError(err instanceof Error ? err.message : "Failed to set Telegram webhook");
    } finally {
      setLoadingSetup(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#05070A] text-white pt-20 px-4 pb-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Telegram Integration</h1>
              <p className="mt-1 text-sm text-gray-400">Configure webhook and check delivery status for Agent G.</p>
            </div>
            <Link href="/settings" className="text-sm text-cyan-300 hover:text-cyan-200">
              Back to settings
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            <label className="block text-sm text-gray-300">Webhook secret</label>
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Enter TELEGRAM_WEBHOOK_SECRET"
              className="w-full rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            />
            <p className="text-xs text-gray-500">Secret is used only for secure setup/status requests.</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={fetchStatus}
              disabled={!canSubmit || loadingStatus || loadingSetup}
              className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2.5 text-sm text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingStatus ? "Checking..." : "Check Status"}
            </button>
            <button
              onClick={setWebhook}
              disabled={!canSubmit || loadingSetup || loadingStatus}
              className="rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingSetup ? "Setting..." : "Set Webhook"}
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        {setupResult && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Setup Result</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-200">
              <p>Request ok: {String(Boolean(setupResult.ok))}</p>
              <p>Telegram ok: {String(Boolean(setupResult.telegram?.ok))}</p>
              <p>Telegram message: {setupResult.telegram?.description || "n/a"}</p>
              <p className="break-all">Webhook URL: {setupResult.webhook_url || "n/a"}</p>
            </div>
          </section>
        )}

        {status && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold">Webhook Status</h2>
            <div className="mt-3 grid gap-2 text-sm text-gray-200">
              <p>Request ok: {String(Boolean(status.ok))}</p>
              <p>Telegram ok: {String(Boolean(status.telegram_ok))}</p>
              <p>HTTP ok: {String(Boolean(status.http_ok))}</p>
              <p className="break-all">Configured URL: {status.webhook?.url || "n/a"}</p>
              <p>Pending updates: {status.webhook?.pending_update_count ?? 0}</p>
              <p>Last error: {status.last_error?.message || "none"}</p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
