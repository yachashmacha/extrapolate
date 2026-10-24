import Link from "next/link";
import { ConnectCard } from "@/components/connect-card";
import { HomePreview } from "@/components/home-preview";
import { Mark } from "@/components/mark";
import { analyze } from "@/lib/analysis/engine";
import { sampleBook } from "@/lib/ingest/demo";

export default function HomePage() {
  const book = sampleBook("axiom");
  const analysis = analyze(book.trades, book.terminal);

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="wordmark" href="/">
          <Mark />
          extrapolate
        </Link>
        <span className="actions">
          <Link className="ghost" href="/desk?demo=1&terminal=axiom">Sample book</Link>
          <Link className="ghost" href="/portfolio?demo=1&terminal=axiom">Portfolio</Link>
        </span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Memecoin trading desk</p>
          <h1>See the trade you keep repeating.</h1>
          <p className="lede">
            Connect the Solana wallet your terminal trades from. Extrapolate rebuilds every closed memecoin round trip and lines the winners up against the losers: market cap, size, hold, hour, the narrative, and which KOLs were in the coin. Losing trades get specific suggestions. Portfolio keeps the daily PnL, and your rules stay blank until you write them.
          </p>
          <ul className="facts">
            <li><b>Wallet</b><span>Phantom, Solflare, Backpack, or the trading address pasted from the terminal header.</span></li>
            <li><b>Terminal</b><span>Axiom, Photon, BullX, GMGN, Padre, Bloom, Trojan, Banana Gun, Pump.fun, or the wallet itself.</span></li>
            <li><b>Reading</b><span>What the green trades shared. What the red trades shared. The practice that follows from the difference.</span></li>
          </ul>
        </div>
        <ConnectCard />
      </section>
      <HomePreview analysis={analysis} />
      <footer className="footer">
        <span>Extrapolate mirrors your own fills. It is not a signal service.</span>
        <span>Your rules stay empty until you write them.</span>
      </footer>
    </main>
  );
}
