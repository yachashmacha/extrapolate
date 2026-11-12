import Link from "next/link";

export function SiteNav({
  current,
  search = "",
  look = "switch",
}: {
  current?: "desk" | "portfolio" | "gropy" | "news" | "docs" | "catalogue";
  search?: string;
  look?: "switch" | "ghost";
}) {
  const links = (
    <>
      <Link className={look === "ghost" ? "ghost" : undefined} href={`/desk${search}`} aria-current={current === "desk" ? "page" : undefined}>
        Desk
      </Link>
      <Link className={look === "ghost" ? "ghost" : undefined} href={`/portfolio${search}`} aria-current={current === "portfolio" ? "page" : undefined}>
        Portfolio
      </Link>
      <Link className={look === "ghost" ? "ghost gropy-name" : "gropy-name"} href="/gropy" aria-current={current === "gropy" ? "page" : undefined}>
        Gropy Trade
      </Link>
      <Link className={look === "ghost" ? "ghost" : undefined} href="/news" aria-current={current === "news" ? "page" : undefined}>
        News
      </Link>
      <Link className={look === "ghost" ? "ghost" : undefined} href="/docs" aria-current={current === "docs" ? "page" : undefined}>
        Docs
      </Link>
      <Link className={look === "ghost" ? "ghost" : undefined} href="/catalogue" aria-current={current === "catalogue" ? "page" : undefined}>
        Catalogue of Doom
      </Link>
    </>
  );
  if (look === "ghost") return <span className="actions">{links}</span>;
  return (
    <nav className="page-switch" aria-label="Desk pages">
      {links}
    </nav>
  );
}
