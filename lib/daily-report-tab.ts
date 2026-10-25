const EASTERN = "America/New_York";
const SHOW_AT = 19 * 60;
const MIDNIGHT = 24 * 60;

const easternClock = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function easternMinutes(now: Date): number {
  const parts = easternClock.formatToParts(now);
  let hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (hour === 24) hour = 0;
  return hour * 60 + minute;
}

/** Visible from 7:00 PM America/New_York until midnight America/New_York. */
export function isDailyReportTabVisible(now: Date): boolean {
  const minutes = easternMinutes(now);
  return minutes >= SHOW_AT && minutes < MIDNIGHT;
}
