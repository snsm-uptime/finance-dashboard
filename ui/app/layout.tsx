import type { Metadata } from "next";
import { Manrope, Petrona } from "next/font/google";

import { AppShell } from "@/components/AppShell";
import {
  PreferencesProvider,
  themeBootScript,
} from "@/components/PreferencesProvider";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const petrona = Petrona({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "finance-helper",
  description: "Self-hosted shared finance helper",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${petrona.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <PreferencesProvider>
          <AppShell>{children}</AppShell>
        </PreferencesProvider>
      </body>
    </html>
  );
}
