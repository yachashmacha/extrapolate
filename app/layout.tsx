import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { DailyReportTab } from "@/components/daily-report-tab";
import "./globals.css";

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Extrapolate — memecoin trading desk",
  description:
    "Connect a Solana wallet, reconstruct every memecoin round trip, and see what the winners shared that the losers did not.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <DailyReportTab />
        {children}
      </body>
    </html>
  );
}
