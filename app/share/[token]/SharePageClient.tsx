'use client';

import type { Creation } from './page';

type Kind = 'image' | 'video' | 'audio' | 'avatar' | 'text' | 'code';

const KIND_COLOR: Record<Kind, string> = {
  image: '#0ea5e9', video: '#3b82f6', audio: '#22d3ee',
  avatar: '#f59e0b', text: '#10b981', code: '#f97316',
};
const KIND_ICON: Record<Kind, string> = {
  image: '🎨', video: '🎬', audio: '🎵', avatar: '🧑', text: '📝', code: '💻',
};
const KIND_KA: Record<Kind, string> = {
  image: 'სურათი', video: 'ვიდეო', audio: 'აუდიო', avatar: 'ავატარი', text: 'ტექსტი', code: 'კოდი',
};

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('ka-GE', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch { return iso.slice(0, 10); }
}

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 24, fontFamily: 'system-ui,sans-serif', color: '#f0f0f5' }}>
      <div style={{ fontSize: 64 }}>🔗</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>კონტენტი ვერ მოიძებნა</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 320 }}>
        ეს გაზიარება არ არსებობს ან გახდა პირადი.
      </p>
      <a href="https://myavatar.ge" style={{ padding: '10px 22px', background: 'linear-gradient(135deg,#0369a1,#0ea5e9)', borderRadius: 10, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
        Avatar G-ზე დაბრუნება
      </a>
    </div>
  );
}

function MediaDisplay({ creation }: { creation: Creation }) {
  const { kind, url, thumbnail_url, title } = creation;

  if (!url && !thumbnail_url) {
    return (
      <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(255,255,255,0.04)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 48 }}>{KIND_ICON[kind as Kind]}</span>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>მედია მიუწვდომელია</p>
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <video
        src={url ?? undefined}
        poster={thumbnail_url ?? undefined}
        controls
        playsInline
        preload="metadata"
        style={{ width: '100%', maxHeight: 520, borderRadius: 16, background: '#000', display: 'block' }}
      />
    );
  }

  if (kind === 'audio') {
    return (
      <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {thumbnail_url && (
          <img src={thumbnail_url} alt={title ?? 'audio'} style={{ width: 160, height: 160, borderRadius: 12, objectFit: 'cover' }} />
        )}
        <audio src={url ?? undefined} controls style={{ width: '100%', maxWidth: 400 }} />
      </div>
    );
  }

  return (
    <img
      src={url ?? thumbnail_url ?? ''}
      alt={title ?? KIND_KA[kind as Kind]}
      style={{ width: '100%', maxHeight: 640, objectFit: 'contain', borderRadius: 16, display: 'block', background: '#000' }}
    />
  );
}

export default function SharePageClient({ creation }: { creation: Creation | null }) {
  if (!creation) return <NotFound />;

  const color = KIND_COLOR[creation.kind as Kind] ?? '#0ea5e9';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0e', color: '#f0f0f5', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: `radial-gradient(ellipse 80% 50% at 20% -10%, ${color}28 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(14,165,233,0.12) 0%, transparent 55%)` }} />

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', background: 'rgba(10,10,14,0.7)' }}>
        <a href="https://myavatar.ge" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#0284c7,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff' }}>G</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Avatar G</span>
        </a>
        <a href="https://myavatar.ge" style={{ padding: '7px 16px', background: 'linear-gradient(135deg,#0369a1,#0ea5e9)', borderRadius: 8, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
          Avatar G-ში გახსნა →
        </a>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, position: 'relative', zIndex: 1, maxWidth: 860, width: '100%', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>

        {/* Kind badge + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ padding: '4px 12px', background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 20, fontSize: 12, fontWeight: 700, color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {KIND_ICON[creation.kind as Kind]} {KIND_KA[creation.kind as Kind]}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{formatDate(creation.created_at)}</span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 'clamp(20px,4vw,28px)', fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: creation.prompt ? 12 : 20 }}>
          {creation.title ?? `AI ${KIND_KA[creation.kind as Kind]} - Avatar G`}
        </h1>

        {/* Prompt */}
        {creation.prompt && (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 24, maxWidth: 640, borderLeft: `3px solid ${color}66`, paddingLeft: 12 }}>
            {creation.prompt.slice(0, 280)}{creation.prompt.length > 280 ? '…' : ''}
          </p>
        )}

        {/* Media */}
        <div style={{ marginBottom: 24, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
          <MediaDisplay creation={creation} />
        </div>

        {/* Primary CTA — "Create Similar" */}
        <a
          href={creation.prompt
            ? `https://myavatar.ge/ka/dashboard?prompt=${encodeURIComponent(creation.prompt)}`
            : 'https://myavatar.ge/ka/dashboard'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '16px 28px',
            background: `linear-gradient(135deg, ${color}cc, #0284c7)`,
            borderRadius: 14,
            color: '#fff', textDecoration: 'none',
            fontSize: 16, fontWeight: 700,
            boxShadow: `0 0 28px ${color}44, 0 4px 16px rgba(0,0,0,0.3)`,
            transition: 'transform 0.15s, box-shadow 0.15s',
            marginBottom: 12,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1.03)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'scale(1)'; }}
        >
          <span style={{ fontSize: 20 }}>{KIND_ICON[creation.kind as Kind] ?? '✨'}</span>
          ამის მსგავსი შევქმნა Avatar G-ით →
        </a>

        {/* Secondary action buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {creation.url && (
            <a
              href={creation.url}
              download
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 500, transition: 'background 0.15s' }}
            >
              ⬇ ჩამოტვირთვა
            </a>
          )}
          {creation.prompt && (
            <a
              href={`https://myavatar.ge/ka/dashboard?prompt=${encodeURIComponent(creation.prompt)}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 10, color, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
            >
              🔄 Remix
            </a>
          )}
          <a
            href="https://myavatar.ge"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 10, color: '#7dd3fc', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            🏠 Avatar G-ის მთავარი
          </a>
        </div>

        {/* Footer credit */}
        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#0284c7,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>G</div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>შექმნილია Avatar G AI-ით · myavatar.ge</span>
        </div>
      </main>
    </div>
  );
}
