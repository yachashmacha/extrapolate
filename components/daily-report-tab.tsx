"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isDailyReportTabVisible } from "@/lib/daily-report-tab";
import styles from "./daily-report-tab.module.css";

const TICK_MS = 15_000;

export function DailyReportTab() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(isDailyReportTabVisible(new Date()));
    update();
    const id = window.setInterval(update, TICK_MS);
    const onWake = () => update();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  if (!visible) return null;

  return (
    <Link className={styles.tab} href="/portfolio#daily-report">
      daily report
    </Link>
  );
}
