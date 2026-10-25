import Link from "next/link";
import { Suspense } from "react";
import { ConnectCard } from "@/components/connect-card";
import { HomePreview } from "@/components/home-preview";
import { Mark } from "@/components/mark";
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
        <span className="actions">
          <Link className="ghost" href={`/desk${search}`}>Desk</Link>
          <Link className="ghost" href={`/portfolio${search}`}>Portfolio</Link>
        </span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Memecoin trading desk</p>
          <h1>See the trade you keep repeating.</h1>
          <p className="lede">
            Extrapolate reads {shortAddress(TRADER_WALLET)} and rebuilds every closed memecoin round trip. It lines the winners up against the losers: market cap, size, hold, hour, the narrative, and which KOLs were in the coin. Losing trades get specific suggestions. Portfolio keeps the daily PnL, and your rules stay blank until you write them.
          </p>
          <ul className="facts">
            <li><b>Wallet</b><span>{TRADER_WALLET}</span></li>
            <li><b>Reading</b><span>What the green trades shared. What the red trades shared. The practice that follows from the difference.</span></li>
          </ul>
        </div>
        <ConnectCard />
      </section>
      <Suspense fallback={<p className="loading">Reading the wallet and rebuilding the closed trades.</p>}>
        <LiveHome />
      </Suspense>
      <footer className="footer">
        <span>Extrapolate mirrors this wallet’s fills. It is not a signal service.</span>
        <span>Your rules stay empty until you write them.</span>
      </footer>
    </main>
  );
}

async function LiveHome() {
  try {
    const book = await fetchWalletBook(TRADER_WALLET, TRADER_TERMINAL, Number(TRADER_DEPTH));
    const analysis = analyze(book.trades, book.terminal);
    const bounds = bookBounds({ trades: book.trades, accountUsd: book.accountUsd ?? null });
    const cash = book.accountUsd ? ` About ${fmtUsdPlain(book.accountUsd)} is in the wallet, and a tip sizes from that.` : "";
    return (
      <HomePreview
        analysis={analysis}
        kicker={shortAddress(TRADER_WALLET)}
        detail={`${analysis.summary.trades} closed fills from this wallet, ${analysis.summary.spanLabel}. Entry market cap is the fill price times the supply now.${cash}`}
        ticketUsd={bounds.ticketUsd}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The wallet could not be read.";
    return <p className="error">{message}</p>;
  }
}
