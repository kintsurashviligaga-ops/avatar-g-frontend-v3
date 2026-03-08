"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ErrorBoundary from "@/components/landing/ErrorBoundary";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type OptionGroupKey = "audience" | "goal" | "depth";

interface OptionGroup {
  key: OptionGroupKey;
  label: string;
  values: Array<{ id: string; label: string }>;
}

interface LandingSectionStep {
  id: string;
  title: string;
  detail: string;
  readiness: number;
}

const CONTROL_CENTER_STORAGE_KEY = "myavatar:landing:control-center:v2";

function trackControlCenterEvent(event: string, locale: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const enriched = {
    event,
    locale,
    page: window.location.pathname,
    ts: Date.now(),
    ...payload,
  };

  (window as Window & { dataLayer?: unknown[] }).dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer || [];
  (window as Window & { dataLayer?: unknown[] }).dataLayer?.push(enriched);

  try {
    navigator.sendBeacon?.("/api/analytics/events", JSON.stringify(enriched));
  } catch {
    // Non-blocking analytics
  }
}

const HeroSection = dynamic(() => import("@/components/HeroSection").then((m) => m.HeroSection), {
  ssr: true,
  loading: () => <SectionFallback label="Hero" />,
});

const StatsSection = dynamic(() => import("@/components/landing/StatsSection").then((m) => m.StatsSection), {
  ssr: true,
  loading: () => <SectionFallback label="Stats" />,
});

const OrbitSolarSystem = dynamic(() => import("@/components/OrbitSolarSystem").then((m) => m.OrbitSolarSystem), {
  ssr: false,
  loading: () => <SectionFallback label="Orbit" />,
});

const FeaturesShowcase = dynamic(() => import("@/components/landing/FeaturesShowcase").then((m) => m.FeaturesShowcase), {
  ssr: true,
  loading: () => <SectionFallback label="Features" />,
});

const WorkflowCinematicSection = dynamic(() => import("@/components/WorkflowCinematicSection").then((m) => m.WorkflowCinematicSection), {
  ssr: true,
  loading: () => <SectionFallback label="Cinematic" />,
});

const LiveAvatarDemoSection = dynamic(() => import("@/components/landing/LiveAvatarDemoSection").then((m) => m.LiveAvatarDemoSection), {
  ssr: true,
  loading: () => <SectionFallback label="Avatar Demo" />,
});

const PricingSection = dynamic(() => import("@/components/PricingSection").then((m) => m.PricingSection), {
  ssr: true,
  loading: () => <SectionFallback label="Pricing" />,
});

const CTABanner = dynamic(() => import("@/components/landing/CTABanner").then((m) => m.CTABanner), {
  ssr: true,
  loading: () => <SectionFallback label="CTA" />,
});

const PremiumAgentForm = dynamic(() => import("@/components/landing/PremiumAgentForm"), {
  ssr: false,
  loading: () => null,
});

const CosmicSingularityBackground = dynamic(() => import("@/components/CosmicSingularityBackground"), {
  ssr: false,
  loading: () => null,
});

function SectionFallback({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 md:py-16 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-10 backdrop-blur-sm">
        <p className="text-cyan-100/50 text-xs uppercase tracking-[0.18em]">{label}</p>
      </div>
    </div>
  );
}

function LandingSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative ag-slide-up py-1 md:py-2">
      {children}
    </section>
  );
}

export default function LandingPageClient() {
  const [showPremiumForm, setShowPremiumForm] = useState(false);
  const [enableHeavyFx, setEnableHeavyFx] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Record<OptionGroupKey, string>>({
    audience: "",
    goal: "",
    depth: "",
  });
  const { language: locale } = useLanguage();

  const controlCenterCopy = {
    en: {
      badge: "Guided Setup",
      title: "Landing Control Center",
      subtitle: "Pick your direction, get a structured AI plan, and launch faster with clean execution flow.",
      optionsTitle: "Planning Options",
      chartTitle: "Readiness Chart",
      chartHint: "Interactive planning score based on your selected options.",
      optionsCoverageLabel: "Options Coverage",
      sectionReadinessLabel: "Section Readiness",
      readinessSuffix: "readiness",
      optionGroups: [
        { key: "audience", label: "Audience", values: [{ id: "creator", label: "Creator" }, { id: "agency", label: "Agency" }, { id: "enterprise", label: "Enterprise" }] },
        { key: "goal", label: "Primary Goal", values: [{ id: "growth", label: "Brand Growth" }, { id: "revenue", label: "Revenue" }, { id: "automation", label: "Automation" }] },
        { key: "depth", label: "Execution Depth", values: [{ id: "quick", label: "Quick Start" }, { id: "balanced", label: "Balanced" }, { id: "deep", label: "Deep Plan" }] },
      ] as OptionGroup[],
      sections: [
        { id: "brief", title: "Step 1: Strategic Brief", detail: "Capture context, constraints, and success metrics.", readiness: 84 },
        { id: "workflow", title: "Step 2: Workflow Mapping", detail: "Convert goals into section-based AI pipeline.", readiness: 79 },
        { id: "delivery", title: "Step 3: Delivery Plan", detail: "Prepare final output, export channels, and KPI checks.", readiness: 87 },
      ] as LandingSectionStep[],
      summaryLabel: "Current Launch Confidence",
      openRecommended: "Open Recommended Service",
      openAgent: "Open Agent G Workspace",
      openAll: "Explore All Services",
      orbitEyebrow: "Interactive AI Ecosystem",
      orbitTitle: "AI System Orbit",
      orbitDescription: "Core AI center with connected module nodes, live hover detail, and service entry points.",
    },
    ka: {
      badge: "მიმართული სტარტი",
      title: "Landing მართვის ცენტრი",
      subtitle: "აირჩიე მიმართულება, მიიღე სტრუქტურირებული AI გეგმა და გაუშვი სწრაფად.",
      optionsTitle: "დაგეგმვის პარამეტრები",
      chartTitle: "მზადყოფნის გრაფიკი",
      chartHint: "ინტერაქტიული დაგეგმვის ქულა არჩეული პარამეტრების მიხედვით.",
      optionsCoverageLabel: "პარამეტრების დაფარვა",
      sectionReadinessLabel: "სექციების მზადყოფნა",
      readinessSuffix: "მზადყოფნა",
      optionGroups: [
        { key: "audience", label: "აუდიტორია", values: [{ id: "creator", label: "კონტენტ კრეატორი" }, { id: "agency", label: "სააგენტო" }, { id: "enterprise", label: "კორპორაცია" }] },
        { key: "goal", label: "მთავარი მიზანი", values: [{ id: "growth", label: "ბრენდის ზრდა" }, { id: "revenue", label: "შემოსავლის ზრდა" }, { id: "automation", label: "ავტომატიზაცია" }] },
        { key: "depth", label: "შესრულების სიღრმე", values: [{ id: "quick", label: "სწრაფი სტარტი" }, { id: "balanced", label: "ბალანსირებული" }, { id: "deep", label: "ღრმა გეგმა" }] },
      ] as OptionGroup[],
      sections: [
        { id: "brief", title: "ნაბიჯი 1: სტრატეგიული ბრიფი", detail: "კონტექსტი, შეზღუდვები და წარმატების საზომები.", readiness: 84 },
        { id: "workflow", title: "ნაბიჯი 2: სამუშაო ნაკადის რუკა", detail: "მიზნების გარდაქმნა სექციებზე დაფუძნებულ AI პაიპლაინად.", readiness: 79 },
        { id: "delivery", title: "ნაბიჯი 3: მიწოდების გეგმა", detail: "ფინალური შედეგი, ექსპორტი და KPI კონტროლი.", readiness: 87 },
      ] as LandingSectionStep[],
      summaryLabel: "ამჟამინდელი გაშვების სანდოობა",
      openRecommended: "რეკომენდებული სერვისის გახსნა",
      openAgent: "Agent G სამუშაო სივრცის გახსნა",
      openAll: "ყველა სერვისის ნახვა",
      orbitEyebrow: "ინტერაქტიული AI ეკოსისტემა",
      orbitTitle: "AI სისტემის ორბიტა",
      orbitDescription: "AI ბირთვი დაკავშირებული მოდულებით, hover-დეტალებით და სერვისებზე პირდაპირი წვდომით.",
    },
    ru: {
      badge: "Пошаговый старт",
      title: "Центр управления Landing",
      subtitle: "Выберите направление, получите структурированный AI-план и запускайтесь быстрее.",
      optionsTitle: "Параметры планирования",
      chartTitle: "График готовности",
      chartHint: "Интерактивная оценка плана на основе выбранных опций.",
      optionsCoverageLabel: "Покрытие параметров",
      sectionReadinessLabel: "Готовность секций",
      readinessSuffix: "готовность",
      optionGroups: [
        { key: "audience", label: "Аудитория", values: [{ id: "creator", label: "Креатор" }, { id: "agency", label: "Агентство" }, { id: "enterprise", label: "Корпорация" }] },
        { key: "goal", label: "Главная цель", values: [{ id: "growth", label: "Рост бренда" }, { id: "revenue", label: "Рост выручки" }, { id: "automation", label: "Автоматизация" }] },
        { key: "depth", label: "Глубина исполнения", values: [{ id: "quick", label: "Быстрый старт" }, { id: "balanced", label: "Сбалансировано" }, { id: "deep", label: "Глубокий план" }] },
      ] as OptionGroup[],
      sections: [
        { id: "brief", title: "Шаг 1: Стратегический бриф", detail: "Контекст, ограничения и метрики результата.", readiness: 84 },
        { id: "workflow", title: "Шаг 2: Карта workflow", detail: "Преобразование целей в секционно-ориентированный AI pipeline.", readiness: 79 },
        { id: "delivery", title: "Шаг 3: План доставки", detail: "Финальная сборка, экспорт и KPI-контроль.", readiness: 87 },
      ] as LandingSectionStep[],
      summaryLabel: "Текущая готовность к запуску",
      openRecommended: "Открыть рекомендуемый сервис",
      openAgent: "Открыть рабочее пространство Agent G",
      openAll: "Смотреть все сервисы",
      orbitEyebrow: "Интерактивная AI-экосистема",
      orbitTitle: "AI орбитальная система",
      orbitDescription: "Центральное AI-ядро с модульными узлами, hover-деталями и прямым входом в сервисы.",
    },
  } as const;

  const currentCopy = controlCenterCopy[locale as keyof typeof controlCenterCopy] ?? controlCenterCopy.en;
  const recommendationTitle = locale === "ka"
    ? "ადაპტური რეკომენდაციები"
    : locale === "ru"
      ? "Адаптивные рекомендации"
      : "Adaptive Recommendations";
  const recommendationHint = locale === "ka"
    ? "AI არჩევს ყველაზე ძლიერ workflow-ს შენი მიზნისა და პროფილის მიხედვით."
    : locale === "ru"
      ? "AI подбирает наиболее сильный workflow по вашей цели и профилю."
      : "AI selects the strongest workflow based on your goal and execution profile.";
  const openWorkflowLabel = locale === "ka"
    ? "workflow-ის გახსნა"
    : locale === "ru"
      ? "Открыть workflow"
      : "Open Workflow";

  const serviceDisplayName = (service: string) => {
    const names = {
      workflow: locale === "ka" ? "Automation Workflow" : locale === "ru" ? "Automation Workflow" : "Automation Workflow",
      business: locale === "ka" ? "Business Intelligence" : locale === "ru" ? "Business Intelligence" : "Business Intelligence",
      media: locale === "ka" ? "Media Production" : locale === "ru" ? "Media Production" : "Media Production",
      "agent-g": locale === "ka" ? "Agent G Orchestrator" : locale === "ru" ? "Agent G Orchestrator" : "Agent G Orchestrator",
    } as const;
    return names[service as keyof typeof names] ?? service;
  };

  useEffect(() => {
    const defaults = currentCopy.optionGroups.reduce((acc, group) => {
      acc[group.key] = group.values[0]?.id ?? "";
      return acc;
    }, {} as Record<OptionGroupKey, string>);

    if (typeof window === "undefined") {
      setSelectedOptions(defaults);
      return;
    }

    try {
      const raw = localStorage.getItem(CONTROL_CENTER_STORAGE_KEY);
      if (!raw) {
        setSelectedOptions(defaults);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<Record<OptionGroupKey, string>>;
      const merged = { ...defaults };

      currentCopy.optionGroups.forEach((group) => {
        const candidate = parsed[group.key];
        if (candidate && group.values.some((value) => value.id === candidate)) {
          merged[group.key] = candidate;
        }
      });

      setSelectedOptions(merged);
    } catch {
      setSelectedOptions(defaults);
    }
  }, [locale, currentCopy.optionGroups]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(CONTROL_CENTER_STORAGE_KEY, JSON.stringify(selectedOptions));
    } catch {
      // Ignore storage errors
    }
  }, [selectedOptions]);

  const optionLabel = (key: OptionGroupKey, id: string) => {
    return currentCopy.optionGroups.find((group) => group.key === key)?.values.find((value) => value.id === id)?.label ?? id;
  };

  const selectedCount = Object.values(selectedOptions).filter(Boolean).length;
  const optionCoverage = Math.round((selectedCount / currentCopy.optionGroups.length) * 100);
  const readinessAverage = Math.round(currentCopy.sections.reduce((sum, item) => sum + item.readiness, 0) / currentCopy.sections.length);
  const launchConfidence = Math.round((optionCoverage * 0.52) + (readinessAverage * 0.48));

  const chosenGoal = selectedOptions.goal || currentCopy.optionGroups.find((group) => group.key === "goal")?.values[0]?.id || "";

  const candidateScores = [
    {
      service: "workflow",
      score:
        (selectedOptions.goal === "automation" ? 44 : 12) +
        (selectedOptions.audience === "enterprise" ? 24 : 10) +
        (selectedOptions.depth === "deep" ? 20 : selectedOptions.depth === "balanced" ? 12 : 6),
      reason: locale === "ka"
        ? "საუკეთესოა პროცესების ავტომატიზაციისა და სტაბილური ოპერაციებისთვის."
        : locale === "ru"
          ? "Лучший выбор для автоматизации процессов и стабильных операций."
          : "Best fit for process automation and stable operational execution.",
    },
    {
      service: "business",
      score:
        (selectedOptions.goal === "revenue" ? 46 : 16) +
        (selectedOptions.audience === "agency" ? 22 : selectedOptions.audience === "enterprise" ? 18 : 10) +
        (selectedOptions.depth === "deep" ? 18 : selectedOptions.depth === "balanced" ? 12 : 7),
      reason: locale === "ka"
        ? "მაქსიმალური ფოკუსი შემოსავალზე, ზრდაზე და KPI-ებზე."
        : locale === "ru"
          ? "Максимальный фокус на выручке, росте и KPI."
          : "Strong focus on revenue growth, monetization and KPI impact.",
    },
    {
      service: "media",
      score:
        (selectedOptions.goal === "growth" ? 38 : 18) +
        (selectedOptions.audience === "creator" ? 24 : 12) +
        (selectedOptions.depth === "quick" ? 20 : selectedOptions.depth === "balanced" ? 14 : 10),
      reason: locale === "ka"
        ? "ოპტიმალურია სწრაფი კრეატიული კონტენტისთვის და აუდიტორიის ზრდისთვის."
        : locale === "ru"
          ? "Оптимально для быстрого креативного контента и роста аудитории."
          : "Ideal for fast creative output and audience growth campaigns.",
    },
    {
      service: "agent-g",
      score:
        22 +
        (selectedOptions.audience === "enterprise" ? 20 : 10) +
        (selectedOptions.depth === "deep" ? 18 : 10),
      reason: locale === "ka"
        ? "უნივერსალური კოორდინატორი მრავალ-სერვისიანი orchestrated workflow-სთვის."
        : locale === "ru"
          ? "Универсальный координатор для мультисервисного orchestrated workflow."
          : "Universal coordinator for multi-service orchestrated workflows.",
    },
  ].sort((a, b) => b.score - a.score);

  const recommendedService = candidateScores[0]?.service ?? (chosenGoal === "automation" ? "workflow" : chosenGoal === "revenue" ? "business" : "media");
  const topRecommendations = candidateScores.slice(0, 3);
  const maxRecommendationScore = topRecommendations[0]?.score || 1;

  const buildWorkspaceHref = (serviceSlug: string) => {
    const section =
      recommendedService === "workflow"
        ? "workflow"
        : recommendedService === "business"
          ? "delivery"
          : "brief";

    const prompt =
      locale === "ka"
        ? `შექმენი პროფესიონალური სამუშაო გეგმა: აუდიტორია ${optionLabel("audience", selectedOptions.audience)}, მიზანი ${optionLabel("goal", selectedOptions.goal)}, სიღრმე ${optionLabel("depth", selectedOptions.depth)}.`
        : locale === "ru"
          ? `Собери профессиональный рабочий план: аудитория ${optionLabel("audience", selectedOptions.audience)}, цель ${optionLabel("goal", selectedOptions.goal)}, глубина ${optionLabel("depth", selectedOptions.depth)}.`
          : `Build a professional execution plan: audience ${optionLabel("audience", selectedOptions.audience)}, goal ${optionLabel("goal", selectedOptions.goal)}, depth ${optionLabel("depth", selectedOptions.depth)}.`;

    const options = [
      `quality:${selectedOptions.depth === "quick" ? "Fast" : selectedOptions.depth === "deep" ? "Premium" : "Balanced"}`,
      `format:${selectedOptions.depth === "deep" ? "Detailed" : "Structured"}`,
      `focus:${selectedOptions.goal === "revenue" ? "Conversion" : selectedOptions.goal === "automation" ? "Scalability" : "Creative"}`,
    ].join(",");

    const params = new URLSearchParams({ prompt, section, options });
    return `/${locale}/services/${serviceSlug}?${params.toString()}`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const screenMedia = window.matchMedia("(min-width: 768px)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncEffects = () => {
      setEnableHeavyFx(screenMedia.matches && !motionMedia.matches);
    };

    syncEffects();

    // Safari compatibility: older MediaQueryList only supports addListener/removeListener.
    if (typeof screenMedia.addEventListener === "function" && typeof motionMedia.addEventListener === "function") {
      screenMedia.addEventListener("change", syncEffects);
      motionMedia.addEventListener("change", syncEffects);
    } else {
      screenMedia.addListener(syncEffects);
      motionMedia.addListener(syncEffects);
    }

    return () => {
      if (typeof screenMedia.removeEventListener === "function" && typeof motionMedia.removeEventListener === "function") {
        screenMedia.removeEventListener("change", syncEffects);
        motionMedia.removeEventListener("change", syncEffects);
      } else {
        screenMedia.removeListener(syncEffects);
        motionMedia.removeListener(syncEffects);
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-transparent text-white overflow-hidden ag-noise ag-neon-grid-lines">
      {enableHeavyFx && <CosmicSingularityBackground />}

      {/* Color Overlay — warm cinematic grade */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 980px 560px at 20% 14%, rgba(34,211,238,0.28), transparent 58%),' +
            'radial-gradient(ellipse 760px 430px at 84% 80%, rgba(124,92,252,0.24), transparent 52%),' +
            'linear-gradient(180deg, rgba(3,7,18,0.14) 0%, rgba(3,7,18,0.04) 50%, rgba(3,7,18,0.18) 100%)',
        }}
      />

      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(3,7,18,0.32)_100%)]" />

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <div className="absolute top-[-110px] left-1/2 -translate-x-1/2 w-[680px] h-[340px] sm:w-[900px] sm:h-[450px] bg-cyan-500/[0.08] sm:bg-cyan-500/[0.1] blur-[80px] sm:blur-[120px] rounded-full" />
        <div className="hidden sm:block absolute bottom-[20%] right-[-80px] w-[380px] h-[380px] bg-violet-500/[0.1] blur-[120px] rounded-full" />
        <div className="hidden md:block absolute left-[-60px] top-[35%] w-[280px] h-[280px] rounded-full bg-blue-500/[0.09] blur-[120px]" />
      </div>

      {/* Neon contour rails */}
      <div className="pointer-events-none absolute inset-0 z-[2] opacity-75">
        <div className="absolute inset-y-0 left-[6%] w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        <div className="absolute inset-y-0 right-[6%] w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        <div className="absolute top-[14%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 pointer-events-auto">
        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Hero" />}>
            <HeroSection onPremiumClick={() => setShowPremiumForm(true)} />
          </ErrorBoundary>
        </LandingSection>

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Stats" />}>
            <StatsSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Control Center" />}>
            <section className="relative px-4 sm:px-6 py-10 md:py-14">
              <div className="mx-auto max-w-6xl rounded-3xl border border-white/[0.12] bg-[linear-gradient(145deg,rgba(6,12,26,0.78),rgba(8,16,34,0.66))] shadow-[0_20px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl p-5 sm:p-6 md:p-8 space-y-6">
                <div className="text-center max-w-3xl mx-auto">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/80">{currentCopy.badge}</p>
                  <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white ag-lux-type-h">{currentCopy.title}</h2>
                  <p className="mt-3 text-sm md:text-base text-white/60 ag-lux-type-body">{currentCopy.subtitle}</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-4 md:gap-5">
                  <div className="rounded-2xl border border-white/[0.12] bg-white/[0.03] p-4 md:p-5 space-y-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/55">{currentCopy.optionsTitle}</p>
                    <div className="space-y-3">
                      {currentCopy.optionGroups.map((group) => (
                        <div key={group.key} className="space-y-2">
                          <p className="text-xs text-white/70">{group.label}</p>
                          <div className="flex flex-wrap gap-2">
                            {group.values.map((value) => {
                              const active = selectedOptions[group.key] === value.id;
                              return (
                                <button
                                  key={value.id}
                                  onClick={() => {
                                    setSelectedOptions((prev) => ({ ...prev, [group.key]: value.id }));
                                    trackControlCenterEvent("control_center_option_selected", locale, {
                                      optionGroup: group.key,
                                      optionValue: value.id,
                                    });
                                  }}
                                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${active ? "border-cyan-300/60 bg-cyan-500/20 text-cyan-100" : "border-white/20 bg-white/[0.04] text-white/70 hover:bg-white/[0.1]"}`}
                                >
                                  {value.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-300/30 bg-[linear-gradient(145deg,rgba(34,211,238,0.14),rgba(15,23,42,0.32))] p-4 md:p-5 space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/85">{currentCopy.chartTitle}</p>
                      <p className="text-xs text-cyan-100/70 mt-1">{currentCopy.chartHint}</p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-cyan-100/90">
                          <span>{currentCopy.optionsCoverageLabel}</span>
                          <span>{optionCoverage}%</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-cyan-950/40 overflow-hidden">
                          <div className="h-full bg-cyan-300 transition-all" style={{ width: `${optionCoverage}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-cyan-100/90">
                          <span>{currentCopy.sectionReadinessLabel}</span>
                          <span>{readinessAverage}%</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-cyan-950/40 overflow-hidden">
                          <div className="h-full bg-sky-300 transition-all" style={{ width: `${readinessAverage}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[12px] font-semibold text-cyan-50">
                          <span>{currentCopy.summaryLabel}</span>
                          <span>{launchConfidence}%</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-cyan-950/40 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 transition-all" style={{ width: `${launchConfidence}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {currentCopy.sections.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/[0.12] bg-white/[0.02] p-3.5">
                      <p className="text-xs font-semibold text-white/88">{item.title}</p>
                      <p className="mt-1.5 text-xs text-white/55 leading-relaxed">{item.detail}</p>
                      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-300 to-indigo-300" style={{ width: `${item.readiness}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-white/45">{item.readiness}% {currentCopy.readinessSuffix}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-amber-300/30 bg-[linear-gradient(145deg,rgba(251,191,36,0.15),rgba(30,41,59,0.28))] p-4 md:p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-amber-100/85">{recommendationTitle}</p>
                      <p className="text-xs text-amber-50/75 mt-1">{recommendationHint}</p>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full border border-amber-200/35 bg-black/20 text-amber-100/90">{launchConfidence}%</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {topRecommendations.map((item) => {
                      const normalized = Math.max(20, Math.round((item.score / maxRecommendationScore) * 100));
                      return (
                        <div key={item.service} className="rounded-xl border border-white/[0.12] bg-black/20 p-3 space-y-2">
                          <p className="text-xs font-semibold text-white/90">{serviceDisplayName(item.service)}</p>
                          <p className="text-[11px] text-white/65 leading-relaxed min-h-[34px]">{item.reason}</p>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-200 to-amber-400" style={{ width: `${normalized}%` }} />
                          </div>
                          <Link
                            href={buildWorkspaceHref(item.service)}
                            onClick={() => {
                              trackControlCenterEvent("control_center_adaptive_open", locale, {
                                service: item.service,
                                score: item.score,
                                selectedOptions,
                              });
                            }}
                            className="inline-flex text-[11px] text-amber-100 hover:text-amber-50"
                          >
                            {openWorkflowLabel}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <Link
                    href={buildWorkspaceHref(recommendedService)}
                    onClick={() => {
                      trackControlCenterEvent("control_center_cta_click", locale, {
                        cta: "recommended_service",
                        service: recommendedService,
                        selectedOptions,
                        launchConfidence,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/45 bg-cyan-500/20 px-4 py-2.5 text-sm font-medium text-cyan-50 hover:bg-cyan-500/28 transition-colors"
                  >
                    {currentCopy.openRecommended}
                  </Link>
                  <Link
                    href={buildWorkspaceHref("agent-g")}
                    onClick={() => {
                      trackControlCenterEvent("control_center_cta_click", locale, {
                        cta: "agent_g_workspace",
                        service: "agent-g",
                        selectedOptions,
                        launchConfidence,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/45 bg-amber-500/18 px-4 py-2.5 text-sm font-medium text-amber-50 hover:bg-amber-500/26 transition-colors"
                  >
                    {currentCopy.openAgent}
                  </Link>
                  <Link
                    href={`/${locale}/services`}
                    onClick={() => {
                      trackControlCenterEvent("control_center_cta_click", locale, {
                        cta: "explore_all_services",
                        selectedOptions,
                        launchConfidence,
                      });
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/85 hover:bg-white/[0.1] transition-colors"
                  >
                    {currentCopy.openAll}
                  </Link>
                </div>
              </div>
            </section>
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Orbit" />}>
            <section className="relative pb-10 md:pb-14 px-4 sm:px-6">
              <div className="mx-auto max-w-4xl text-center pt-10 md:pt-14">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/72">{currentCopy.orbitEyebrow}</p>
                <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-white ag-lux-type-h">{currentCopy.orbitTitle}</h2>
                <p className="mt-3 text-sm md:text-base ag-lux-type-body">{currentCopy.orbitDescription}</p>
              </div>
              <OrbitSolarSystem />
            </section>
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Features" />}>
            <FeaturesShowcase />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Cinematic" />}>
            <WorkflowCinematicSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Avatar Demo" />}>
            <LiveAvatarDemoSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="Pricing" />}>
            <PricingSection />
          </ErrorBoundary>
        </LandingSection>

        <div className="ag-lux-line mx-auto max-w-6xl opacity-70" />

        <LandingSection>
          <ErrorBoundary fallback={<SectionFallback label="CTA" />}>
            <CTABanner />
          </ErrorBoundary>
        </LandingSection>

        {/* ═══ Footer ═══ */}
        <footer className="relative mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 md:py-16 rounded-t-3xl bg-[linear-gradient(140deg,rgba(8,14,30,0.78),rgba(5,10,24,0.66))] backdrop-blur-[18px] shadow-[0_14px_46px_rgba(0,0,0,0.42)] ag-lux-outline-30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8">
              {/* Brand Column */}
              <div className="col-span-2 md:col-span-1">
                <BrandLogo href={`/${locale}`} size="sm20" showText />
                <p className="mt-4 text-sm text-white/35 leading-relaxed max-w-xs">
                  {locale === 'ka' ? 'AI-ზე დაფუძნებული შემოქმედებითი პლატფორმა. 16 მოდული, ერთი ინტელექტუალური სივრცე.' :
                   locale === 'ru' ? 'Креативная платформа на основе AI. 16 модулей, одно интеллектуальное пространство.' :
                   'AI-powered creative platform. 16 modules, one intelligent space.'}
                </p>
              </div>

              {/* Links columns */}
              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'პლატფორმა' : locale === 'ru' ? 'Платформа' : 'Platform'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'სერვისები' : locale === 'ru' ? 'Сервисы' : 'Services', href: `/${locale}/services` },
                    { label: locale === 'ka' ? 'ფასები' : locale === 'ru' ? 'Тарифы' : 'Pricing', href: `/${locale}/pricing` },
                    { label: locale === 'ka' ? 'ავატარ სტუდია' : locale === 'ru' ? 'Аватар-студия' : 'Avatar Studio', href: `/${locale}/services/avatar` },
                    { label: locale === 'ka' ? 'ვიდეო AI' : locale === 'ru' ? 'Видео AI' : 'Video AI', href: `/${locale}/services/video` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'კომპანია' : locale === 'ru' ? 'Компания' : 'Company'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'ჩვენს შესახებ' : locale === 'ru' ? 'О нас' : 'About', href: `/${locale}/about` },
                    { label: locale === 'ka' ? 'ბლოგი' : locale === 'ru' ? 'Блог' : 'Blog', href: `/${locale}/blog` },
                    { label: locale === 'ka' ? 'კარიერა' : locale === 'ru' ? 'Карьера' : 'Careers', href: `/${locale}/careers` },
                    { label: locale === 'ka' ? 'კონტაქტი' : locale === 'ru' ? 'Контакт' : 'Contact', href: `/${locale}/contact` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-semibold text-white/50 uppercase tracking-[0.2em] mb-4">
                  {locale === 'ka' ? 'იურიდიული' : locale === 'ru' ? 'Правовая информация' : 'Legal'}
                </h4>
                <ul className="space-y-2.5">
                  {[
                    { label: locale === 'ka' ? 'კონფიდენციალურობა' : locale === 'ru' ? 'Конфиденциальность' : 'Privacy', href: `/${locale}/privacy` },
                    { label: locale === 'ka' ? 'პირობები' : locale === 'ru' ? 'Условия' : 'Terms', href: `/${locale}/terms` },
                    { label: 'Cookies', href: `/${locale}/cookies` },
                    { label: locale === 'ka' ? 'ლიცენზიები' : locale === 'ru' ? 'Лицензии' : 'Licenses', href: `/${locale}/licenses` },
                  ].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} className="text-sm text-white/35 hover:text-white/70 transition-colors duration-200">{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="mt-12 pt-6 border-t border-white/[0.10] flex flex-col md:flex-row items-center justify-between gap-3">
              <span className="text-xs text-white/25">
                &copy; {new Date().getFullYear()} MyAvatar.ge — {locale === 'ka' ? 'ყველა უფლება დაცულია.' : locale === 'ru' ? 'Все права защищены.' : 'All rights reserved.'}
              </span>
              <p className="text-[10px] text-white/15 font-mono tracking-wider">
                {'BUILD ' + (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 7) : 'dev') + ' · ' + (process.env.NEXT_PUBLIC_VERCEL_ENV || 'local')}
              </p>
            </div>
          </div>
        </footer>
      </div>

      <ErrorBoundary fallback={null}>
        <PremiumAgentForm isOpen={showPremiumForm} onClose={() => setShowPremiumForm(false)} />
      </ErrorBoundary>
    </div>
  );
}
