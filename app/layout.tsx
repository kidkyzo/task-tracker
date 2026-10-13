import type { Metadata } from "next";
import { headers } from "next/headers";
import { themeBootstrap } from "./ui/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Task Board",
  description: "A local live view of work reported by your agents.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
