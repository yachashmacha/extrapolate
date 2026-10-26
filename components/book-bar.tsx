"use client";

import Link from "next/link";
import { Mark } from "@/components/mark";
import { SiteNav } from "@/components/site-nav";

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
        <SiteNav current={page} search={search} />
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
