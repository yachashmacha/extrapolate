import type { Metadata } from "next";
import { GropyBoard } from "@/components/gropy/board";
import { runCopyBook } from "@/lib/gropy/engine";
import { gropyName } from "@/lib/gropy/names";
import { loadGropySource } from "@/lib/gropy/source";
import { buildGropyView } from "@/lib/gropy/view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "gropy — extrapolate",
  description: "Grokbot paper copy book. It follows a profitable KOL wallet and fires them on the third losing trade.",
};

export default function GropyPage() {
  const source = loadGropySource();
  const book = runCopyBook(source.closed, source.buys);
  const view = buildGropyView({
    catalogSize: source.catalogSize,
    closed: source.closed,
    buyOnlyWallets: source.buyOnlyWallets,
    book,
    nameOf: gropyName,
  });
  return <GropyBoard view={view} />;
}
