import { Suspense } from "react";
import { Portfolio } from "@/components/portfolio";

export default function PortfolioPage() {
  return (
    <Suspense fallback={<main className="shell"><p className="loading">Opening the portfolio…</p></main>}>
      <Portfolio />
    </Suspense>
  );
}
