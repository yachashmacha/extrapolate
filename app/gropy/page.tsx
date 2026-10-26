import type { Metadata } from "next";
import { GropyBoard } from "@/components/gropy/board";
import { loadKolRecords } from "@/lib/gropy/chain";
import { runCopyBook } from "@/lib/gropy/engine";
import { TRACKED_KOLS } from "@/lib/kols";
import { gropyName } from "@/lib/gropy/names";
import { loadBotWallet, readSolBalance } from "@/lib/gropy/wallet";
import { buildGropyView } from "@/lib/gropy/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gropy Trade — extrapolate",
  description: "Gropy Trade, a grokbot copy trader. Fund the bot wallet with SOL. It follows a profitable KOL and fires them on the third loss.",
};

export default async function GropyPage() {
  const bot = loadBotWallet();
  const [balanceSol, records] = await Promise.all([readSolBalance(bot.publicKey), loadKolRecords()]);
  const book = runCopyBook(records.closed, records.buys);
  const view = buildGropyView({
    catalogSize: TRACKED_KOLS.length,
    closed: records.closed,
    book,
    nameOf: gropyName,
    botAddress: bot.publicKey,
    balanceSol,
    readCount: records.readWallets.length,
    skippedWallets: records.skippedWallets,
    unreadableCount: records.unreadable,
  });
  return <GropyBoard view={view} />;
}
