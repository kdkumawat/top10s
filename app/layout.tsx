import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "top10s.lol — 100 spots. Beat the bid. Take the spot.",
    template: "%s · top10s.lol",
  },
  description:
    "A live, competitive ranking board. 100 positions, $1 starting bid. Pay more to take the spot.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    siteName: "top10s.lol",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0b0712",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark" suppressHydrationWarning>
        <body className={cn("min-h-dvh bg-bg text-fg antialiased")}>
          <a href="#board" className="skip-link">
            Skip to board
          </a>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
