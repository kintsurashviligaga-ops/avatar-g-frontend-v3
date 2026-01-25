// app/layout.tsx
import "./globals.css";
import { Orbitron, Inter } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "Avatar G",
  description: "AI Workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${orbitron.variable} ${inter.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
