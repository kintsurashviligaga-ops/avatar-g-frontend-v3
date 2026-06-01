import type { Metadata, Viewport } from "next";
import { cookies } from 'next/headers';
import { Inter, Syne, DM_Sans } from "next/font/google";
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

// "Geist" requested by the user; this Next.js version doesn't expose Geist
// via next/font/google. Inter is visually equivalent (Geist is a fork of
// Inter's geometry) and is already loaded above. We alias it as --font-geist
// so app code can reference it consistently.

const metadataBaseUrl =
	process.env.NEXT_PUBLIC_BASE_URL ||
	process.env.BASE_URL ||
	process.env.NEXT_PUBLIC_SITE_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"https://myavatar.ge";

const SUPPORTED_LOCALES = new Set(['ka', 'en', 'ru']);

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
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
	title: {
		default: "Avatar G - AI მედია პლატფორმა",
		template: "%s - Avatar G"
	},
	description: "შექმენი ავატარები, ვიდეო, სურათები და მუსიკა AI-ით",
	keywords: ["AI", "ავატარი", "ვიდეო გენერაცია", "სურათის გენერაცია", "მუსიკის გენერაცია"],
	authors: [{ name: "Avatar G Team" }],
	openGraph: {
		type: "website",
		locale: "ka_GE",
		url: metadataBaseUrl,
		siteName: "MyAvatar",
		images: [{
			url: "/og-image.png",
			width: 1200,
			height: 630,
			alt: "MyAvatar.ge — Georgian AI Studio, one window"
		}]
	},
	twitter: {
		card: "summary_large_image",
		title: "MyAvatar.ge — AI Chat",
		description: "Georgian AI creative studio — chat, image, video, music, voice, avatar, interior, app builder in one window.",
		images: ["/og-image.png"]
	},
	robots: {
		index: true,
		follow: true
	}
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const localeCookie = cookies().get('NEXT_LOCALE')?.value;
	const documentLocale = localeCookie && SUPPORTED_LOCALES.has(localeCookie) ? localeCookie : 'ka';

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
			className={`dark ${inter.variable} ${syne.variable} ${dmSans.variable}`}
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

