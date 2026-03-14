/**
 * Visual asset configuration for every MyAvatar.ge service.
 *
 * Each service gets:
 * - A cinematic gradient background (dark-mode primary)
 * - A unique accent colour used for SVG highlights
 * - Light-mode gradient variant
 * - A detailed AI-image prompt so real photorealistic assets can be generated later
 */

export type ServiceVisualConfig = {
  /** CSS gradient for the card visual header (dark mode default) */
  gradient: string;
  /** CSS gradient for light mode */
  gradientLight: string;
  /** Primary accent colour (hex) for SVG highlight elements */
  accent: string;
  /** Secondary accent colour (hex) for depth */
  accentSecondary: string;
  /** Short description of what the visual should communicate */
  visualIntent: string;
  /** Detailed prompt for generating a photorealistic asset */
  imagePrompt: string;
};

export const SERVICE_VISUALS: Record<string, ServiceVisualConfig> = {
  avatar: {
    gradient: 'linear-gradient(135deg, #0f0b24 0%, #1e1450 50%, #150d38 100%)',
    gradientLight: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 50%, #e0e7ff 100%)',
    accent: '#a78bfa',
    accentSecondary: '#7c3aed',
    visualIntent: 'Premium digital human portrait with facial mapping and identity scan',
    imagePrompt: 'Photorealistic premium digital human avatar, studio portrait lighting, clean dark background, subtle blue-violet edge light, facial recognition scan points visible, identity-grade quality, modern AI technology feel, 8K detail, cinematic composition',
  },
  video: {
    gradient: 'linear-gradient(135deg, #0a1628 0%, #12264a 50%, #0d1a30 100%)',
    gradientLight: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #e0e7ff 100%)',
    accent: '#60a5fa',
    accentSecondary: '#3b82f6',
    visualIntent: 'Cinematic video frame with film-quality composition and motion feel',
    imagePrompt: 'Premium cinematic frame from AI-generated video, letterbox aspect ratio, dramatic lighting, city skyline at golden hour, film-like colour grading, motion blur suggestion, professional video production quality, 4K cinema frame',
  },
  editing: {
    gradient: 'linear-gradient(135deg, #0b1a1a 0%, #143030 50%, #0f1f20 100%)',
    gradientLight: 'linear-gradient(135deg, #ccfbf1 0%, #cffafe 50%, #e0f2fe 100%)',
    accent: '#2dd4bf',
    accentSecondary: '#14b8a6',
    visualIntent: 'Professional post-production editing timeline and colour grading',
    imagePrompt: 'Premium video editing workspace, clean dark UI with timeline tracks, colour grading wheels, preview monitor showing cinematic frame, professional post-production environment, Resolve/Premiere feel, studio-quality monitor display, modern editing desk',
  },
  music: {
    gradient: 'linear-gradient(135deg, #150a28 0%, #261445 50%, #1a0d30 100%)',
    gradientLight: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 50%, #ede9fe 100%)',
    accent: '#c084fc',
    accentSecondary: '#a78bfa',
    visualIntent: 'Modern music production studio with mixing console and waveforms',
    imagePrompt: 'Premium music production studio, DAW interface on ultrawide monitor, audio waveforms visible, mixing console with faders, studio monitors, headphones on desk, warm ambient lighting, professional sound engineering environment, Ableton/Logic aesthetic',
  },
  photo: {
    gradient: 'linear-gradient(135deg, #151518 0%, #22222a 50%, #1a1a20 100%)',
    gradientLight: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%)',
    accent: '#e2e8f0',
    accentSecondary: '#94a3b8',
    visualIntent: 'Professional photography studio with softbox lighting and viewfinder',
    imagePrompt: 'Premium photography studio setup, softbox lights on stands, DSLR camera on tripod, fashion model silhouette, clean white/gray backdrop, professional studio lighting visible, high-end photography environment, editorial photo shoot atmosphere',
  },
  image: {
    gradient: 'linear-gradient(135deg, #1a0a18 0%, #2e1428 50%, #1f0d1a 100%)',
    gradientLight: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 50%, #f5d0fe 100%)',
    accent: '#f472b6',
    accentSecondary: '#ec4899',
    visualIntent: 'Polished AI-generated commercial visual with poster-grade quality',
    imagePrompt: 'Premium AI-generated commercial poster, photorealistic product visual, clean sophisticated composition, campaign-quality artwork, dramatic lighting on central subject, print-ready quality, modern graphic design feel, 4K resolution',
  },
  media: {
    gradient: 'linear-gradient(135deg, #0e1420 0%, #182030 50%, #121a25 100%)',
    gradientLight: 'linear-gradient(135deg, #e0e7ff 0%, #dbeafe 50%, #e0f2fe 100%)',
    accent: '#818cf8',
    accentSecondary: '#06b6d4',
    visualIntent: 'Multi-format content production hub with multiple screen outputs',
    imagePrompt: 'Premium media production workspace, multiple screens showing different content formats (video preview, image grid, audio waveform, social media), clean modern desk setup, content producer environment, command center for media assets',
  },
  text: {
    gradient: 'linear-gradient(135deg, #0d1812 0%, #182a1e 50%, #111f16 100%)',
    gradientLight: 'linear-gradient(135deg, #dcfce7 0%, #d1fae5 50%, #ecfdf5 100%)',
    accent: '#4ade80',
    accentSecondary: '#22c55e',
    visualIntent: 'Premium writing workspace with AI text assistance and structured content',
    imagePrompt: 'Elegant AI writing workspace, clean modern text editor showing structured content, suggestion highlights, premium dark editor UI, intelligent document with AI-assisted copy, professional copywriting environment, script workspace',
  },
  prompt: {
    gradient: 'linear-gradient(135deg, #1a1408 0%, #2a2010 50%, #1f1a0d 100%)',
    gradientLight: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef9c3 100%)',
    accent: '#fbbf24',
    accentSecondary: '#f59e0b',
    visualIntent: 'Structured prompt engineering interface with modular instruction blocks',
    imagePrompt: 'Premium prompt engineering dashboard, modular prompt blocks arranged in structured layout, clean UI showing prompt architecture, AI instruction system, optimisation metrics, modern prompt builder workspace, command composition interface',
  },
  'visual-intel': {
    gradient: 'linear-gradient(135deg, #0a181f 0%, #142830 50%, #0f1f28 100%)',
    gradientLight: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 50%, #ccfbf1 100%)',
    accent: '#22d3ee',
    accentSecondary: '#06b6d4',
    visualIntent: 'AI image analysis with detection overlays and quality markers',
    imagePrompt: 'Premium visual AI analysis interface, photorealistic image with AI detection boxes overlaid, quality assessment markers, recognition data points, image intelligence dashboard, visual QA system, modern analysis workspace',
  },
  workflow: {
    gradient: 'linear-gradient(135deg, #0c1230 0%, #162048 50%, #101838 100%)',
    gradientLight: 'linear-gradient(135deg, #dbeafe 0%, #c7d2fe 50%, #e0e7ff 100%)',
    accent: '#22d3ee',
    accentSecondary: '#06b6d4',
    visualIntent: 'Clean automation pipeline with connected process nodes',
    imagePrompt: 'Premium workflow automation dashboard, clean connected nodes forming a pipeline, input-process-output flow, modern workflow builder, structured automation map, professional DAG editor, orchestration system view',
  },
  shop: {
    gradient: 'linear-gradient(135deg, #1a0d15 0%, #2e1824 50%, #1f1018 100%)',
    gradientLight: 'linear-gradient(135deg, #fce7f3 0%, #fecdd3 50%, #ffe4e6 100%)',
    accent: '#fb7185',
    accentSecondary: '#f43f5e',
    visualIntent: 'Premium digital storefront with curated product listings',
    imagePrompt: 'Premium AI-powered digital storefront, modern product grid showing curated items, luxury e-commerce interface, clean product cards with prices, modern marketplace UI, sleek shopping experience, product catalog view',
  },
  software: {
    gradient: 'linear-gradient(135deg, #0d1810 0%, #1a2a1d 50%, #121f15 100%)',
    gradientLight: 'linear-gradient(135deg, #d1fae5 0%, #dcfce7 50%, #ecfdf5 100%)',
    accent: '#34d399',
    accentSecondary: '#10b981',
    visualIntent: 'Premium developer workspace with code editor and architecture view',
    imagePrompt: 'Premium software development environment, elegant code editor with syntax highlighting, architecture diagram preview, modern IDE workspace, integration system view, clean engineering desk, professional development setup',
  },
  business: {
    gradient: 'linear-gradient(135deg, #101525 0%, #1a2540 50%, #131a30 100%)',
    gradientLight: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #dbeafe 100%)',
    accent: '#818cf8',
    accentSecondary: '#06b6d4',
    visualIntent: 'Business intelligence dashboard with analytics and strategic planning',
    imagePrompt: 'Premium business analytics dashboard, executive KPI panels, clean chart visualizations, strategic planning interface, operational metrics, modern BI environment, professional data-driven workspace',
  },
  'agent-g': {
    gradient: 'linear-gradient(135deg, #12084a 0%, #1e10a0 30%, #1a0d70 70%, #0f0840 100%)',
    gradientLight: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 50%, #ddd6fe 100%)',
    accent: '#a78bfa',
    accentSecondary: '#22d3ee',
    visualIntent: 'Central AI command center with orchestration intelligence hub',
    imagePrompt: 'Premium AI command center, central holographic intelligence node, radial connections to surrounding systems, orchestration dashboard, brain-of-the-platform feel, modern sci-fi control room, premium technology environment',
  },
  tourism: {
    gradient: 'linear-gradient(135deg, #0a1820 0%, #143035 50%, #0f2028 100%)',
    gradientLight: 'linear-gradient(135deg, #ccfbf1 0%, #cffafe 50%, #d1fae5 100%)',
    accent: '#2dd4bf',
    accentSecondary: '#14b8a6',
    visualIntent: 'Smart travel planning with destination previews and intelligent guides',
    imagePrompt: 'Premium travel planning dashboard, interactive destination map, luxury hotel previews, itinerary planner, local experience cards, modern tourism intelligence interface, upscale travel tech platform',
  },
  next: {
    gradient: 'linear-gradient(135deg, #131316 0%, #1e1e24 50%, #18181c 100%)',
    gradientLight: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 50%, #f8fafc 100%)',
    accent: '#6b7280',
    accentSecondary: '#4b5563',
    visualIntent: 'Expansion module placeholder with growth potential feel',
    imagePrompt: 'Premium modular expansion concept, abstract premium blocks showing extensibility, puzzle-piece architecture, future technology potential, sleek minimal design, modern SaaS expansion visual',
  },
};
