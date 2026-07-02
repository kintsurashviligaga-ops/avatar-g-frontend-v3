'use client';

/**
 * Minimal admin view for STEP 5 optimizer proposals. Lists OPEN ('proposed') proposals and the
 * ONLY control that mutates live config: Approve (→ promotes a new agent_configs version, prior
 * kept for rollback) / Reject. Nothing is live until a human clicks. Backed by the isAdmin-gated
 * /api/agent/proposals (list) + /api/agent/proposals/[id]/approve|reject.
 */
import { useCallback, useEffect, useState } from 'react';

interface Proposal {
  id: string;
  agent_type: string;
  model: string | null;
  kind: string;
  priority: string;
  rationale: string;
  status: string;
  created_at: string;
}

const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16 };
const PRIORITY_COLOR: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#0ea5e9' };

export default function AgentProposalsReview() {
  const [items, setItems] = useState<Proposal[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/agent/proposals?status=proposed', { cache: 'no-store' });
      const j = await r.json();
      setItems(Array.isArray(j.proposals) ? j.proposals : []);
      setNote(j.note ?? null);
    } catch {
      setNote('Could not load proposals.');
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const r = await fetch(`/api/agent/proposals/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      setNote(j.ok ? (action === 'approve' ? `Promoted ${j.target} → v${j.version}. Prior version kept for rollback.` : 'Proposal rejected.') : (j.error || `${action} failed`));
      await load();
    } catch {
      setNote(`${action} failed (network).`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px 60px', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Agent config proposals</h1>
      <p style={{ marginTop: 6, marginBottom: 18, fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
        The self-improving loop only <strong style={{ color: 'rgba(255,255,255,0.8)' }}>proposes</strong>. <strong style={{ color: '#34d399' }}>Approve</strong> promotes a new
        active config version (the prior stays for instant rollback); <strong>nothing is live until you click.</strong>
      </p>

      {note && (
        <div style={{ ...card, padding: 12, marginBottom: 14, borderColor: 'rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.06)', fontSize: 13, color: '#7dd3fc' }}>{note}</div>
      )}

      {!loaded ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No pending proposals. The daily optimizer will add some as feedback accrues.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((p) => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: PRIORITY_COLOR[p.priority] ?? '#94a3b8', background: `${PRIORITY_COLOR[p.priority] ?? '#94a3b8'}18`, padding: '3px 9px', borderRadius: 999 }}>{p.priority}</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{p.agent_type}{p.model ? ` · ${p.model}` : ''} · {p.kind}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>{p.rationale}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={busy === p.id} onClick={() => act(p.id, 'approve')}
                  style={{ padding: '8px 16px', borderRadius: 999, border: 'none', fontSize: 13, fontWeight: 600, color: '#04120b', background: '#34d399', cursor: busy === p.id ? 'default' : 'pointer', opacity: busy === p.id ? 0.5 : 1 }}>
                  Approve → promote
                </button>
                <button type="button" disabled={busy === p.id} onClick={() => act(p.id, 'reject')}
                  style={{ padding: '8px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', background: 'transparent', cursor: busy === p.id ? 'default' : 'pointer', opacity: busy === p.id ? 0.5 : 1 }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
