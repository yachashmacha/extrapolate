import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { DailyReportTab } from "@/components/daily-report-tab";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
  fallback: ["Source Sans 3", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Extrapolate — memecoin trading desk",
  description:
    "Connect a Solana wallet, reconstruct every memecoin round trip, and see what the winners shared that the losers did not.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body>
        <DailyReportTab />
        {children}
      </body>
    </html>
  );
}
