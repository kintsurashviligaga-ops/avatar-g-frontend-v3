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
	icons: {
		icon: '/brand/logo.png',
		shortcut: '/brand/logo.png',
		apple: '/brand/logo.png',
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
			url: "/brand/logo.png",
			width: 1200,
			height: 630,
			alt: "Avatar G - AI მედია პლატფორმა"
		}]
	},
	twitter: {
		card: "summary_large_image",
		title: "Avatar G - AI მედია პლატფორმა",
		description: "AI მედიის შექმნა Avatar G-სთან ერთად",
		images: ["/brand/logo.png"]
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
		<html lang="ka" className="dark">
			<body className="font-sans bg-[#020008] text-white antialiased">
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

