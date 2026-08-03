import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
