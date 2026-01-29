"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, useMotionValue, useSpring, PanInfo } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  User,
  Mic,
  Image as ImageIcon,
  Music,
  Video,
  Gamepad2,
  Bot,
  Briefcase,
  Terminal,
  Sparkles,
  Play,
  FileText,
  Crown,
} from "lucide-react";

const SERVICES = [
  { id: "avatar-builder", name: "ავატარი", nameEn: "Avatar Builder", color: "#FF6B6B", description: "3D ავატარის შექმნა" },
  { id: "voice-lab", name: "ხმა", nameEn: "Voice Lab", color: "#4ECDC4", description: "AI ხმის კლონირება" },
  { id: "image-architect", name: "სურათი", nameEn: "Image Architect", color: "#45B7D1", description: "ვიზუალური დიზაინი" },
  { id: "music-studio", name: "მუსიკა", nameEn: "Music Studio", color: "#96CEB4", description: "AI კომპოზიციები" },
  { id: "video-cine-lab", name: "ვიდეო", nameEn: "Video Cine-Lab", color: "#DDA0DD", description: "კინემატოგრაფია" },
  { id: "game-forge", name: "თამაშები", nameEn: "Game Forge", color: "#FECA57", description: "თამაშების შექმნა" },
  { id: "ai-production", name: "ავტომაცია", nameEn: "AI Production", color: "#FF9FF3", description: "ბიზნეს ავტომაცია" },
  { id: "business-agent", name: "ბიზნესი", nameEn: "Business Agent", color: "#54A0FF", description: "საწარმოო ინტელექტი" },
  { id: "prompt-builder", name: "პრომფტები", nameEn: "Prompt Builder", color: "#48DBFB", description: "ოპტიმიზირებული პრომფტები" },
  { id: "image-generator", name: "სურათის გენერაცია", nameEn: "Image Generator", color: "#1DD1A1", description: "ტექსტიდან სურათი" },
  { id: "video-generator", name: "ვიდეო გენერაცია", nameEn: "Video Generator", color: "#5F27CD", description: "მოძრავი ვიზუალები" },
  { id: "text-intelligence", name: "ტექსტის ანალიზი", nameEn: "Text Intelligence", color: "#00D2D3", description: "ენის დამუშავება" },
  { id: "agent-g", name: "Agent G (პერსონალური)", nameEn: "Personal Agent G", color: "#FFD700", description: "პირადი AI კონსულტანტი", premium: true },
];

const ICON_MAP: Record<string, React.ElementType> = {
  "avatar-builder": User,
  "voice-lab": Mic,
  "image-architect": ImageIcon,
  "music-studio": Music,
  "video-cine-lab": Video,
  "game-forge": Gamepad2,
  "ai-production": Bot,
  "business-agent": Briefcase,
  "prompt-builder": Terminal,
  "image-generator": Sparkles,
  "video-generator": Play,
  "text-intelligence": FileText,
  "agent-g": Crown,
};

const ROUTE_MAP: Record<string, string> = {
  "avatar-builder": "/avatar-builder",
  "voice-lab": "/voice-lab",
  "image-architect": "/image-architect",
  "music-studio": "/music-studio",
  "video-cine-lab": "/video-cine-lab",
  "game-forge": "/game-forge",
  "ai-production": "/ai-production",
  "business-agent": "/business-agent",
  "prompt-builder": "/prompt-builder",
  "image-generator": "/image-generator",
  "video-generator": "/video-generator",
  "text-intelligence": "/text-intelligence",
  "agent-g": "/agent-g",
};

const IMPLEMENTED_ROUTES = [
  "avatar-builder",
  "voice-lab",
  "image-architect",
  "music-studio",
  "video-cine-lab",
  "game-forge",
];

interface ServicesSliderProps {
  soundEnabled: boolean;
}

interface ImageLoadState {
  [key: string]: boolean;
}

export default function ServicesSlider({ soundEnabled }: ServicesSliderProps) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoadStates, setImageLoadStates] = useState<ImageLoadState>({});
  const [showComingSoon, setShowComingSoon] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSoundTime = useRef(0);

  const cardWidth = useMemo(() => {
    if (containerWidth === 0) return 300;
    const isMobile = containerWidth < 640;
    return isMobile ? containerWidth * 0.82 : Math.min(400, containerWidth * 0.38);
  }, [containerWidth]);

  const gap = 24;
  const totalWidth = cardWidth + gap;

  const sidePad = useMemo(() => {
    return Math.max(0, containerWidth / 2 - cardWidth / 2);
  }, [containerWidth, cardWidth]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sfx/ui-swipe-01.mp3");
      audioRef.current.volume = 0.25;
    }
  }, []);

  const playSound = useCallback(() => {
    if (!soundEnabled || !audioRef.current) return;
    const now = Date.now();
    if (now - lastSoundTime.current > 120) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      lastSoundTime.current = now;
    }
  }, [soundEnabled]);

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(SERVICES.length - 1, index));
      if (clamped !== activeIndex) {
        setActiveIndex(clamped);
        playSound();
      }
    },
    [activeIndex, playSound]
  );

  const x = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 420, damping: 38, mass: 0.9 });

  useEffect(() => {
    const targetX = sidePad - activeIndex * totalWidth;
    x.set(targetX);
  }, [activeIndex, sidePad, totalWidth, x]);

  const handleDragStart = () => setIsDragging(true);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setIsDragging(false);
      const threshold = 60;
      const velocity = info.velocity.x;

      if (info.offset.x < -threshold || velocity < -200) {
        goToIndex(activeIndex + 1);
      } else if (info.offset.x > threshold || velocity > 200) {
        goToIndex(activeIndex - 1);
      } else {
        x.set(sidePad - activeIndex * totalWidth);
      }
    },
    [activeIndex, goToIndex, sidePad, totalWidth, x]
  );

  const handleImageError = useCallback((serviceId: string) => {
    setImageLoadStates((prev) => ({ ...prev, [serviceId]: false }));
  }, []);

  const handleImageLoad = useCallback(
    (id: string) => () => {
      setImageLoadStates((prev) => ({ ...prev, [id]: true }));
    },
    []
  );

  const handleOpenService = useCallback(() => {
    const serviceId = SERVICES[activeIndex].id;

    if (!IMPLEMENTED_ROUTES.includes(serviceId)) {
      setShowComingSoon(true);
      setTimeout(() => setShowComingSoon(false), 2000);
      return;
    }

    const route = ROUTE_MAP[serviceId];
    if (route) router.push(route);
  }, [activeIndex, router]);

  return (
    <div className="relative w-full" style={{ perspective: "1200px" }}>
      <button
        onClick={() => goToIndex(activeIndex - 1)}
        disabled={activeIndex === 0}
        className="absolute left-2 sm:left-4 lg:left-8 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="წინა სერვისი"
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={() => goToIndex(activeIndex + 1)}
        disabled={activeIndex === SERVICES.length - 1}
        className="absolute right-2 sm:right-4 lg:right-8 top-1/2 -translate-y-1/2 z-20 p-2 sm:p-3 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="შემდეგი სერვისი"
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div ref={containerRef} className="overflow-hidden py-6 sm:py-8 touch-pan-y">
        <motion.div
          className="flex items-center"
          style={{ x: springX }}
          drag="x"
          dragConstraints={{ left: -Infinity, right: Infinity }}
          dragElastic={0.1}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-shrink-0" style={{ width: sidePad }} />

          {SERVICES.map((service, index) => {
            const isActive = index === activeIndex;
            const Icon = ICON_MAP[service.id];
            const imageLoaded = imageLoadStates[service.id] !== false;
            const isImplemented = IMPLEMENTED_ROUTES.includes(service.id);

            return (
              <motion.div
                key={service.id}
                className="flex-shrink-0 px-2 sm:px-3"
                style={{ width: cardWidth }}
                animate={{
                  scale: isActive ? 1.06 : 0.92,
                  opacity: isActive ? 1 : 0.55,
                  y: isActive ? 0 : 10,
                  rotateY: index < activeIndex ? -8 : index > activeIndex ? 8 : 0,
                  filter: isActive ? "blur(0px)" : "blur(1.5px)",
                }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.9 }}
              >
                <div
                  className={`relative h-[380px] sm:h-[440px] lg:h-[480px] rounded-2xl sm:rounded-3xl backdrop-blur-xl border overflow-hidden ${
                    service.premium
                      ? "bg-gradient-to-b from-yellow-500/10 to-black/40 border-yellow-500/30"
                      : "bg-white/5 border-white/10"
                  } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                  onClick={() => {
                    if (!isDragging) goToIndex(index);
                  }}
                >
                  {service.premium && (
                    <div className="absolute top-3 sm:top-4 right-3 sm:right-4 z-10">
                      <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
                    </div>
                  )}

                  {!isImplemented && (
                    <div className="absolute top-3 sm:top-4 left-3 sm:left-4 z-10 px-2 py-1 rounded-full bg-gray-500/20 border border-gray-500/30 text-[10px] text-gray-300">
                      Coming soon
                    </div>
                  )}

                  <div className="h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center">
                    <motion.div
                      className="relative w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 mb-4 sm:mb-6"
                      animate={{ y: [0, -6, 0], rotateZ: [0, 1.5, 0] }}
                      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {imageLoaded ? (
                        <Image
                          src={`/icons/services/${service.id}.webp`}
                          alt={service.name}
                          fill
                          className="object-contain drop-shadow-2xl"
                          onError={() => handleImageError(service.id)}
                          onLoad={handleImageLoad(service.id)}
                          priority={index <= 2}
                        />
                      ) : (
                        <div
                          className="w-full h-full rounded-2xl flex items-center justify-center"
                          style={{ backgroundColor: `${service.color}20`, color: service.color }}
                        >
                          <Icon className="w-10 h-10 sm:w-12 sm:h-12" />
                        </div>
                      )}
                    </motion.div>

                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 leading-tight">
                      {service.name}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-2 sm:mb-4 hidden sm:block">
                      {service.nameEn}
                    </p>
                    <p className="text-gray-400 text-xs sm:text-sm lg:text-base px-2">
                      {service.description}
                    </p>

                    {isActive && (
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenService();
                        }}
                        className={`mt-6 sm:mt-8 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-xs sm:text-sm transition-colors ${
                          isImplemented
                            ? "bg-white text-black hover:bg-gray-100"
                            : "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                        }`}
                      >
                        {isImplemented ? "გახსნა" : "მალე"}
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          <div className="flex-shrink-0" style={{ width: sidePad }} />
        </motion.div>
      </div>

      <div className="flex justify-center gap-1.5 sm:gap-2 mt-4 sm:mt-6 px-4 flex-wrap">
        {SERVICES.map((_, index) => (
          <button
            key={index}
            onClick={() => goToIndex(index)}
            className={`h-1 sm:h-1.5 rounded-full transition-all duration-300 ${
              index === activeIndex ? "w-6 sm:w-8 bg-white" : "w-1.5 sm:w-1.5 bg-white/20 hover:bg-white/40"
            }`}
            aria-label={`სერვისი ${index + 1}`}
          />
        ))}
      </div>

      <div
        className={`fixed bottom-24 left-4 right-4 max-w-md mx-auto transition-all duration-300 ${
          showComingSoon ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="px-4 py-3 rounded-xl bg-gray-500/20 border border-gray-500/30 text-gray-300 text-sm text-center">
          მალე ხელმისწვდომი იქნება
        </div>
      </div>
    </div>
  );
}
