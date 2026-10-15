import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NGFunded — NextGen Prop Trading",
    template: "%s | NGFunded",
  },
  description:
    "Elite proprietary trading evaluation platform. Pass the challenge, get funded, keep up to 90% of profits.",
  keywords: ["prop trading", "funded trader", "trading challenge", "forex", "crypto"],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-text-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
