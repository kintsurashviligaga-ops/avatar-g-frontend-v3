import type { Metadata, Viewport } from "next";
import { Inter, Syne, DM_Sans, Noto_Sans_Georgian } from "next/font/google";
import "./globals.css";
import Providers from "@/app/providers";
import { AppShell } from "@/components/AppShell";
import { logStartupEnvValidation } from "@/lib/env/startupValidation";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

const inter = Inter({
	subsets: ["latin", "cyrillic"],
	variable: "--font-ui",
	display: "swap",
});

const syne = Syne({
	subsets: ["latin"],
	variable: "--font-syne",
	display: "swap",
	weight: ["400", "600", "700", "800"],
});

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-dm",
	display: "swap",
	weight: ["300", "400", "500", "600", "700"],
});

// Iteration 4 — brand Georgian type. 'Noto Sans Georgian' was referenced in the font stacks but never
// LOADED (no @font-face), so ka glyphs fell back to an OS font. Loading it via next/font gives clean,
// uniform brand typography for the primary audience. display:'swap' + the metric-compatible fallback that
// next/font auto-inserts keep layout metrics stable (no CLS / truncation shift). Latin/Cyrillic still
// render in DM Sans / Inter — the browser only reaches this family for Georgian glyphs (per-char fallthrough).
const notoGeorgian = Noto_Sans_Georgian({
	subsets: ["georgian"],
	variable: "--font-georgian",
	display: "swap",
	weight: ["400", "500", "600", "700"],
});

// "Geist" requested by the user; this Next.js version doesn't expose Geist
// via next/font/google. Inter is visually equivalent (Geist is a fork of
// Inter's geometry) and is already loaded above. We alias it as --font-geist
// so app code can reference it consistently.

const metadataBaseUrl = (
	process.env.NEXT_PUBLIC_BASE_URL ||
	process.env.BASE_URL ||
	process.env.NEXT_PUBLIC_SITE_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"https://myavatar.ge"
).replace(/\/+$/, ""); // strip trailing slash(es) — MUST stay byte-identical to lib/seo/site.ts SITE_URL so
// the layout's JSON-LD @ids (#organization/#website/…) match the @id references page schemas emit off SITE_URL.


export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	// PHASE 39 (Master Contract V13) — product-owner directive: lock layout zoom on text focus.
	// NOTE on mechanism: the ACTUAL iOS focus-auto-zoom fix is the `input{font-size:max(16px,1em)}`
	// rule in globals.css (iOS Safari ignores maximum-scale/user-scalable for accessibility). These
	// two are set per the directive and take effect on Android/other engines; iOS keeps pinch-zoom
	// (WCAG 1.4.4) while the 16px rule stops the layout-breaking focus zoom everywhere.
	maximumScale: 1,
	userScalable: false,
	viewportFit: 'cover',
	interactiveWidget: 'resizes-content',
	themeColor: '#000000',
};

export const metadata: Metadata = {
	metadataBase: new URL(metadataBaseUrl),
	applicationName: 'MyAvatar',
	// Next.js dynamic manifest at app/manifest.ts is served at /manifest.webmanifest.
	manifest: '/manifest.webmanifest',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'MyAvatar',
	},
	formatDetection: {
		telephone: false,
	},
	icons: {
		icon: '/icons/favicon.ico',
		shortcut: '/icons/favicon.ico',
		apple: '/apple-touch-icon.png',
	},
	other: {
		'mobile-web-app-capable': 'yes',
		'apple-mobile-web-app-capable': 'yes',
		'apple-mobile-web-app-status-bar-style': 'black-translucent',
	},
	// Plain string (no `template`) on purpose: the real pages live under the
	// `[locale]` layout, which owns the "%s - Avatar G" template for its child
	// routes. A template HERE would also wrap the locale layout's own default,
	// producing the doubled "<brand> - AI მედია პლატფორმა - Avatar G" seen live.
	title: "MyAvatar - AI მედია პლატფორმა",
	description: "შექმენი ავატარები, ვიდეო, სურათები და მუსიკა AI-ით",
	keywords: ["AI", "ავატარი", "ვიდეო გენერაცია", "სურათის გენერაცია", "მუსიკის გენერაცია"],
	authors: [{ name: "MyAvatar Team" }],
	openGraph: {
		type: "website",
		locale: "ka_GE",
		url: metadataBaseUrl,
		siteName: "MyAvatar",
		images: [{
			url: "/og-image.png",
			width: 1200,
			height: 630,
			alt: "MyAvatar — Georgian AI Studio, one window"
		}]
	},
	twitter: {
		card: "summary_large_image",
		title: "MyAvatar — AI Chat",
		description: "Georgian AI creative studio — chat, image, video, music, voice, avatar, interior, app builder in one window.",
		images: ["/og-image.png"]
	},
	robots: {
		index: true,
		follow: true
	},
	creator: "MyAvatar",
	publisher: "MyAvatar",
	category: "technology"
};

/**
 * SEO structured data (schema.org JSON-LD), server-rendered into <head>.
 * Three linked nodes via @graph:
 *   • Organization — the brand/publisher (logo + name) so Google can attach a
 *     knowledge panel and pick the right logo for rich results.
 *   • WebSite — the site identity + the three supported UI languages.
 *   • WebApplication — what the product actually is (a multimedia AI studio),
 *     its real feature list, supported platforms, and "free to start" offer.
 * Everything here is FACTUAL — no invented aggregateRating, review counts, or
 * social profiles (fabricated structured data risks a manual penalty). Purely
 * additive: no client JS, no layout cost. Strings stay English for the schema
 * vocabulary; the human-facing UI remains fully localized elsewhere.
 */
const SITE_DESCRIPTION_EN =
	"Georgian AI creative studio — chat, image, video, music, voice, avatar, interior design and an app builder in one window.";

const structuredData = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": `${metadataBaseUrl}/#organization`,
			name: "MyAvatar",
			alternateName: "MyAvatar.ge",
			url: metadataBaseUrl,
			// Enriched (Iteration 5) with FACTUAL fields only — the real support address (from the
			// /support + /contact pages) and country. No telephone / street address / social profiles
			// are invented (none exist in the repo); add them here when the owner supplies real values.
			email: "support@myavatar.ge",
			address: { "@type": "PostalAddress", addressCountry: "GE" },
			areaServed: [{ "@type": "Country", name: "Georgia" }, "Worldwide"],
			contactPoint: {
				"@type": "ContactPoint",
				contactType: "customer support",
				email: "support@myavatar.ge",
				availableLanguage: ["ka", "en", "ru"]
			},
			logo: {
				"@type": "ImageObject",
				url: `${metadataBaseUrl}/icons/icon-512x512.png`,
				width: 512,
				height: 512
			}
		},
		{
			// LocalBusiness — MyAvatar is a Georgian company. Honest partial NAP: country only (no
			// verified street/phone yet). Weakly-eligible but harmless; complete it when the owner
			// provides a registered address + phone. priceRange spans the real $15–$299 tier band.
			"@type": "LocalBusiness",
			"@id": `${metadataBaseUrl}/#localbusiness`,
			name: "MyAvatar",
			image: `${metadataBaseUrl}/og-image.png`,
			url: metadataBaseUrl,
			email: "support@myavatar.ge",
			address: { "@type": "PostalAddress", addressCountry: "GE" },
			areaServed: { "@type": "Country", name: "Georgia" },
			priceRange: "$$",
			parentOrganization: { "@id": `${metadataBaseUrl}/#organization` }
		},
		{
			"@type": "WebSite",
			"@id": `${metadataBaseUrl}/#website`,
			url: metadataBaseUrl,
			name: "MyAvatar",
			description: SITE_DESCRIPTION_EN,
			inLanguage: ["ka", "en", "ru"],
			publisher: { "@id": `${metadataBaseUrl}/#organization` }
		},
		{
			"@type": "WebApplication",
			"@id": `${metadataBaseUrl}/#webapp`,
			name: "MyAvatar",
			url: metadataBaseUrl,
			description: SITE_DESCRIPTION_EN,
			applicationCategory: "MultimediaApplication",
			operatingSystem: "Web, iOS, Android",
			browserRequirements: "Requires JavaScript. Runs in any modern browser.",
			inLanguage: ["ka", "en", "ru"],
			image: `${metadataBaseUrl}/og-image.png`,
			featureList: [
				"AI chat assistant",
				"AI image generation",
				"AI video generation",
				"AI music generation",
				"Georgian AI voice synthesis",
				"AI avatar creation",
				"AI interior design",
				"30-second AI film studio"
			],
			offers: {
				"@type": "Offer",
				price: "0",
				priceCurrency: "GEL",
				description: "Free to start, pay-as-you-go credits."
			},
			publisher: { "@id": `${metadataBaseUrl}/#organization` }
		}
	]
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Static <html lang> default. Reading cookies()/headers() here would opt the ENTIRE app into
	// per-request (no-store) rendering — defeating the ISR caching this iteration enables. The precise
	// per-locale <lang> is applied client-side by HtmlLangSync in the [locale] layout, and crawlers get
	// the correct language via og:locale + hreflang (localized generateMetadata, Iteration 2).
	const documentLocale = 'ka';

	try {
		logStartupEnvValidation();
	} catch {
		// Never block runtime rendering because of env startup checks.
	}

	return (
		<html
			lang={documentLocale}
			data-theme="dark"
			suppressHydrationWarning
			className={`dark ${inter.variable} ${syne.variable} ${dmSans.variable} ${notoGeorgian.variable}`}
			style={{ ['--font-geist' as string]: 'var(--font-ui)' }}
		>
			<head>
				{/*
				  Anti-FOUC theme boot — runs before first paint so the persisted
				  light/dark choice is applied with zero flash. SSR renders the
				  dark palette (data-theme="dark"); this rewrites it synchronously
				  from localStorage before React hydrates (html has
				  suppressHydrationWarning, so the attribute swap is safe).
				*/}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem('myavatar-theme');if(t!=='light'&&t!=='dark'){t='dark';}var e=document.documentElement;e.setAttribute('data-theme',t);e.classList.toggle('dark',t==='dark');e.classList.toggle('light',t==='light');}catch(_){}})();`,
					}}
				/>
				{/*
				  schema.org JSON-LD (Organization + WebSite + WebApplication).
				  Server-rendered, factual, no client JS — makes the site eligible
				  for Google rich results / knowledge panel. See structuredData above.
				*/}
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
				/>
				{/*
				  Native iOS shell detection (Capacitor wrapper) — runs before
				  first paint so external-purchase CTAs never flash. Apple
				  Guideline 3.1.1: in-app digital purchases must use Apple IAP, so
				  inside the iOS shell we hide every Stripe/web purchase entry
				  (a global CSS rule hides [data-iap-external] under this attr).
				  In a normal browser the attribute is never set → Stripe stays.
				*/}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var ua=navigator.userAgent||'';var c=window.Capacitor;var ios=(c&&c.isNativePlatform&&c.isNativePlatform()&&c.getPlatform&&c.getPlatform()==='ios')||(/iPhone|iPad|iPod/i.test(ua)&&/MyAvatarApp/i.test(ua));if(ios){document.documentElement.setAttribute('data-native-ios','1');}}catch(_){}})();`,
					}}
				/>
			</head>
			<body className="font-sans antialiased">
				<PostHogProvider>
					<Providers>
						<AppShell>
							{children}
						</AppShell>
					</Providers>
				</PostHogProvider>
				{/* Vercel Analytics — zero-config page view tracking */}
				<Analytics />
				{/* Vercel Speed Insights — Core Web Vitals monitoring */}
				<SpeedInsights />
			</body>
		</html>
	);
}

