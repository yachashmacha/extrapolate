import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/mark";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Docs — extrapolate",
  description:
    "Extrapolate aggregates trading data for a daily and weekly analysis of closed trades, the commonalities of winners and losers, and a monitor of trading behavior through the day.",
};

export default function DocsPage() {
  return (
    <main className="shell docs-page">
      <header className="topbar">
        <Link className="wordmark" href="/">
          <Mark />
          extrapolate
        </Link>
        <SiteNav look="ghost" current="docs" />
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Docs</p>
          <h1>A daily and weekly read of your trades.</h1>
        </div>
      </section>

      <section className="section" aria-labelledby="thesis">
        <div className="section-head">
          <h2 id="thesis">Thesis</h2>
        </div>
        <div className="docs-copy">
          <p>
            Extrapolate is a trading data aggregation site. It gives traders a better and more informed analysis of their trades on a daily and weekly basis. It uses thorough and comprehensive metadata from every trade to compile those trades and sort them into winners and losers.
          </p>
          <p>
            It goes much deeper than that sort. It identifies the commonalities among the winners and among the losers, cross-checks that record with previous days and weeks, and gives an active monitor of trading mentality through the day, based on trading behavior.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="wallet">
        <div className="section-head">
          <h2 id="wallet">Connecting a wallet</h2>
        </div>
        <div className="docs-copy">
          <p>
            A book starts from a Solana wallet. On the <Link href="/">home page</Link>, Phantom, Solflare, and Backpack each hand over the address that extension already holds. You can also paste an address. It has to be a Solana address, 32 to 44 characters. Read this wallet opens the <Link href="/desk">desk</Link> for that address.
          </p>
          <p>
            The same card imports a CSV of closed trades. Use it when you already export your trades, or when a public RPC cannot see far enough back. The file needs a header row: symbol, name, mint, meta, entry time, exit time, entry market cap, size in dollars, PnL in dollars, liquidity, KOLs, and minutes from launch. Callers in that file are a name and a timing, separated by a bar. The desk then reads the file you uploaded.
          </p>
          <p>
            A trade here is a closed round trip. The buy and the sell are one row, and the day it belongs to is the America/New_York day of the exit. A coin that is still open has no exit, so it is left out of the daily count, the equity line, and the winner-loser split. The home page mirrors one wallet’s closes. Extrapolate is a read of that book. It is not a signal service.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="desk">
        <div className="section-head">
          <h2 id="desk">The desk</h2>
        </div>
        <div className="docs-copy">
          <p>
            The <Link href="/desk">desk</Link> rebuilds the closed trades and compares the winners with the losers for one day. It opens on today, labeled analysing: Today. The menu also lists earlier days in the current Eastern month, newest first. A day with no closes says so. Reread asks the wallet again.
          </p>
          <p>
            The reading for that day leads with the net, the win rate, the profit factor, the result per trade, and the median hold. The split puts winners beside losers and uses medians, so one huge loss cannot stand in for the typical red trade. The rows are net, entry market cap, size, hold, KOLs per trade, the usual narrative, the usual time of day, the names that show up, liquidity now, and, when the book has it, how long after the pool opened the buy was.
          </p>
          <p>
            Closed equity is the running PnL after each closed trade. Open coins stay off that line. What they shared is a pattern that covers the winners and skips the losers, or the other way around. The gap has to be at least 18 points, across at least four trades. Where it goes wrong and Where it goes right turn that same comparison into cards: entry, size, KOLs, narrative, and time of day. Each card names the trades it came from. Fewer than eight closed trades is too thin for those cards, and the page waits.
          </p>
          <p>
            Above the reading, the habit feed is the monitor of the day. Its heading is Your biases from YOUR subconscious. A bias is named only when the trades match that measurement. A repeat is the order of the trades, with no motive attached. A tendency is a pattern that made money. Biases sit on the left. Tendencies that paid sit on the right. The measurements include sizing up within half an hour of a red close, sizing up after a win, chasing a coin that has already moved, holding losers longer than winners, averaging down, buying long after the pool opened, and buying the higher caps, or buying above a market-cap rule when one of your rules draws that line. The paid side is the counterpart when the closes support it: size held flat after a loss, a buy well under the high, a green trade that was allowed to work, one ticket in a coin, a buy while the pool was still young. Click a card and the tape scrolls to just those trades.
          </p>
          <p>
            The tape is that day’s closes. Filter it to winners or losers, or open one trade to see how it sits against the winners. Callers show up by name. Tracked wallets are checked for a buy of the same coin. Before and with you count as already in. After does not. You can add a name from a trade when the scan missed someone. The narrative is guessed from the coin’s name: Animals, Politics, Celebrity, AI, Food, Internet culture, Country, or Unsorted. Retag a trade when the guess is wrong. Under the cards, Who was in the coin and The meta the coin belonged to list trades, win rate, and net, with timing for a KOL and the median entry for a narrative.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="portfolio">
        <div className="section-head">
          <h2 id="portfolio">Portfolio</h2>
        </div>
        <div className="docs-copy">
          <p>
            <Link href="/portfolio">Portfolio</Link> keeps the same book and reads it across the month. The end of day report sits at the top. It scores the latest closed day, or the day you pick, as a rationality percent. One hundred percent is a day the trades did not repeat the costly patterns, no active rule was broken, and the close was not negative. A red day cannot be one hundred percent. The score reads that day’s behavior. It is not a prediction. Beside the percent are the day’s PnL, a short read of what happened, and the best and worst fills, each with its size and a narrative score from 1 to 10. From 7:00 p.m. Eastern until midnight, a daily report tab stays on the screen and links back to that report.
          </p>
          <p>
            The calendar under the report is daily PnL. A month shows its net, its green days, and its red days. Previous and next move the month. Pick a day and the trade list narrows to that day’s closes. Pick it again and the month comes back.
          </p>
          <p>
            Recent trades lists the newest close first: the market cap bought, the size, the result, the name of each KOL in that coin, and the narrative score. Tips sits beside it, one note for each losing trade. The size a tip names comes from the dollars in the wallet when that balance is known, and otherwise from the winning trades. Active rules are part of that size. A caller in the coin leaves the size where it is.
          </p>
          <p>
            From the losers compares the red trades with the green ones across the whole book, not only today. Those cards wait for eight closed trades. Under them the list is split on purpose: winners on one side, losers on the other. You can show this month, every trade in the book, one day, the trades behind a suggestion, or a single coin.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="rules">
        <div className="section-head">
          <h2 id="rules">Rules</h2>
        </div>
        <div className="docs-copy">
          <p>
            Your rules live on Portfolio. Three start on. You can turn one off, edit the wording, add a rule you trade with, or remove one. A base rule you remove stays removed for that book.
          </p>
          <ul>
            <li>Exit the position if the chart goes below 50% of your position.</li>
            <li>Trade with no more than 10 percent of your portfolio for your base trade.</li>
            <li>Don’t make more than 50 trades a day.</li>
          </ul>
          <p>
            The desk, the ticket a habit names, and the end-of-day score all read the rules that are still on. A close that breaks one carries that note on the trade. The exit rule treats a price at or under half the entry as a missed stop, unless the text names a different percent. The size rule caps the base ticket at a tenth of the portfolio, unless the text says otherwise. The pace rule counts closed round trips whose exit falls on one Eastern day. An open coin is outside that count.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="news">
        <div className="section-head">
          <h2 id="news">News</h2>
        </div>
        <div className="docs-copy">
          <p>
            <Link href="/news">News</Link> is a read of what is being said and what is being promoted. A headline does not add a bias. Biases are still read from the closes on the desk, and none of this page is a signal.
          </p>
          <p>
            Headlines come from CoinDesk, Cointelegraph, Decrypt, The Block, DL News, Blockworks, Unchained, Bankless, and The Defiant. They sort into Memecoins, Solana, Markets, Rules and policy, and Strategies. A headline with no closer match goes under Markets, and one headline can match more than one filter. On the full page, stories that name a way of trading or a trend are pulled out under What the headlines named. That block is the outlet’s piece. It is not a rule for this desk.
          </p>
          <p>
            Getting attention is the Solana pairs DexScreener is boosting. A boost is paid placement. It shows what is being promoted. Each card has the market cap, the volume, the day change, and the project’s own text. Across the top of the page, a tape marked 7d shows which of the week’s top ten are up. Those ten are the largest coins with the strongest move over the last seven days. Stablecoins are left off the board.
          </p>
          <p>
            Posts the coins linked are X posts, and only some of them. A post appears when one of those boosted coins links it, the text can be read back from X, and that text is about a coin or the market. If a coin did not link a post, X did not return it, or the text is about something else, it is left off.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="gropy">
        <div className="section-head">
          <h2 id="gropy">Gropy Trade</h2>
        </div>
        <div className="docs-copy">
          <p>
            <Link href="/gropy">Gropy Trade</Link> is the grokbot copy desk. It reads a catalog of KOL wallets from their own swaps and scores verified closes. A wallet is eligible when those closes are profitable. Copying now is the KOL in the seat. The stop rule is the third losing trade while they are being copied: two losses stay, and the loss past that stops the copy. The next wallet has to be a different KOL whose verified result is better. If nobody is ahead, the seat stays empty. Stopped copying is the log of those changes. Wallets with no verified close, and wallets that could not be read, are listed under Not scored and are left uncopied. A buy with no coin name on the swap is skipped.
          </p>
          <p>
            Bot PnL charts the running result of that book. The wallet card is the bot wallet, or a wallet you connect with Phantom, Solflare, or Backpack. Load it with SOL, or connect yours, and a copy is sized from that balance. The copies table names the trader, the coin, the size, and when it was bought. The status on that table is Not sent. This page does not send a swap. With no SOL to spend, or with a balance that cannot be read, the page says no copy was sent.
          </p>
          <p>
            Instructions for your grok bot are saved on the page. Hard rules override that prompt, and a switch with no positive number stays off. The four numbered rules are a hard stop a given percent below entry, a take profit a given percent above entry, a maximum SOL per copy, and a daily loss in SOL after which copying stops for the day. You can write further lines and turn them on or off. Reasoning, beside the book, says why the bot left one wallet for another. Each note uses the closes from the time that wallet was copied, and the instructions saved on the page.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="catalogue">
        <div className="section-head">
          <h2 id="catalogue">Catalogue of Doom</h2>
        </div>
        <div className="docs-copy">
          <p>
            <Link href="/catalogue">Catalogue of Doom</Link> is the list of logical fallacies and cognitive biases that show up around a trading book, and why each one feels reasonable while you are in it. A fallacy is a broken argument. A bias is a bent habit of mind. The page keeps sixteen, eight of each. The note under every name is why it happens.
          </p>
          <p>
            The fallacies are post hoc ergo propter hoc, the gambler’s fallacy, the hot-hand fallacy, affirming the consequent, appeal to authority, the Texas sharpshooter, the sunk cost fallacy, and hasty generalization. The biases are confirmation bias, the disposition effect, anchoring, fear of missing out, recency bias, survivorship bias, outcome bias, and herding.
          </p>
          <p>
            The desk names a bias when the closes match a measurement. The catalogue is the longer account of why the mistake is easy to make, written so you can read it before the next ticket. The two pages stay separate: one scores a day, the other explains the habit.
          </p>
        </div>
      </section>
    </main>
  );
}
