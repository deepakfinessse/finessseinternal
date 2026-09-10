import { DIVISION_KEYS, PRIORITY_KEYS } from "./pm-constants";

/**
 * Shared task-filter model used by every delivery view (Board, Timeline,
 * Heatmap). State lives in the URL; a `pm_filters` cookie carries it across
 * pages so setting a filter once applies everywhere.
 */
export const TASK_FILTER_KEYS = [
  "mine",
  "overdue",
  "blocked",
  "project",
  "assignee",
  "priority",
  "division",
  "q",
];

export const FILTER_COOKIE = "pm_filters";

const csv = (v) => (v ? String(v).split(",").filter(Boolean) : []);

/** `getter` is `(key) => string | null` — works with URLSearchParams or a map. */
export function parseTaskFilters(getter) {
  const g = typeof getter === "function" ? getter : (k) => getter?.[k];
  return {
    mine: g("mine") === "1",
    overdue: g("overdue") === "1",
    blocked: g("blocked") === "1",
    project: csv(g("project")),
    assignee: csv(g("assignee")),
    priority: csv(g("priority")).filter((p) => PRIORITY_KEYS.includes(p)),
    division: csv(g("division")).filter((d) => DIVISION_KEYS.includes(d)),
    q: (g("q") || "").trim(),
  };
}

export function hasAnyFilterParam(getter) {
  const g = typeof getter === "function" ? getter : (k) => getter?.[k];
  return TASK_FILTER_KEYS.some((k) => {
    const v = g(k);
    return v != null && v !== "";
  });
}

/**
 * Resolve the active filters for a request: URL params win; if the URL has no
 * filter params at all, fall back to the persisted cookie.
 */
export function resolveTaskFilters({ searchParams, cookieValue }) {
  const spGet = (k) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v ?? null;
  };
  if (hasAnyFilterParam(spGet)) return parseTaskFilters(spGet);
  if (cookieValue) {
    const cp = new URLSearchParams(cookieValue);
    return parseTaskFilters((k) => cp.get(k));
  }
  return parseTaskFilters(() => null);
}

/** Turn resolved filters into `listTasks(user, …)` arguments. */
export function filterListArgs(f, userId) {
  const assignee = [...f.assignee];
  if (f.mine && userId && !assignee.includes(userId)) assignee.push(userId);
  return {
    divisions: f.division,
    priorities: f.priority,
    projectIds: f.project,
    assigneeIds: assignee,
    overdue: f.overdue || undefined,
    blocked: f.blocked || undefined,
    q: f.q || undefined,
  };
}

/** Serialize resolved filters back to a querystring (only non-empty keys). */
export function serializeFilters(f) {
  const p = new URLSearchParams();
  if (f.mine) p.set("mine", "1");
  if (f.overdue) p.set("overdue", "1");
  if (f.blocked) p.set("blocked", "1");
  for (const k of ["project", "assignee", "priority", "division"]) {
    if (f[k]?.length) p.set(k, f[k].join(","));
  }
  if (f.q) p.set("q", f.q);
  return p.toString();
}

export function filterCount(f) {
  return (
    f.project.length +
    f.assignee.length +
    f.priority.length +
    f.division.length +
    (f.mine ? 1 : 0) +
    (f.overdue ? 1 : 0) +
    (f.blocked ? 1 : 0) +
    (f.q ? 1 : 0)
  );
}
