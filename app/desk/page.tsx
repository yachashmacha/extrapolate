import { Suspense } from "react";
import { Desk } from "@/components/desk";

export default function DeskPage() {
  return (
    <Suspense fallback={<main className="shell"><p className="loading">Opening the desk…</p></main>}>
      <Desk />
    </Suspense>
  );
}
