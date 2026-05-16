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
	themeColor: '#0a0a0c',
};

export const metadata: Metadata = {
	metadataBase: new URL(metadataBaseUrl),
	applicationName: 'Avatar G',
	manifest: '/manifest.json',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Avatar G',
	},
	formatDetection: {
		telephone: false,
	},
	icons: {
		icon: '/icons/favicon.ico',
		shortcut: '/icons/favicon.ico',
		apple: '/icons/icon-180x180.png',
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
		siteName: "Avatar G",
		images: [{
			url: "/brand/logo-primary-transparent.png",
			width: 512,
			height: 512,
			alt: "Avatar G - AI მედია პლატფორმა"
		}]
	},
	twitter: {
		card: "summary_large_image",
		title: "Avatar G - AI მედია პლატფორმა",
		description: "AI მედიის შექმნა Avatar G-სთან ერთად",
		images: ["/brand/logo-primary-transparent.png"]
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
		<html lang={documentLocale} data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${syne.variable} ${dmSans.variable}`}>
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

