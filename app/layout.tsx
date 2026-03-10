import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/app/providers";
import GlobalChatbot from "@/components/GlobalChatbot";
import { AppShell } from "@/components/AppShell";
import { logStartupEnvValidation } from "@/lib/env/startupValidation";

const metadataBaseUrl =
	process.env.NEXT_PUBLIC_BASE_URL ||
	process.env.BASE_URL ||
	process.env.NEXT_PUBLIC_SITE_URL ||
	process.env.NEXT_PUBLIC_APP_URL ||
	"https://myavatar.ge";

export const metadata: Metadata = {
	metadataBase: new URL(metadataBaseUrl),
	manifest: '/manifest.json',
	icons: {
		icon: '/icons/favicon.ico',
		shortcut: '/icons/favicon.ico',
		apple: '/icons/icon-180x180.png',
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
	try {
		logStartupEnvValidation();
	} catch {
		// Never block runtime rendering because of env startup checks.
	}

	return (
		<html lang="ka" data-theme="dark" suppressHydrationWarning>
			<body className="font-sans antialiased">
				<Providers>
					<AppShell>
						{children}
						<GlobalChatbot />
					</AppShell>
				</Providers>
			</body>
		</html>
	);
}

