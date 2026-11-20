import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsBoard } from "@/components/news/board";
import { isNewsLane } from "@/lib/news/lanes";
import { loadNews } from "@/lib/news/load";
import { loadWeek } from "@/lib/news/week";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News — extrapolate",
  description: "Crypto and memecoin headlines, the Solana pairs DexScreener is boosting, and the X posts those coins link when the text is about the market.",
};

export default function NewsPage({ searchParams }: { searchParams: Promise<{ lane?: string }> }) {
  return (
    <Suspense fallback={<main className="shell"><p className="loading">Opening the news…</p></main>}>
      <NewsLive searchParams={searchParams} />
    </Suspense>
  );
}

async function NewsLive({ searchParams }: { searchParams: Promise<{ lane?: string }> }) {
  const { lane } = await searchParams;
  const [desk, week] = await Promise.all([loadNews(), loadWeek()]);
  return <NewsBoard desk={desk} lane={isNewsLane(lane) ? lane : "all"} week={week} />;
}
