/**
 * Premium visual header for service cards.
 *
 * Renders a service-specific gradient background with a unique inline-SVG
 * illustration for each of the 17 services. Zero external images — the visuals
 * are entirely CSS/SVG, theme-aware, and resolution-independent.
 */
import { SERVICE_VISUALS } from '@/lib/services/visuals';

type Variant = 'card' | 'thumb' | 'hero' | 'banner';

type Props = {
  serviceId: string;
  variant?: Variant;
  className?: string;
};

const HEIGHTS: Record<Variant, string> = {
  thumb: 'h-14',
  card: 'h-40',
  banner: 'h-48',
  hero: 'h-64',
};

/* ─── Main component ──────────────────────────────────────────────────── */

export function ServiceCardVisual({ serviceId, variant = 'card', className = '' }: Props) {
  const config = SERVICE_VISUALS[serviceId];
  if (!config) return null;

  return (
    <div
      className={`relative overflow-hidden ${HEIGHTS[variant]} ${className}`}
      style={{ background: config.gradient }}
    >
      {/* ambient glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 40%, ${config.accent}33, transparent)`,
        }}
      />
      {/* scene SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {renderScene(serviceId, config.accent, config.accentSecondary)}
      </svg>
      {/* bottom fade for text overlay */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--color-bg)]/60 to-transparent" />
    </div>
  );
}

/* ─── Scene router ────────────────────────────────────────────────────── */

function renderScene(id: string, c1: string, c2: string) {
  switch (id) {
    case 'avatar':       return <AvatarScene c1={c1} c2={c2} />;
    case 'video':        return <VideoScene c1={c1} c2={c2} />;
    case 'editing':      return <EditingScene c1={c1} c2={c2} />;
    case 'music':        return <MusicScene c1={c1} c2={c2} />;
    case 'photo':        return <PhotoScene c1={c1} c2={c2} />;
    case 'image':        return <ImageScene c1={c1} c2={c2} />;
    case 'media':        return <MediaScene c1={c1} c2={c2} />;
    case 'text':         return <TextScene c1={c1} c2={c2} />;
    case 'prompt':       return <PromptScene c1={c1} c2={c2} />;
    case 'visual-intel': return <VisualIntelScene c1={c1} c2={c2} />;
    case 'workflow':     return <WorkflowScene c1={c1} c2={c2} />;
    case 'shop':         return <ShopScene c1={c1} c2={c2} />;
    case 'software':     return <SoftwareScene c1={c1} c2={c2} />;
    case 'business':     return <BusinessScene c1={c1} c2={c2} />;
    case 'agent-g':      return <AgentGScene c1={c1} c2={c2} />;
    case 'tourism':      return <TourismScene c1={c1} c2={c2} />;
    case 'next':         return <NextScene c1={c1} c2={c2} />;
    default:             return <DefaultScene c1={c1} c2={c2} />;
  }
}

type SceneProps = { c1: string; c2: string };

/* ─── 1. Avatar — Identity Creation ───────────────────────────────── */
function AvatarScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* scan grid */}
      {[140, 170, 200, 230, 260].map(x => (
        <line key={`v${x}`} x1={x} y1={30} x2={x} y2={170} stroke="white" strokeOpacity={0.04} strokeWidth={0.5} />
      ))}
      {[50, 75, 100, 125, 150].map(y => (
        <line key={`h${y}`} x1={130} y1={y} x2={270} y2={y} stroke="white" strokeOpacity={0.04} strokeWidth={0.5} />
      ))}
      {/* portrait silhouette */}
      <ellipse cx={200} cy={70} rx={24} ry={28} stroke={c1} strokeOpacity={0.35} strokeWidth={1.2} />
      <path d="M160 140 Q160 110 175 100 Q190 90 200 90 Q210 90 225 100 Q240 110 240 140" stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
      {/* face-mapping dots */}
      <circle cx={190} cy={64} r={2} fill={c1} fillOpacity={0.4} />
      <circle cx={210} cy={64} r={2} fill={c1} fillOpacity={0.4} />
      <circle cx={200} cy={74} r={1.5} fill="white" fillOpacity={0.2} />
      <circle cx={200} cy={82} r={3} fill="none" stroke={c1} strokeOpacity={0.25} strokeWidth={0.8} />
      {/* scanning ring */}
      <circle cx={200} cy={78} r={50} fill="none" stroke={c2} strokeOpacity={0.12} strokeWidth={0.5} strokeDasharray="4 6" />
      <circle cx={200} cy={78} r={65} fill="none" stroke={c1} strokeOpacity={0.06} strokeWidth={0.5} strokeDasharray="2 8" />
      {/* identity badge */}
      <rect x={170} y={155} width={60} height={18} rx={4} fill="white" fillOpacity={0.04} />
      <rect x={178} y={160} width={28} height={3} rx={1} fill={c1} fillOpacity={0.2} />
      <rect x={178} y={165} width={18} height={2} rx={1} fill="white" fillOpacity={0.08} />
    </g>
  );
}

/* ─── 2. Video — Cinematic Frame ──────────────────────────────────── */
function VideoScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* letterbox bars */}
      <rect x={60} y={25} width={280} height={150} rx={4} fill="white" fillOpacity={0.03} />
      <rect x={60} y={25} width={280} height={12} fill="black" fillOpacity={0.4} />
      <rect x={60} y={163} width={280} height={12} fill="black" fillOpacity={0.4} />
      {/* frame border */}
      <rect x={60} y={25} width={280} height={150} rx={4} fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
      {/* play triangle */}
      <polygon points="190,85 190,115 215,100" fill={c1} fillOpacity={0.3} />
      <circle cx={200} cy={100} r={22} fill="none" stroke={c1} strokeOpacity={0.15} strokeWidth={1} />
      {/* film strip bottom */}
      {[72, 88, 104, 120, 136, 152, 168, 184, 200, 216, 232, 248, 264, 280, 296, 312].map(x => (
        <rect key={x} x={x} y={167} width={10} height={6} rx={1} fill="white" fillOpacity={0.06} />
      ))}
      {/* timecode */}
      <rect x={66} y={28} width={40} height={6} rx={2} fill={c2} fillOpacity={0.15} />
      <rect x={296} y={28} width={36} height={6} rx={2} fill="white" fillOpacity={0.1} />
    </g>
  );
}

/* ─── 3. Editing — Post-Production ────────────────────────────────── */
function EditingScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* preview monitor */}
      <rect x={140} y={20} width={120} height={70} rx={3} fill="white" fillOpacity={0.04} />
      <rect x={140} y={20} width={120} height={70} rx={3} fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={0.8} />
      {/* timeline tracks */}
      {[110, 128, 146, 164].map((y, i) => (
        <g key={y}>
          <rect x={50} y={y} width={300} height={12} rx={2} fill="white" fillOpacity={0.03} />
          <rect x={80 + i * 30} y={y + 2} width={60 + i * 15} height={8} rx={2} fill={i === 0 ? c1 : i === 1 ? c2 : 'white'} fillOpacity={i < 2 ? 0.15 : 0.06} />
          <rect x={180 + i * 10} y={y + 2} width={40 - i * 5} height={8} rx={2} fill={c1} fillOpacity={0.1} />
        </g>
      ))}
      {/* playhead */}
      <line x1={200} y1={106} x2={200} y2={180} stroke={c1} strokeOpacity={0.5} strokeWidth={1.5} />
      <polygon points="195,106 205,106 200,112" fill={c1} fillOpacity={0.5} />
      {/* colour wheels (tiny) */}
      <circle cx={80} cy={50} r={18} fill="none" stroke={c2} strokeOpacity={0.12} strokeWidth={0.8} />
      <circle cx={80} cy={50} r={3} fill={c1} fillOpacity={0.25} />
      <circle cx={320} cy={50} r={18} fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={0.8} />
      <circle cx={320} cy={50} r={3} fill={c2} fillOpacity={0.25} />
    </g>
  );
}

/* ─── 4. Music — Sound Production ─────────────────────────────────── */
function MusicScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* waveform */}
      <path
        d="M40,100 Q60,55 80,100 Q100,145 120,100 Q140,60 160,100 Q180,140 200,100 Q220,50 240,100 Q260,150 280,100 Q300,55 320,100 Q340,140 360,100"
        fill="none" stroke={c1} strokeOpacity={0.3} strokeWidth={1.5}
      />
      <path
        d="M40,100 Q60,70 80,100 Q100,130 120,100 Q140,72 160,100 Q180,128 200,100 Q220,65 240,100 Q260,138 280,100 Q300,68 320,100 Q340,130 360,100"
        fill="none" stroke={c2} strokeOpacity={0.15} strokeWidth={1}
      />
      {/* equalizer bars */}
      {[60, 78, 96, 114, 132, 150, 168, 186, 204, 222, 240, 258, 276, 294, 312, 330].map((x, i) => {
        const h = 15 + Math.abs(Math.sin(i * 0.8)) * 40;
        return <rect key={x} x={x} y={160 - h} width={10} height={h} rx={2} fill={c1} fillOpacity={0.08 + (i % 3) * 0.04} />;
      })}
      {/* mixing controls */}
      <circle cx={100} cy={40} r={12} fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={0.8} />
      <line x1={100} y1={40} x2={100} y2={30} stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
      <circle cx={200} cy={40} r={12} fill="none" stroke={c2} strokeOpacity={0.1} strokeWidth={0.8} />
      <line x1={200} y1={40} x2={206} y2={30} stroke={c2} strokeOpacity={0.18} strokeWidth={1} />
      <circle cx={300} cy={40} r={12} fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={0.8} />
      <line x1={300} y1={40} x2={294} y2={30} stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
    </g>
  );
}

/* ─── 5. Photo — Studio Photography ──────────────────────────────── */
function PhotoScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* viewfinder crosshairs */}
      <line x1={200} y1={30} x2={200} y2={170} stroke="white" strokeOpacity={0.06} strokeWidth={0.5} />
      <line x1={80} y1={100} x2={320} y2={100} stroke="white" strokeOpacity={0.06} strokeWidth={0.5} />
      {/* rule-of-thirds grid */}
      <line x1={160} y1={30} x2={160} y2={170} stroke="white" strokeOpacity={0.03} strokeWidth={0.5} />
      <line x1={240} y1={30} x2={240} y2={170} stroke="white" strokeOpacity={0.03} strokeWidth={0.5} />
      <line x1={80} y1={77} x2={320} y2={77} stroke="white" strokeOpacity={0.03} strokeWidth={0.5} />
      <line x1={80} y1={123} x2={320} y2={123} stroke="white" strokeOpacity={0.03} strokeWidth={0.5} />
      {/* focus brackets */}
      <path d="M155,60 L145,60 L145,75" fill="none" stroke={c2} strokeOpacity={0.3} strokeWidth={1.2} />
      <path d="M245,60 L255,60 L255,75" fill="none" stroke={c2} strokeOpacity={0.3} strokeWidth={1.2} />
      <path d="M155,140 L145,140 L145,125" fill="none" stroke={c2} strokeOpacity={0.3} strokeWidth={1.2} />
      <path d="M245,140 L255,140 L255,125" fill="none" stroke={c2} strokeOpacity={0.3} strokeWidth={1.2} />
      {/* aperture ring */}
      <circle cx={200} cy={100} r={35} fill="none" stroke={c1} strokeOpacity={0.15} strokeWidth={1} />
      <circle cx={200} cy={100} r={20} fill="none" stroke={c1} strokeOpacity={0.1} strokeWidth={0.8} strokeDasharray="6 4" />
      {/* softbox lights */}
      <rect x={70} y={35} width={16} height={24} rx={2} fill="white" fillOpacity={0.05} stroke="white" strokeOpacity={0.08} strokeWidth={0.5} />
      <line x1={78} y1={59} x2={78} y2={80} stroke="white" strokeOpacity={0.04} strokeWidth={0.5} />
      <rect x={314} y={35} width={16} height={24} rx={2} fill="white" fillOpacity={0.05} stroke="white" strokeOpacity={0.08} strokeWidth={0.5} />
      <line x1={322} y1={59} x2={322} y2={80} stroke="white" strokeOpacity={0.04} strokeWidth={0.5} />
    </g>
  );
}

/* ─── 6. Image — AI Generation ────────────────────────────────────── */
function ImageScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* stacked canvases */}
      <rect x={120} y={50} width={170} height={110} rx={4} fill="white" fillOpacity={0.03} transform="rotate(-4, 200, 100)" />
      <rect x={115} y={45} width={170} height={110} rx={4} fill="white" fillOpacity={0.04} transform="rotate(2, 200, 100)" />
      <rect x={110} y={40} width={180} height={120} rx={4} fill="white" fillOpacity={0.06} />
      <rect x={110} y={40} width={180} height={120} rx={4} fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={0.8} />
      {/* gradient brush stroke */}
      <path d="M130,90 Q160,60 200,75 Q240,90 270,65" fill="none" stroke={c1} strokeOpacity={0.25} strokeWidth={2} strokeLinecap="round" />
      <path d="M140,120 Q175,100 210,110 Q250,120 280,100" fill="none" stroke={c2} strokeOpacity={0.15} strokeWidth={1.5} strokeLinecap="round" />
      {/* AI sparkle elements */}
      {([[290, 50], [305, 75], [100, 60], [310, 120], [95, 130]] as [number, number][]).map(([x, y], i) => (
        <g key={i}>
          <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={c1} strokeOpacity={0.3} strokeWidth={0.8} />
          <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={c1} strokeOpacity={0.3} strokeWidth={0.8} />
        </g>
      ))}
      {/* creation indicator */}
      <circle cx={200} cy={95} r={12} fill="none" stroke={c1} strokeOpacity={0.15} strokeWidth={0.8} strokeDasharray="3 3" />
      <circle cx={200} cy={95} r={3} fill={c1} fillOpacity={0.25} />
    </g>
  );
}

/* ─── 7. Media — Multi-Format Hub ─────────────────────────────────── */
function MediaScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* multiple screen panels */}
      <rect x={50} y={30} width={130} height={80} rx={3} fill="white" fillOpacity={0.04} stroke={c1} strokeOpacity={0.15} strokeWidth={0.8} />
      <rect x={220} y={30} width={130} height={55} rx={3} fill="white" fillOpacity={0.04} stroke={c2} strokeOpacity={0.12} strokeWidth={0.8} />
      <rect x={220} y={95} width={130} height={55} rx={3} fill="white" fillOpacity={0.03} stroke={c1} strokeOpacity={0.1} strokeWidth={0.8} />
      <rect x={50} y={120} width={130} height={40} rx={3} fill="white" fillOpacity={0.03} stroke={c2} strokeOpacity={0.1} strokeWidth={0.8} />
      {/* video preview in panel 1 */}
      <polygon points="105,62 105,78 118,70" fill={c1} fillOpacity={0.2} />
      {/* image icon in panel 2 */}
      <circle cx={270} cy={52} r={6} fill="none" stroke={c1} strokeOpacity={0.15} strokeWidth={0.8} />
      <path d="M255,72 L265,62 L275,68 L285,58 L295,68" fill="none" stroke={c2} strokeOpacity={0.15} strokeWidth={0.8} />
      {/* audio waveform in panel 3 */}
      {[230, 242, 254, 266, 278, 290, 302, 314, 326, 338].map((x, i) => (
        <rect key={x} x={x} y={115 - Math.abs(Math.sin(i * 1.2)) * 10} width={6} height={4 + Math.abs(Math.sin(i * 1.2)) * 20} rx={1} fill={c1} fillOpacity={0.1} />
      ))}
      {/* text lines in panel 4 */}
      <rect x={62} y={130} width={50} height={3} rx={1} fill="white" fillOpacity={0.1} />
      <rect x={62} y={137} width={80} height={3} rx={1} fill="white" fillOpacity={0.07} />
      <rect x={62} y={144} width={60} height={3} rx={1} fill="white" fillOpacity={0.05} />
      {/* connection lines */}
      <line x1={185} y1={70} x2={218} y2={55} stroke={c1} strokeOpacity={0.1} strokeWidth={0.8} strokeDasharray="3 3" />
      <line x1={185} y1={70} x2={218} y2={120} stroke={c2} strokeOpacity={0.08} strokeWidth={0.8} strokeDasharray="3 3" />
    </g>
  );
}

/* ─── 8. Text — Writing Intelligence ─────────────────────────────── */
function TextScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* document background */}
      <rect x={100} y={25} width={200} height={150} rx={4} fill="white" fillOpacity={0.04} />
      <rect x={100} y={25} width={200} height={150} rx={4} fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={0.8} />
      {/* heading line */}
      <rect x={120} y={42} width={100} height={5} rx={2} fill={c1} fillOpacity={0.2} />
      {/* paragraph lines */}
      {[58, 66, 74, 82].map(y => (
        <rect key={y} x={120} y={y} width={160} height={3} rx={1} fill="white" fillOpacity={0.08} />
      ))}
      {/* AI suggestion highlight */}
      <rect x={118} y={95} width={164} height={22} rx={3} fill={c1} fillOpacity={0.06} />
      <rect x={120} y={100} width={140} height={3} rx={1} fill={c1} fillOpacity={0.2} />
      <rect x={120} y={108} width={100} height={3} rx={1} fill={c1} fillOpacity={0.15} />
      {/* more paragraph lines */}
      {[126, 134, 142, 150].map(y => (
        <rect key={y} x={120} y={y} width={y < 145 ? 160 : 90} height={3} rx={1} fill="white" fillOpacity={0.06} />
      ))}
      {/* cursor */}
      <rect x={210} y={148} width={2} height={8} rx={1} fill={c1} fillOpacity={0.5} />
      {/* sparkle near suggestion */}
      <line x1={292} y1={100} x2={298} y2={100} stroke={c2} strokeOpacity={0.25} strokeWidth={0.8} />
      <line x1={295} y1={97} x2={295} y2={103} stroke={c2} strokeOpacity={0.25} strokeWidth={0.8} />
    </g>
  );
}

/* ─── 9. Prompt — Prompt Engineering ──────────────────────────────── */
function PromptScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* modular prompt blocks */}
      <rect x={80} y={30} width={100} height={36} rx={4} fill="white" fillOpacity={0.05} stroke={c1} strokeOpacity={0.2} strokeWidth={0.8} />
      <rect x={90} y={40} width={50} height={4} rx={1} fill={c1} fillOpacity={0.25} />
      <rect x={90} y={48} width={70} height={3} rx={1} fill="white" fillOpacity={0.1} />
      {/* arrow down */}
      <line x1={130} y1={68} x2={130} y2={82} stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
      <polygon points="126,80 134,80 130,87" fill={c1} fillOpacity={0.2} />
      {/* processing block */}
      <rect x={80} y={90} width={100} height={36} rx={4} fill={c2} fillOpacity={0.06} stroke={c2} strokeOpacity={0.15} strokeWidth={0.8} />
      <rect x={90} y={100} width={40} height={4} rx={1} fill={c2} fillOpacity={0.2} />
      <rect x={90} y={108} width={60} height={3} rx={1} fill="white" fillOpacity={0.08} />
      {/* arrow down to output */}
      <line x1={130} y1={128} x2={130} y2={142} stroke={c1} strokeOpacity={0.2} strokeWidth={1} />
      <polygon points="126,140 134,140 130,147" fill={c1} fillOpacity={0.2} />
      {/* output block with sparkle */}
      <rect x={80} y={150} width={100} height={30} rx={4} fill={c1} fillOpacity={0.06} stroke={c1} strokeOpacity={0.2} strokeWidth={0.8} />
      <rect x={90} y={158} width={50} height={4} rx={1} fill={c1} fillOpacity={0.3} />
      <rect x={90} y={166} width={70} height={3} rx={1} fill="white" fillOpacity={0.12} />
      {/* parameter panel (right) */}
      <rect x={220} y={40} width={120} height={100} rx={4} fill="white" fillOpacity={0.03} stroke="white" strokeOpacity={0.06} strokeWidth={0.8} />
      <rect x={232} y={52} width={40} height={3} rx={1} fill={c1} fillOpacity={0.15} />
      {[65, 78, 91, 104, 117].map(y => (
        <g key={y}>
          <rect x={232} y={y} width={60} height={3} rx={1} fill="white" fillOpacity={0.06} />
          <rect x={310} y={y} width={18} height={3} rx={1} fill={c1} fillOpacity={0.1} />
        </g>
      ))}
      {/* sparkle on output */}
      <circle cx={172} cy={150} r={4} fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={0.8} />
      <line x1={172} y1={144} x2={172} y2={156} stroke={c1} strokeOpacity={0.2} strokeWidth={0.6} />
      <line x1={166} y1={150} x2={178} y2={150} stroke={c1} strokeOpacity={0.2} strokeWidth={0.6} />
    </g>
  );
}

/* ─── 10. Visual AI — Image Analysis ─────────────────────────────── */
function VisualIntelScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* image canvas */}
      <rect x={80} y={25} width={180} height={130} rx={4} fill="white" fillOpacity={0.04} stroke={c1} strokeOpacity={0.15} strokeWidth={0.8} />
      {/* landscape suggestion inside */}
      <path d="M95,120 L130,80 L155,100 L180,65 L220,110 L245,120" fill={c2} fillOpacity={0.05} stroke={c2} strokeOpacity={0.1} strokeWidth={0.8} />
      <circle cx={130} cy={55} r={10} fill={c1} fillOpacity={0.08} />
      {/* detection bounding boxes */}
      <rect x={110} y={55} width={55} height={60} rx={2} fill="none" stroke={c1} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 2" />
      <rect x={180} y={50} width={65} height={75} rx={2} fill="none" stroke={c2} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="4 2" />
      {/* confidence labels */}
      <rect x={110} y={50} width={28} height={8} rx={2} fill={c1} fillOpacity={0.2} />
      <rect x={180} y={45} width={22} height={8} rx={2} fill={c2} fillOpacity={0.15} />
      {/* analysis panel (right) */}
      <rect x={280} y={30} width={90} height={120} rx={4} fill="white" fillOpacity={0.03} />
      <rect x={290} y={42} width={40} height={4} rx={1} fill={c1} fillOpacity={0.15} />
      {[56, 68, 80, 92, 104, 116, 128].map(y => (
        <rect key={y} x={290} y={y} width={60} height={3} rx={1} fill="white" fillOpacity={0.05} />
      ))}
      {/* quality score */}
      <circle cx={315} cy={142} r={3} fill={c1} fillOpacity={0.25} />
      <rect x={322} y={140} width={30} height={4} rx={1} fill={c1} fillOpacity={0.12} />
    </g>
  );
}

/* ─── 11. Workflow — Automation Pipeline ──────────────────────────── */
function WorkflowScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* pipeline path */}
      <path d="M60,100 L120,100 L155,60 L245,60 L280,100 L340,100" fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={1.5} />
      <path d="M155,60 L155,140 L245,140 L245,60" fill="none" stroke={c2} strokeOpacity={0.06} strokeWidth={1} strokeDasharray="4 4" />
      {/* nodes */}
      {([[60, 100], [155, 60], [245, 60], [155, 140], [245, 140], [340, 100]] as const).map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={14} fill={i === 0 || i === 5 ? c1 : c2} fillOpacity={i === 0 || i === 5 ? 0.12 : 0.06} />
          <circle cx={cx} cy={cy} r={14} fill="none" stroke={i === 0 || i === 5 ? c1 : c2} strokeOpacity={0.25} strokeWidth={0.8} />
          <circle cx={cx} cy={cy} r={4} fill={c1} fillOpacity={0.3} />
        </g>
      ))}
      {/* direction arrows */}
      <polygon points="117,96 117,104 124,100" fill={c1} fillOpacity={0.25} />
      <polygon points="277,96 277,104 284,100" fill={c1} fillOpacity={0.25} />
      <polygon points="242,56 242,64 249,60" fill={c2} fillOpacity={0.2} />
      {/* node labels */}
      <rect x={42} y={118} width={36} height={6} rx={2} fill={c1} fillOpacity={0.1} />
      <rect x={322} y={118} width={36} height={6} rx={2} fill={c1} fillOpacity={0.1} />
    </g>
  );
}

/* ─── 12. Shop — Digital Commerce ─────────────────────────────────── */
function ShopScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* product grid — 2×2 */}
      {([[70, 30, 130, 80], [210, 30, 130, 80], [70, 120, 130, 55], [210, 120, 130, 55]] as const).map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} rx={4} fill="white" fillOpacity={0.04} />
          <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={c1} strokeOpacity={0.1} strokeWidth={0.6} />
          {/* product thumbnail area */}
          <rect x={x + 8} y={y + 8} width={w - 16} height={h * 0.5} rx={3} fill={i % 2 === 0 ? c1 : c2} fillOpacity={0.06} />
          {/* price tag */}
          <rect x={x + 8} y={y + h - 18} width={36} height={10} rx={2} fill={c1} fillOpacity={0.15} />
          {/* title placeholder */}
          <rect x={x + 8} y={y + h - 30} width={w * 0.6} height={4} rx={1} fill="white" fillOpacity={0.08} />
        </g>
      ))}
      {/* cart icon suggestion (top right) */}
      <rect x={355} y={15} width={20} height={16} rx={3} fill="none" stroke={c1} strokeOpacity={0.15} strokeWidth={0.8} />
      <circle cx={360} cy={35} r={2} fill={c1} fillOpacity={0.2} />
      <circle cx={370} cy={35} r={2} fill={c1} fillOpacity={0.2} />
    </g>
  );
}

/* ─── 13. Software — Developer Studio ─────────────────────────────── */
function SoftwareScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* editor frame */}
      <rect x={60} y={25} width={200} height={150} rx={4} fill="white" fillOpacity={0.03} />
      <rect x={60} y={25} width={200} height={150} rx={4} fill="none" stroke={c1} strokeOpacity={0.12} strokeWidth={0.8} />
      {/* tab bar */}
      <rect x={60} y={25} width={200} height={14} rx={0} fill="white" fillOpacity={0.02} />
      <rect x={62} y={27} width={40} height={10} rx={2} fill={c1} fillOpacity={0.1} />
      <rect x={106} y={27} width={35} height={10} rx={2} fill="white" fillOpacity={0.03} />
      {/* line numbers */}
      {[48, 58, 68, 78, 88, 98, 108, 118, 128, 138, 148, 158].map((y, i) => (
        <text key={y} x={68} y={y} fill="white" fillOpacity={0.08} fontSize={6} fontFamily="monospace">{i + 1}</text>
      ))}
      {/* code lines */}
      <rect x={82} y={44} width={60} height={4} rx={1} fill={c2} fillOpacity={0.15} />
      <rect x={90} y={54} width={80} height={4} rx={1} fill="white" fillOpacity={0.06} />
      <rect x={90} y={64} width={100} height={4} rx={1} fill="white" fillOpacity={0.05} />
      <rect x={98} y={74} width={70} height={4} rx={1} fill={c1} fillOpacity={0.12} />
      <rect x={98} y={84} width={90} height={4} rx={1} fill="white" fillOpacity={0.05} />
      <rect x={90} y={94} width={40} height={4} rx={1} fill={c2} fillOpacity={0.1} />
      <rect x={82} y={104} width={50} height={4} rx={1} fill="white" fillOpacity={0.06} />
      <rect x={90} y={114} width={110} height={4} rx={1} fill="white" fillOpacity={0.04} />
      <rect x={82} y={124} width={30} height={4} rx={1} fill={c1} fillOpacity={0.1} />
      {/* architecture panel (right) */}
      <rect x={280} y={30} width={90} height={80} rx={4} fill="white" fillOpacity={0.02} />
      {/* architecture nodes */}
      {([[305, 50], [345, 50], [305, 85], [345, 85]] as const).map(([cx, cy], i) => (
        <g key={i}>
          <rect x={cx - 12} y={cy - 8} width={24} height={16} rx={3} fill={c1} fillOpacity={0.08} stroke={c1} strokeOpacity={0.15} strokeWidth={0.5} />
        </g>
      ))}
      <line x1={317} y1={50} x2={333} y2={50} stroke={c1} strokeOpacity={0.12} strokeWidth={0.5} />
      <line x1={305} y1={58} x2={305} y2={77} stroke={c1} strokeOpacity={0.12} strokeWidth={0.5} />
      <line x1={345} y1={58} x2={345} y2={77} stroke={c1} strokeOpacity={0.12} strokeWidth={0.5} />
      {/* terminal bar (right bottom) */}
      <rect x={280} y={120} width={90} height={40} rx={4} fill="black" fillOpacity={0.2} />
      <rect x={288} y={128} width={30} height={3} rx={1} fill={c1} fillOpacity={0.18} />
      <rect x={288} y={136} width={55} height={3} rx={1} fill="white" fillOpacity={0.06} />
      <rect x={288} y={144} width={40} height={3} rx={1} fill="white" fillOpacity={0.05} />
    </g>
  );
}

/* ─── 14. Business — Intelligence Dashboard ───────────────────────── */
function BusinessScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* main chart area */}
      <rect x={60} y={25} width={200} height={130} rx={4} fill="white" fillOpacity={0.03} />
      {/* bar chart */}
      {([
        [85, 45], [110, 65], [135, 55], [160, 80], [185, 70], [210, 90], [235, 75],
      ] as [number, number][]).map(([x, barH], i) => {
        const h = 20 + barH;
        return <rect key={x} x={x} y={145 - h} width={16} height={h} rx={2} fill={c1} fillOpacity={0.08 + i * 0.02} />;
      })}
      {/* trend line */}
      <path d="M85,110 L110,90 L135,95 L160,70 L185,78 L210,55 L235,60" fill="none" stroke={c1} strokeOpacity={0.35} strokeWidth={1.5} />
      {/* trend dots */}
      {([[85, 110], [110, 90], [135, 95], [160, 70], [185, 78], [210, 55], [235, 60]] as [number, number][]).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.5} fill={c1} fillOpacity={0.4} />
      ))}
      {/* chart axis */}
      <line x1={72} y1={30} x2={72} y2={148} stroke="white" strokeOpacity={0.06} strokeWidth={0.5} />
      <line x1={72} y1={148} x2={256} y2={148} stroke="white" strokeOpacity={0.06} strokeWidth={0.5} />
      {/* KPI panels (right) */}
      {[30, 70, 110].map(y => (
        <g key={y}>
          <rect x={280} y={y} width={95} height={35} rx={4} fill="white" fillOpacity={0.03} stroke={c1} strokeOpacity={0.08} strokeWidth={0.5} />
          <rect x={290} y={y + 8} width={30} height={4} rx={1} fill={c1} fillOpacity={0.15} />
          <rect x={290} y={y + 18} width={50} height={5} rx={1} fill="white" fillOpacity={0.06} />
        </g>
      ))}
      {/* growth arrow */}
      <line x1={345} y1={54} x2={360} y2={42} stroke={c1} strokeOpacity={0.3} strokeWidth={1.2} />
      <polygon points="357,40 363,40 360,35" fill={c1} fillOpacity={0.3} />
    </g>
  );
}

/* ─── 15. Agent G — AI Command Center ─────────────────────────────── */
function AgentGScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* orbital rings */}
      <ellipse cx={200} cy={100} rx={100} ry={50} fill="none" stroke={c1} strokeOpacity={0.06} strokeWidth={0.8} />
      <ellipse cx={200} cy={100} rx={70} ry={35} fill="none" stroke={c2} strokeOpacity={0.08} strokeWidth={0.8} strokeDasharray="4 4" />
      <ellipse cx={200} cy={100} rx={140} ry={70} fill="none" stroke={c1} strokeOpacity={0.04} strokeWidth={0.5} />
      {/* central G node */}
      <circle cx={200} cy={100} r={28} fill={c2} fillOpacity={0.08} />
      <circle cx={200} cy={100} r={28} fill="none" stroke={c1} strokeOpacity={0.3} strokeWidth={1.2} />
      <text x={200} y={108} textAnchor="middle" fill={c1} fillOpacity={0.5} fontSize={24} fontWeight="bold" fontFamily="system-ui">G</text>
      {/* satellite nodes */}
      {([
        [110, 60], [290, 60], [320, 100], [290, 140], [110, 140], [80, 100],
      ] as const).map(([cx, cy], i) => (
        <g key={i}>
          <line x1={200} y1={100} x2={cx} y2={cy} stroke={c1} strokeOpacity={0.08} strokeWidth={0.5} />
          <circle cx={cx} cy={cy} r={8} fill={c1} fillOpacity={0.06} stroke={c1} strokeOpacity={0.2} strokeWidth={0.6} />
          <circle cx={cx} cy={cy} r={2.5} fill={c1} fillOpacity={0.3} />
        </g>
      ))}
      {/* pulse ring */}
      <circle cx={200} cy={100} r={45} fill="none" stroke={c1} strokeOpacity={0.1} strokeWidth={0.5} strokeDasharray="2 6" />
    </g>
  );
}

/* ─── 16. Tourism — Travel Intelligence ───────────────────────────── */
function TourismScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* map area */}
      <rect x={60} y={25} width={280} height={150} rx={4} fill="white" fillOpacity={0.02} />
      {/* terrain suggestion (abstract land masses) */}
      <path d="M60,130 Q100,100 140,115 Q180,130 200,105 Q220,80 260,95 Q300,110 340,90" fill={c1} fillOpacity={0.04} />
      <path d="M60,150 Q120,130 180,140 Q220,150 260,138 Q300,126 340,135" fill={c2} fillOpacity={0.03} />
      {/* route dotted line */}
      <path d="M110,80 Q150,55 200,70 Q250,85 310,60" fill="none" stroke={c1} strokeOpacity={0.2} strokeWidth={1} strokeDasharray="5 3" />
      {/* map pins */}
      {([[110, 80], [200, 70], [310, 60]] as const).map(([cx, cy], i) => (
        <g key={i}>
          <path d={`M${cx},${cy} C${cx - 6},${cy - 12} ${cx - 6},${cy - 20} ${cx},${cy - 22} C${cx + 6},${cy - 20} ${cx + 6},${cy - 12} ${cx},${cy}`} fill={i === 1 ? c1 : c2} fillOpacity={0.25} />
          <circle cx={cx} cy={cy - 16} r={3} fill="white" fillOpacity={0.15} />
        </g>
      ))}
      {/* compass rose (top right) */}
      <circle cx={320} cy={45} r={14} fill="none" stroke={c1} strokeOpacity={0.1} strokeWidth={0.5} />
      <line x1={320} y1={33} x2={320} y2={57} stroke={c1} strokeOpacity={0.15} strokeWidth={0.5} />
      <line x1={308} y1={45} x2={332} y2={45} stroke={c1} strokeOpacity={0.15} strokeWidth={0.5} />
      <polygon points="320,33 317,39 323,39" fill={c1} fillOpacity={0.25} />
      {/* info card bottom-left */}
      <rect x={75} y={140} width={80} height={28} rx={4} fill="white" fillOpacity={0.04} stroke={c1} strokeOpacity={0.1} strokeWidth={0.5} />
      <rect x={82} y={147} width={40} height={3} rx={1} fill={c1} fillOpacity={0.15} />
      <rect x={82} y={154} width={60} height={3} rx={1} fill="white" fillOpacity={0.06} />
    </g>
  );
}

/* ─── 17. Next/Expansion — Future Modules ─────────────────────────── */
function NextScene({ c1, c2 }: SceneProps) {
  return (
    <g>
      {/* puzzle piece (center) */}
      <path
        d="M170,65 L170,55 Q180,45 190,55 L190,65 L210,65 L210,55 Q220,45 230,55 L230,65 L230,85 L240,85 Q250,95 240,105 L230,105 L230,135 L210,135 L210,145 Q200,155 190,145 L190,135 L170,135 L170,105 L160,105 Q150,95 160,85 L170,85 Z"
        fill={c1} fillOpacity={0.06} stroke={c1} strokeOpacity={0.15} strokeWidth={0.8}
      />
      {/* expansion arrows */}
      <line x1={130} y1={100} x2={100} y2={100} stroke={c1} strokeOpacity={0.15} strokeWidth={1} />
      <polygon points="100,96 100,104 93,100" fill={c1} fillOpacity={0.15} />
      <line x1={270} y1={100} x2={300} y2={100} stroke={c1} strokeOpacity={0.15} strokeWidth={1} />
      <polygon points="300,96 300,104 307,100" fill={c1} fillOpacity={0.15} />
      <line x1={200} y1={40} x2={200} y2={20} stroke={c1} strokeOpacity={0.12} strokeWidth={1} />
      <polygon points="196,20 204,20 200,13" fill={c1} fillOpacity={0.12} />
      <line x1={200} y1={160} x2={200} y2={180} stroke={c1} strokeOpacity={0.12} strokeWidth={1} />
      <polygon points="196,180 204,180 200,187" fill={c1} fillOpacity={0.12} />
      {/* dashed ghost pieces */}
      <rect x={60} y={70} width={40} height={40} rx={4} fill="none" stroke={c2} strokeOpacity={0.06} strokeWidth={0.8} strokeDasharray="3 3" />
      <rect x={300} y={70} width={40} height={40} rx={4} fill="none" stroke={c2} strokeOpacity={0.06} strokeWidth={0.8} strokeDasharray="3 3" />
      <rect x={180} y={0} width={40} height={25} rx={4} fill="none" stroke={c2} strokeOpacity={0.04} strokeWidth={0.8} strokeDasharray="3 3" />
      {/* "more" dots */}
      <circle cx={60} cy={170} r={2} fill="white" fillOpacity={0.06} />
      <circle cx={72} cy={170} r={2} fill="white" fillOpacity={0.06} />
      <circle cx={84} cy={170} r={2} fill="white" fillOpacity={0.06} />
    </g>
  );
}

/* ─── Fallback ────────────────────────────────────────────────────── */
function DefaultScene({ c1 }: SceneProps) {
  return (
    <g>
      <circle cx={200} cy={100} r={40} fill="none" stroke={c1} strokeOpacity={0.1} strokeWidth={1} />
      <circle cx={200} cy={100} r={60} fill="none" stroke={c1} strokeOpacity={0.06} strokeWidth={0.5} strokeDasharray="4 4" />
      <circle cx={200} cy={100} r={6} fill={c1} fillOpacity={0.2} />
    </g>
  );
}
