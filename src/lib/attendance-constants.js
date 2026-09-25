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
