import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/mark";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Catalogue of Doom — extrapolate",
  description:
    "The logical fallacies and cognitive biases that show up in a trading book, and why traders fall into each one.",
};

type Entry = {
  kind: "Fallacy" | "Bias";
  name: string;
  why: string;
};

const FALLACIES: Entry[] = [
  {
    kind: "Fallacy",
    name: "Post hoc ergo propter hoc",
    why: "You bought, then it ran, so the buy gets credit for the run. A KOL posted and the chart moved in the same minute, so the post becomes the cause. Order is the only evidence you had while it was happening, and a cause is something you can try to repeat tomorrow. The pairs that lined up stick. The posts that did nothing, and the coins that ran with no post at all, fall out of the story. What is left feels like a mechanism. It is a sequence with the misses edited out.",
  },
  {
    kind: "Fallacy",
    name: "Gambler's fallacy",
    why: "After four red closes the next ticket feels owed a green one, as if the market kept a ledger and is about to correct it. People learn chance from decks and dice, where what has already come up really does change what is left, then carry that correction into a stream of coins that does not remember the last fill. A losing streak changes your pulse and your size. It does not store up a win. The next trade can be a bad setup whether you are due or not. Due is the part you invented.",
  },
  {
    kind: "Fallacy",
    name: "Hot-hand fallacy",
    why: "Three winners and the fourth ticket gets sized like the edge just improved. A short run is what variance looks like in a small sample, and the run is the sample you are using to judge the run. It happens because the wins are vivid and recent, and because a desk wants permission to press. Skill can show up over a long book. It does not arrive because the last three memecoins went green. Those coins were mostly separate events. Treating the streak as a hotter hand confuses a mood with a change in the odds.",
  },
  {
    kind: "Fallacy",
    name: "Affirming the consequent",
    why: "Winners, as you remember them, bought early and small, so buying early and small becomes the thing that makes a winner. You start from the trades you want to repeat, walk backward to a trait they share, and treat the trait as sufficient. If a winner had a small entry, it does not follow that a small entry will be a winner. The losers who also bought the low are missing from that memory, and early is exactly how a rug gets filled. The consequent you liked does not prove the rule you are about to trade.",
  },
  {
    kind: "Fallacy",
    name: "Appeal to authority",
    why: "A wallet with a green month, or a voice the timeline already trusts, gets treated as the evidence about this coin. Checking a mint is slow. Copying a name is one click, and status is easier to see than expected value. A real record can still say nothing about the coin they just touched, especially when you only see the calls they left up. Expertise is a reason to look. The fallacy is skipping the coin and letting the name finish the argument.",
  },
  {
    kind: "Fallacy",
    name: "Texas sharpshooter",
    why: "You fire a week of trades, then paint the target around the cluster that paid: under some market cap, held under a few minutes, only after one account posted. A finished book will always offer a cut that separates green from red if you are allowed to choose the cut afterward. The rule feels discovered. It was fitted to the shots already on the wall. Next week the cluster sits somewhere else, and the rule you trusted was the paint.",
  },
  {
    kind: "Fallacy",
    name: "Sunk cost fallacy",
    why: "The bag is down hard, and the money already in it argues for staying. Selling would make the loss official, so the open red number still feels reversible, and the time and fees already spent feel like assets you can get back by holding. They are not in the position. Staying is reasonable when the thesis is still intact at this price. It is the fallacy when the reason you stay is what you have already spent. The live question is whether you would buy it here with a flat book.",
  },
  {
    kind: "Fallacy",
    name: "Hasty generalization",
    why: "Two rugs from a narrative and the narrative is dead. Two winners off one launchpad and the launchpad is the edge. You have to act before the sample is large, and a vivid pair feels like a pattern rather than a pair. The base rate of these coins is ugly. Two points do not move it. A hypothesis from two trades is allowed. Certainty from two trades is the leap, and you take it because a rule is something you can use at the open tomorrow.",
  },
];

const BIASES: Entry[] = [
  {
    kind: "Bias",
    name: "Confirmation bias",
    why: "You wanted the coin before you finished reading. After that, replies that agree count as research and replies that do not count as noise, fud, or jealousy. The position, or the wish to have one, becomes the hypothesis, and new information gets sorted by whether it protects that hypothesis. You are not weighing the mint. You are collecting cover for a lean you already took, often before the first buy filled. Disconfirming evidence had to be louder than confirming evidence just to get read at all.",
  },
  {
    kind: "Bias",
    name: "Disposition effect",
    why: "Winners get cut so the green can be locked. Losers get held so the red does not have to be booked. A realized loss hurts more than an equal gain pleases, and an open red bag still feels like a story that can turn. The pain sits in the click that would make the loss real, so that click waits, while the click that seals a gain gets rushed. The book then fills with small winners and large losers. That shape looks like bad luck. It is the bias repeating.",
  },
  {
    kind: "Bias",
    name: "Anchoring",
    why: "The first number you took seriously becomes the number every later price is judged against. Often that number is your entry, so selling under it feels like admitting the trade was wrong even after the tape has moved on. Or it is the high everyone screenshotted, and every print below it looks like a discount. The fill and the wick were events, not valuations. They stick because they arrived first and because they are yours, and a fresh price has to fight that anchor before you can see it as the price.",
  },
  {
    kind: "Bias",
    name: "Fear of missing out",
    why: "The coin is already up, and being flat feels like a loss you can still undo by paying up. Regret arrives faster than a calm read of what is left in the move. The part you watched is concrete. The part still ahead is not, so you buy the part that already happened. This is anticipated regret, not a sense for runners: the pain of sitting out a winner gets weighed as if it were money already gone. The urgency is the tell. A setup you actually like survives a minute. This feeling does not want to give you that minute.",
  },
  {
    kind: "Bias",
    name: "Recency bias",
    why: "The last few trades write the rules for the next one. A morning of fast winners makes an ordinary afternoon feel broken, so you force tickets that are not there. Memory weights whatever just happened, and a desk manufactures fresh, emotional samples all day. Last week's meta becomes this week's rule because it was last, not because the older book agrees. The base rate is still in the history. It loses the argument because it is harder to feel than the last three closes.",
  },
  {
    kind: "Bias",
    name: "Survivorship bias",
    why: "The timeline is a display of accounts that are still posting. You study the wallet that turned a small stack into a house and never see the same process in the accounts that went to zero and went quiet. Failures leave the sample. They stop posting, the bad calls get deleted, and a blown wallet is not on the leaderboard. The catalogue of winners is the catalogue of who is still here. Copying the visible path copies the path, not the odds of arriving by it.",
  },
  {
    kind: "Bias",
    name: "Outcome bias",
    why: "A sloppy entry that printed green gets promoted to a strategy. A clean entry that printed red gets thrown out of the playbook. The day hands you PnL as the score, and a green close feels like it approves every step that came before it. You cannot see the process once the result is in, so you learn to repeat whatever paid, including the luck, and to abandon a sound decision on a day the variance ran the other way. The decision had to be judged with what you knew at the click. The close is not that information.",
  },
  {
    kind: "Bias",
    name: "Herding",
    why: "The chat is in, and standing aside feels like fading a winner where everyone can see you. Social proof is fast, a private doubt is slow, and being wrong alone hurts more than being wrong in a crowd. Often the crowd is itself a copy of an earlier copy, so the tape looks like information and is a queue. Your own read is a feeling you can talk yourself out of. Their position is a number on the screen. The size then matches the room, not the setup.",
  },
];

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <div className="catalogue-list">
      {entries.map((entry) => (
        <article key={entry.name} className="panel catalogue-entry">
          <p className="kicker">{entry.kind}</p>
          <h3>{entry.name}</h3>
          <p className="label">Why it happens</p>
          <p>{entry.why}</p>
        </article>
      ))}
    </div>
  );
}

export default function CataloguePage() {
  return (
    <main className="shell">
      <header className="desk-bar">
        <div className="bar-start">
          <Link className="wordmark" href="/">
            <Mark />
            extrapolate
          </Link>
          <SiteNav current="catalogue" />
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Catalogue of Doom</p>
          <h1>The fallacies and the biases that take the trade.</h1>
          <p className="lede">
            A fallacy is a broken argument. A bias is a bent habit of mind. Traders run both, often in the same hour, and then blame the coin. Sixteen of the usual ones are below. Each note is why the mistake feels reasonable while you are making it.
          </p>
        </div>
      </section>
      <section className="section" aria-labelledby="fallacies">
        <div className="section-head">
          <div>
            <p className="kicker">Logical fallacies</p>
            <h2 id="fallacies">Arguments that do not hold.</h2>
          </div>
          <p>The chart, the streak, or a trusted name is asked to prove something it cannot prove. The shape of the argument is the problem, even when the coin later pays you for it.</p>
        </div>
        <EntryList entries={FALLACIES} />
      </section>
      <section className="section" aria-labelledby="biases">
        <div className="section-head">
          <div>
            <p className="kicker">Cognitive biases</p>
            <h2 id="biases">Habits that bend the read.</h2>
          </div>
          <p>These start before the argument. The book, the crowd, or the last ticket has already tilted what you are willing to see.</p>
        </div>
        <EntryList entries={BIASES} />
      </section>
    </main>
  );
}
