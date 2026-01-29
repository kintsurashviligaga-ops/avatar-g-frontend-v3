'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Paperclip, Image as ImageIcon, Mic, X } from 'lucide-react';

// Service Configuration - EXACTLY 12 services
interface Service {
  id: string;
  slug: string;
  geName: string;
  description: string;
  route: string;
  prompts: string[];
  color: string;
}

const services: Service[] = [
  {
    id: 'avatar-builder',
    slug: 'avatar-builder',
    geName: 'ავატარის შექმნა',
    description: 'პერსონალური AI ავატარი',
    route: '/avatar-builder',
    prompts: ['შემიქმენი ავატარი', 'გამიუმჯობესე ფოტო'],
    color: '#8B5CF6',
  },
  {
    id: 'voice-lab',
    slug: 'voice-lab',
    geName: 'ხმის ლაბი',
    description: 'ხმის კლონირება',
    route: '/voice-lab',
    prompts: ['კლონირე ხმა', 'შეცვალე ტონი'],
    color: '#EC4899',
  },
  {
    id: 'image-architect',
    slug: 'image-architect',
    geName: 'ფოტოს დიზაინი',
    description: 'პროფესიული დიზაინი',
    route: '/image-architect',
    prompts: ['შემიქმენი ლოგო', 'გაფორმე პოსტერი'],
    color: '#3B82F6',
  },
  {
    id: 'music-studio',
    slug: 'music-studio',
    geName: 'მუსიკის სტუდია',
    description: 'AI მუსიკა',
    route: '/music-studio',
    prompts: ['შემიქმენი მელოდია', 'დაამატე ბასი'],
    color: '#10B981',
  },
  {
    id: 'video-cine-lab',
    slug: 'video-cine-lab',
    geName: 'ვიდეო სტუდია',
    description: 'ვიდეო მონტაჟი',
    route: '/video-cine-lab',
    prompts: ['შემიქმენი სცენარი', 'დამიმონტაჟე'],
    color: '#F59E0B',
  },
  {
    id: 'game-forge',
    slug: 'game-forge',
    geName: 'თამაშის შექმნა',
    description: 'თამაშების დეველოპმენტი',
    route: '/game-forge',
    prompts: ['შემიქმენი პერსონაჟი', 'დაწერე კოდი'],
    color: '#EF4444',
  },
  {
    id: 'ai-production',
    slug: 'ai-production',
    geName: 'AI პროდაქშენი',
    description: 'მასობრივი წარმოება',
    route: '/ai-production',
    prompts: ['დამიგეგმე კამპანია', 'შექმენი კონტენტი'],
    color: '#06B6D4',
  },
  {
    id: 'business-agent',
    slug: 'business-agent',
    geName: 'ბიზნეს ასისტენტი',
    description: 'ავტომატიზაცია',
    route: '/business-agent',
    prompts: ['განსაზღვრე KPI-ები', 'შექმენი სტრატეგია'],
    color: '#8B5CF6',
  },
  {
    id: 'prompt-builder',
    slug: 'prompt-builder',
    geName: 'პრომპტების გენერატორი',
    description: 'პროფესიული პრომპტები',
    route: '/prompt-builder',
    prompts: ['გააუმჯობესე პრომპტი', 'შემიქმენი თემპლეიტი'],
    color: '#A855F7',
  },
  {
    id: 'image-generator',
    slug: 'image-generator',
    geName: 'სურათის გენერაცია',
    description: 'AI სურათები',
    route: '/image-generator',
    prompts: ['შემიქმენი ილუსტრაცია', 'გენერირე ფოტო'],
    color: '#3B82F6',
  },
  {
    id: 'video-generator',
    slug: 'video-generator',
    geName: 'ვიდეო გენერაცია',
    description: 'AI ვიდეოები',
    route: '/video-generator',
    prompts: ['შემიქმენი ვიდეო', 'გენერირე ანიმაცია'],
    color: '#F59E0B',
  },
  {
    id: 'text-intelligence',
    slug: 'text-intelligence',
    geName: 'ტექსტის ანალიზი',
    description: 'ანალიზი და ოპტიმიზაცია',
    route: '/text-intelligence',
    prompts: ['გაანალიზე ტექსტი', 'შექმენი რეზიუმე'],
    color: '#10B981',
  },
];

const defaultQuickPrompts = [
  'დამიგეგმე კონტენტი',
  'გამიკეთე ბიზნეს-სტრატეგია',
  'შექმენი ვიდეო იდეა',
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
}

// Custom hook for reduced motion
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
};

const playSlideSound = () => {
  if (typeof window === 'undefined') return;
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 820;
    oscillator.type = 'sine';
    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    gainNode.gain.setValueAtTime(0.06, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.045);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.045);

    if ('vibrate' in navigator) {
      navigator.vibrate(8);
    }
  } catch (e) {
    // Silently fail
  }
};

const WarpSpeedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    const stars: Array<{ x: number; y: number; z: number; ox: number; oy: number }> = [];
    const numStars = 400;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < numStars; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * Math.max(canvas.width, canvas.height);
      stars.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        z: Math.random() * 2000,
        ox: centerX + Math.cos(angle) * radius,
        oy: centerY + Math.sin(angle) * radius,
      });
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(6, 7, 11, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      stars.forEach((star) => {
        star.z -= 8;
        if (star.z <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * Math.max(canvas.width, canvas.height);
          star.x = centerX + Math.cos(angle) * radius;
          star.y = centerY + Math.sin(angle) * radius;
          star.z = 2000;
          star.ox = star.x;
          star.oy = star.y;
        }

        const k = 128 / star.z;
        const px = (star.x - centerX) * k + centerX;
        const py = (star.y - centerY) * k + centerY;

        const size = (1 - star.z / 2000) * 2;
        const opacity = Math.min(1, (2000 - star.z) / 1000);

        ctx.fillStyle = `rgba(142, 197, 255, ${opacity * 0.8})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();

        const opx = (star.ox - centerX) * k + centerX;
        const opy = (star.oy - centerY) * k + centerY;

        ctx.strokeStyle = `rgba(142, 197, 255, ${opacity * 0.3})`;
        ctx.lineWidth = size * 0.5;
        ctx.beginPath();
        ctx.moveTo(opx, opy);
        ctx.lineTo(px, py);
        ctx.stroke();

        star.ox = star.x;
        star.oy = star.y;
      });

      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.height * 0.6);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.12)');
      gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.04)');
      gradient.addColorStop(1, 'rgba(6, 7, 11, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(animate);
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      animate();
    } else {
      ctx.fillStyle = '#06070B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.height * 0.6);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
      gradient.addColorStop(1, 'rgba(6, 7, 11, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      window.removeEventListener('resize', setCanvasSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};

// AI Agent Console Panel Component
const AgentConsolePanel: React.FC<{ currentService: Service | null }> = ({ currentService }) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="agent-panel"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 20, 30, 0.9), rgba(10, 15, 25, 0.95))',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(142, 197, 255, 0.2)',
        borderRadius: 16,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Agent Console Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'rgba(142, 197, 255, 0.5)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Agent Console
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#4ADE80',
                animation: prefersReducedMotion ? 'none' : 'pulse 2s infinite',
              }}
            />
            <span style={{ fontSize: 8, fontWeight: 600, color: '#4ADE80' }}>ONLINE</span>
          </div>
        </div>

        {/* Telemetry Lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 8, color: 'rgba(183, 195, 214, 0.5)', fontFamily: 'monospace' }}>
            Context: Ready
          </div>
          <div style={{ fontSize: 8, color: 'rgba(183, 195, 214, 0.5)', fontFamily: 'monospace' }}>
            Tools: Attach / Image / Voice
          </div>
          <div style={{ fontSize: 8, color: 'rgba(183, 195, 214, 0.5)', fontFamily: 'monospace' }}>
            Mode: Executive
          </div>
        </div>
      </div>

      {/* AI Agent Visual */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          minHeight: 180,
        }}
      >
        {/* Agent Silhouette (Placeholder - replace with actual asset) */}
        <div
          className={prefersReducedMotion ? '' : 'agent-idle-motion'}
          style={{
            width: '100%',
            maxWidth: 160,
            height: '100%',
            maxHeight: 240,
            background: 'linear-gradient(180deg, rgba(142, 197, 255, 0.15) 0%, rgba(142, 197, 255, 0.05) 100%)',
            borderRadius: 12,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(142, 197, 255, 0.2)',
            boxShadow: '0 4px 24px rgba(142, 197, 255, 0.1)',
          }}
        >
          {/* Executive AI Figure Placeholder */}
          <div
            style={{
              width: '70%',
              height: '85%',
              background: 'linear-gradient(180deg, rgba(232, 238, 248, 0.3) 0%, rgba(232, 238, 248, 0.1) 100%)',
              borderRadius: 8,
              position: 'relative',
            }}
          >
            {/* Head */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(232, 238, 248, 0.4)',
                position: 'absolute',
                top: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                border: '2px solid rgba(142, 197, 255, 0.3)',
              }}
            />
            {/* Shoulders/Coat */}
            <div
              style={{
                width: '100%',
                height: '70%',
                background: 'linear-gradient(180deg, rgba(232, 238, 248, 0.2) 0%, rgba(232, 238, 248, 0.05) 100%)',
                position: 'absolute',
                bottom: 0,
                borderRadius: '8px 8px 0 0',
                border: '1px solid rgba(142, 197, 255, 0.2)',
                borderBottom: 'none',
              }}
            >
              {/* Coat lapels suggestion */}
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  left: '30%',
                  width: 2,
                  height: 60,
                  background: 'rgba(142, 197, 255, 0.2)',
                  transform: 'rotate(-10deg)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  right: '30%',
                  width: 2,
                  height: 60,
                  background: 'rgba(142, 197, 255, 0.2)',
                  transform: 'rotate(10deg)',
                }}
              />
            </div>
          </div>

          {/* Glow effect */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80%',
              height: 40,
              background: 'radial-gradient(ellipse, rgba(142, 197, 255, 0.3), transparent 70%)',
              filter: 'blur(12px)',
            }}
          />
        </div>
      </div>

      {/* Current Service Indicator */}
      {currentService && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            background: 'rgba(142, 197, 255, 0.08)',
            border: '1px solid rgba(142, 197, 255, 0.15)',
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 9, color: 'rgba(142, 197, 255, 0.5)', marginBottom: 2 }}>Active Service:</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#E8EEF8' }}>{currentService.geName}</div>
        </div>
      )}
    </div>
  );
};

export default function HomePage() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const lastSoundTime = useRef(0);

  const quickPrompts = services[activeIndex]?.prompts || defaultQuickPrompts;
  const currentService = services[activeIndex];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 112);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!carouselRef.current) return;

    const scrollLeft = carouselRef.current.scrollLeft;
    const cardWidth = carouselRef.current.offsetWidth * 0.82;
    const newIndex = Math.round(scrollLeft / cardWidth);

    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < services.length) {
      const now = Date.now();
      if (now - lastSoundTime.current > 120) {
        playSlideSound();
        lastSoundTime.current = now;
      }
      setActiveIndex(newIndex);
    }
  }, [activeIndex]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    let timeout: NodeJS.Timeout;
    const debouncedScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleScroll, 50);
    };

    carousel.addEventListener('scroll', debouncedScroll);
    return () => {
      carousel.removeEventListener('scroll', debouncedScroll);
      clearTimeout(timeout);
    };
  }, [handleScroll]);

  const handleSend = () => {
    if (!inputValue.trim() && attachments.length === 0) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setAttachments([]);

    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'გასაგებია. რით შემიძლია დაგეხმაროთ? 🤖',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addAttachment = (type: 'image' | 'file') => {
    const newAttachment: Attachment = {
      id: Date.now().toString(),
      name: type === 'image' ? `სურათი_${attachments.length + 1}.jpg` : `ფაილი_${attachments.length + 1}.pdf`,
      type,
    };
    setAttachments((prev) => [...prev, newAttachment]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt);
    textareaRef.current?.focus();
  };

  const handleServiceClick = (service: Service) => {
    router.push(service.route);
  };

  return (
    <>
      <WarpSpeedBackground />

      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header
          style={{
            padding: '12px 16px',
            background: 'rgba(10, 14, 20, 0.75)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(142, 197, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                ✨
              </div>
              <div>
                <h1 style={{ fontSize: 16, fontWeight: 800, color: '#EAF1FF', margin: 0, lineHeight: 1 }}>Avatar G</h1>
                <p style={{ fontSize: 10, color: 'rgba(142, 197, 255, 0.7)', margin: 0, lineHeight: 1.2 }}>
                  AI Media Factory
                </p>
              </div>
            </div>

            <div
              style={{
                padding: '4px 10px',
                background: 'rgba(74, 222, 128, 0.15)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#4ADE80',
                  animation: 'pulse 2s infinite',
                }}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#4ADE80' }}>აქტიური</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 16px 60px', gap: 24 }}>
          {/* Chat Console with Agent Panel */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: '100%',
                maxWidth: 840,
                background: 'rgba(15, 20, 30, 0.7)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(142, 197, 255, 0.15)',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(142, 197, 255, 0.1)',
              }}
            >
              {/* Chat Header */}
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid rgba(142, 197, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(142, 197, 255, 0.6)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Executive AI Console
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E8EEF8' }}>
                  {currentService ? currentService.geName : 'აღმასრულებელი AI'}
                </span>
              </div>

              {/* Chat Body - 2 Column Layout */}
              <div
                className="chat-body"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                <div
                  className="chat-inner"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: 14,
                    minHeight: 0,
                  }}
                >
                  {/* Agent Panel + Messages Row */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      minHeight: 0,
                      flex: 1,
                    }}
                    className="md:flex-row"
                  >
                    {/* Agent Console Panel - Left/Top */}
                    <div
                      className="agent-panel-wrapper"
                      style={{
                        flexShrink: 0,
                        width: '100%',
                        height: 140,
                        overflow: 'hidden',
                      }}
                    >
                      <AgentConsolePanel currentService={currentService} />
                    </div>

                    {/* Messages Panel - Right/Bottom */}
                    <div
                      className="messages-panel"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                      }}
                    >
                      {/* Messages Area */}
                      <div
                        style={{
                          flex: 1,
                          minHeight: 200,
                          overflowY: 'auto',
                          overflowX: 'hidden',
                          padding: '12px',
                          background: 'rgba(6, 7, 11, 0.3)',
                          borderRadius: 12,
                          border: '1px solid rgba(142, 197, 255, 0.1)',
                        }}
                      >
                        {messages.length === 0 ? (
                          <div
                            style={{
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 12,
                            }}
                          >
                            <p style={{ color: 'rgba(142, 197, 255, 0.5)', fontSize: 12, textAlign: 'center', margin: 0 }}>
                              დაიწყეთ საუბარი AI-თან ✨
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                              {quickPrompts.map((prompt, index) => (
                                <button
                                  key={index}
                                  onClick={() => handleQuickPrompt(prompt)}
                                  style={{
                                    padding: '6px 12px',
                                    fontSize: 10,
                                    background: 'rgba(142, 197, 255, 0.08)',
                                    border: '1px solid rgba(142, 197, 255, 0.2)',
                                    borderRadius: 999,
                                    color: 'rgba(142, 197, 255, 0.9)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(142, 197, 255, 0.15)';
                                    e.currentTarget.style.borderColor = 'rgba(142, 197, 255, 0.4)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(142, 197, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'rgba(142, 197, 255, 0.2)';
                                  }}
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {messages.map((message) => (
                              <div
                                key={message.id}
                                style={{
                                  display: 'flex',
                                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                                }}
                              >
                                <div
                                  style={{
                                    maxWidth: '85%',
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    background:
                                      message.role === 'user'
                                        ? 'rgba(139, 92, 246, 0.15)'
                                        : 'rgba(142, 197, 255, 0.1)',
                                    border: `1px solid ${
                                      message.role === 'user' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(142, 197, 255, 0.15)'
                                    }`,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  <p style={{ color: '#E8EEF8', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                                    {message.content}
                                  </p>
                                  <span
                                    style={{
                                      color: 'rgba(183, 195, 214, 0.5)',
                                      fontSize: 9,
                                      marginTop: 4,
                                      display: 'block',
                                    }}
                                  >
                                    {message.timestamp.toLocaleTimeString('ka-GE', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              </div>
                            ))}
                            <div ref={messagesEndRef} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: 'rgba(142, 197, 255, 0.05)',
                        border: '1px solid rgba(142, 197, 255, 0.1)',
                        borderRadius: 10,
                        maxHeight: 80,
                        overflowY: 'auto',
                      }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 10px',
                              background: 'rgba(142, 197, 255, 0.08)',
                              border: '1px solid rgba(142, 197, 255, 0.2)',
                              borderRadius: 8,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                color: 'rgba(142, 197, 255, 0.9)',
                                fontSize: 10,
                                maxWidth: 80,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {attachment.name}
                            </span>
                            <button
                              onClick={() => removeAttachment(attachment.id)}
                              style={{
                                padding: 2,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <X size={10} color="rgba(142, 197, 255, 0.6)" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Composer */}
                  <div
                    style={{
                      flexShrink: 0,
                      padding: '12px',
                      background: 'rgba(6, 7, 11, 0.3)',
                      border: '1px solid rgba(142, 197, 255, 0.1)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minWidth: 0 }}>
                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => addAttachment('file')}
                          style={{
                            padding: 8,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 40,
                            minHeight: 40,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(142, 197, 255, 0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Paperclip size={16} color="rgba(183, 195, 214, 0.7)" />
                        </button>
                        <button
                          onClick={() => addAttachment('image')}
                          style={{
                            padding: 8,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 40,
                            minHeight: 40,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(142, 197, 255, 0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <ImageIcon size={16} color="rgba(183, 195, 214, 0.7)" />
                        </button>
                        <button
                          style={{
                            padding: 8,
                            background: 'transparent',
                            border: 'none',
                            borderRadius: 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 40,
                            minHeight: 40,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(142, 197, 255, 0.1)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Mic size={16} color="rgba(183, 195, 214, 0.7)" />
                        </button>
                      </div>

                      {/* Textarea */}
                      <textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="ჰკითხე AI-ს ყველაფერი..."
                        rows={1}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '10px 12px',
                          background: 'rgba(142, 197, 255, 0.05)',
                          border: '1px solid rgba(142, 197, 255, 0.15)',
                          borderRadius: 10,
                          color: '#E8EEF8',
                          fontSize: 12,
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'inherit',
                          minHeight: 40,
                          maxHeight: 112,
                        }}
                      />

                      {/* Send Button */}
                      <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() && attachments.length === 0}
                        style={{
                          padding: 10,
                          background:
                            inputValue.trim() || attachments.length > 0
                              ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)'
                              : 'rgba(142, 197, 255, 0.1)',
                          border: 'none',
                          borderRadius: 10,
                          cursor: inputValue.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 40,
                          minHeight: 40,
                          opacity: inputValue.trim() || attachments.length > 0 ? 1 : 0.5,
                          transition: 'all 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <Send size={16} color="#fff" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Services Carousel */}
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h2
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'rgba(142, 197, 255, 0.8)',
                  margin: '0 0 4px',
                  letterSpacing: '0.5px',
                }}
              >
                სერვისები
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(142, 197, 255, 0.5)', margin: 0 }}>
                გადაადგილეთ → აირჩიეთ სერვისი
              </p>
            </div>

            <div
              ref={carouselRef}
              style={{
                display: 'flex',
                gap: 20,
                overflowX: 'auto',
                scrollSnapType: 'x mandatory',
                scrollPaddingLeft: '12vw',
                scrollPaddingRight: '12vw',
                paddingBottom: 20,
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {services.map((service, index) => {
                const distance = Math.abs(index - activeIndex);
                const scale = distance === 0 ? 1.0 : distance === 1 ? 0.86 : 0.76;
                const blur = distance === 0 ? 0 : distance === 1 ? 1.5 : 4;
                const opacity = distance === 0 ? 1.0 : distance === 1 ? 0.65 : 0.35;
                const zIndex = distance === 0 ? 30 : distance === 1 ? 20 : 10;

                return (
                  <div
                    key={service.id}
                    onClick={() => handleServiceClick(service)}
                    style={{
                      minWidth: '82vw',
                      maxWidth: 420,
                      height: 'clamp(300px, 44vh, 420px)',
                      scrollSnapAlign: 'center',
                      transition: 'all 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                      transform: `scale(${scale})`,
                      filter: `blur(${blur}px)`,
                      opacity,
                      zIndex,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(135deg, ${service.color}15, ${service.color}08)`,
                        backdropFilter: 'blur(20px)',
                        border: `1px solid ${service.color}40`,
                        borderRadius: 24,
                        padding: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: `0 8px 32px ${service.color}20, inset 0 1px 0 ${service.color}30`,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 20,
                          background: `linear-gradient(135deg, ${service.color}40, ${service.color}20)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 40,
                          marginBottom: 20,
                          animation: 'iconFloat 4.2s ease-in-out infinite',
                          boxShadow: `0 4px 16px ${service.color}30`,
                        }}
                      >
                        {service.slug === 'avatar-builder' && '🎭'}
                        {service.slug === 'voice-lab' && '🎤'}
                        {service.slug === 'image-architect' && '🎨'}
                        {service.slug === 'music-studio' && '🎵'}
                        {service.slug === 'video-cine-lab' && '🎬'}
                        {service.slug === 'game-forge' && '🎮'}
                        {service.slug === 'ai-production' && '⚡'}
                        {service.slug === 'business-agent' && '💼'}
                        {service.slug === 'prompt-builder' && '📝'}
                        {service.slug === 'image-generator' && '🖼️'}
                        {service.slug === 'video-generator' && '📹'}
                        {service.slug === 'text-intelligence' && '📊'}
                      </div>

                      <div>
                        <h3
                          style={{
                            fontSize: 'clamp(14px, 2.8vw, 18px)',
                            fontWeight: 800,
                            color: '#EAF1FF',
                            margin: '0 0 8px',
                            lineHeight: 1.2,
                          }}
                        >
                          {service.geName}
                        </h3>
                        <p
                          style={{
                            fontSize: 'clamp(11px, 2.2vw, 13px)',
                            color: 'rgba(142, 197, 255, 0.7)',
                            margin: '0 0 16px',
                            lineHeight: 1.4,
                          }}
                        >
                          {service.description}
                        </p>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {service.prompts.slice(0, 2).map((prompt, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: '4px 8px',
                                fontSize: 9,
                                background: `${service.color}20`,
                                border: `1px solid ${service.color}40`,
                                borderRadius: 6,
                                color: service.color,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {prompt}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          position: 'absolute',
                          bottom: -100,
                          right: -100,
                          width: 200,
                          height: 200,
                          background: `radial-gradient(circle, ${service.color}30, transparent 70%)`,
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
              {services.map((_, index) => (
                <div
                  key={index}
                  style={{
                    width: index === activeIndex ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      index === activeIndex ? 'rgba(142, 197, 255, 0.8)' : 'rgba(142, 197, 255, 0.2)',
                    transition: 'all 0.3s',
                  }}
                />
              ))}
            </div>
          </div>
        </main>
      </div>

      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Georgian', sans-serif;
          background: #06070B;
          margin: 0;
          padding: 0;
          overflow-x: hidden;
        }

        div::-webkit-scrollbar {
          display: none;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes iconFloat {
          0%,
          100% {
            transform: rotateY(-6deg) rotateX(3deg) translateY(0px);
          }
          50% {
            transform: rotateY(6deg) rotateX(-3deg) translateY(-4px);
          }
        }

        @keyframes agentIdleMotion {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg) scale(1);
          }
          50% {
            transform: translateY(-3px) rotate(0.3deg) scale(1.01);
          }
        }

        .agent-idle-motion {
          animation: agentIdleMotion 4.6s ease-in-out infinite;
        }

        @media (min-width: 768px) {
          .md\\:flex-row {
            flex-direction: row !important;
          }

          .agent-panel-wrapper {
            width: 36% !important;
            height: auto !important;
            min-height: 360px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          .agent-idle-motion {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </>
  );
}
