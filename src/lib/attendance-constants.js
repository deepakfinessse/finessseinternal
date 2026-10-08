// Attendance is tracked for a single Indian office, so clock-in/out times are
// always displayed in IST regardless of the server's own timezone (Vercel
// runs in UTC) or the viewer's browser/OS locale.
export const ATTENDANCE_TIMEZONE = "Asia/Kolkata";

/** The IST calendar date ("YYYY-MM-DD") a given instant falls on — attendance
 *  days are bucketed and filtered by the IST date, not whatever UTC (or
 *  other) date the instant happens to land on. Accepts anything `Date`
 *  does: an ISO string, a Date, or an epoch ms number; defaults to now. */
export function istDateKey(input = Date.now()) {
  return new Date(input).toLocaleDateString("en-CA", { timeZone: ATTENDANCE_TIMEZONE });
}

// Work mode chosen at clock-in. Shared by the topbar widget (client) and the
// attendance actions / report (server).
export const WORK_MODES = [
  { key: "active", label: "Active", short: "Active" },
  { key: "wfh", label: "Work from home", short: "WFH" },
];
export const WORK_MODE_KEYS = WORK_MODES.map((m) => m.key);

export function workModeLabel(key, { short = false } = {}) {
  const m = WORK_MODES.find((x) => x.key === key);
  if (!m) return "—"; // sessions clocked in before work mode existed
  return short ? m.short : m.label;
}
