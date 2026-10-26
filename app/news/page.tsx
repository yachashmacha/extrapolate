import type { Metadata } from "next";
import { NewsBoard } from "@/components/news/board";
import { isNewsLane } from "@/lib/news/lanes";
import { loadNews } from "@/lib/news/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News — extrapolate",
  description: "Crypto and memecoin headlines, the Solana pairs DexScreener is boosting, and the X posts those coins link when the text is about the market.",
};

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ lane?: string }> }) {
  const { lane } = await searchParams;
  const desk = await loadNews();
  return <NewsBoard desk={desk} lane={isNewsLane(lane) ? lane : "all"} />;
}
