import Link from "next/link";
import { Suspense } from "react";
import { ConnectCard } from "@/components/connect-card";
import { HomePreview } from "@/components/home-preview";
import { Mark } from "@/components/mark";
import { SiteNav } from "@/components/site-nav";
import { bookBounds } from "@/lib/analysis/bounds";
import { analyze } from "@/lib/analysis/engine";
import { fetchWalletBook } from "@/lib/ingest/live";
import { TRADER_DEPTH, TRADER_TERMINAL, TRADER_WALLET, traderSearch } from "@/lib/trader";
import { fmtUsdPlain, shortAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const search = traderSearch();
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          <Mark />
          extrapolate
        </Link>
        <SiteNav look="ghost" search={search} />
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Memecoin trading desk</p>
          <h1>See the trade you keep repeating.</h1>
          <p className="lede">
            Extrapolate reads {shortAddress(TRADER_WALLET)} and rebuilds every closed memecoin trade. It lines the winners up against the losers: market cap, size, hold, hour, the narrative, and which KOLs were in the coin. Portfolio keeps the daily PnL. Three rules start on: exit if price falls below half the position, keep the base trade to 10% of the portfolio at the time of the trade, and stop at 50 closed trades in a day.
          </p>
          <ul className="facts">
            <li><b>Wallet</b><span>{TRADER_WALLET}</span></li>
            <li><b>Reading</b><span>What the green trades shared. What the red trades shared.</span></li>
            <li><b>News</b><span>Headlines, the Solana pairs being boosted, and the X posts those coins link.</span></li>
          </ul>
        </div>
        <ConnectCard />
      </section>
      <Suspense fallback={<p className="loading">Reading the wallet and rebuilding the closed trades.</p>}>
        <LiveHome />
      </Suspense>
      <footer className="footer">
        <span>Extrapolate mirrors this wallet’s trades. It is not a signal service.</span>
        <span>Three base rules start on. Add your own, or turn those off.</span>
      </footer>
    </main>
  );
}

async function LiveHome() {
  try {
    const book = await fetchWalletBook(TRADER_WALLET, TRADER_TERMINAL, Number(TRADER_DEPTH));
    const analysis = analyze(book.trades, book.terminal);
    const bounds = bookBounds({ trades: book.trades, accountUsd: book.accountUsd ?? null, cashUsd: book.cashUsd ?? null });
    const cash = book.accountUsd ? ` About ${fmtUsdPlain(book.accountUsd)} is in the wallet, and a tip sizes from that.` : "";
    return (
      <HomePreview
        analysis={analysis}
        kicker={shortAddress(TRADER_WALLET)}
        detail={`${analysis.summary.trades} closed trades from this wallet, ${analysis.summary.spanLabel}. Entry market cap is the buy price times the supply now.${cash}`}
        ticketUsd={bounds.ticketUsd}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The wallet could not be read.";
    return <p className="error">{message}</p>;
  }
}
