"use client";

import Link from "next/link";
import { Mark } from "@/components/mark";

export function BookBar({
  page,
  title,
  note,
  search,
  onReread,
}: {
  page: "desk" | "portfolio";
  title: string;
  note: string;
  search: string;
  onReread: (() => void) | null;
}) {
  return (
    <header className="desk-bar">
      <div className="bar-start">
        <Link className="wordmark" href="/">
          <Mark />
          extrapolate
        </Link>
        <nav className="page-switch" aria-label="Book pages">
          <Link href={`/desk${search}`} aria-current={page === "desk" ? "page" : undefined}>
            Desk
          </Link>
          <Link href={`/portfolio${search}`} aria-current={page === "portfolio" ? "page" : undefined}>
            Portfolio
          </Link>
          <Link href="/gropy">gropy</Link>
        </nav>
      </div>
      <div className="who">
        <strong>{title}</strong>
        <div className="note">
          {note}
          {onReread ? (
            <>
              {" · "}
              <button type="button" className="texty" onClick={onReread}>
                Reread
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
