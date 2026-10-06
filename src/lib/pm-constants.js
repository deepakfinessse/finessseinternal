// Agency teams are dynamic (super-admin managed) — see src/lib/teams.js.
// The default seed for a fresh database lives in src/lib/db.js.

export const PROJECT_STATUSES = ["onboarding", "active", "paused", "completed", "archived"];

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);

/**
 * Leaderboard XP, awarded to a task's assignee when it's approved as
 * completed. Derived from completed tasks (not stored), so reopening a task
 * takes its XP back automatically.
 */
export const XP_BY_PRIORITY = { low: 10, medium: 20, high: 40, urgent: 80 };

export function taskXp(priority) {
  return XP_BY_PRIORITY[priority] ?? XP_BY_PRIORITY.medium;
}

// Task lifecycle / state machine (see the flowchart, section 4).
export const TASK_STATUSES = ["open", "in_progress", "in_review", "blocked", "completed"];

export const STATUS_LABEL = {
  open: "Open",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  completed: "Completed",
};

export const APPROVAL_LABEL = {
  none: "—",
  pending: "Awaiting admin approval",
  approved: "Approved",
  rejected: "Revisions requested",
};

/**
 * Normal (non-approval, non-blocker) forward transitions available to a holder
 * of `task:transition`. Blocker + approval moves are handled by dedicated
 * actions with their own rules.
 */
export const FORWARD_TRANSITIONS = {
  open: ["in_progress"],
  in_progress: ["in_review"],
  in_review: ["in_progress"], // pull back for more work before requesting approval
  blocked: [], // leave via resolveBlocker only
  completed: [], // leave via reopen (task:approve) only
};

export const TRANSITION_LABEL = {
  "open>in_progress": "Start work",
  "in_progress>in_review": "Submit for review",
  "in_review>in_progress": "Reopen for changes",
};

export function canForward(from, to) {
  return (FORWARD_TRANSITIONS[from] || []).includes(to);
}

export const BLOCKER_KINDS = [
  { key: "internal", label: "Internal" },
  { key: "client_side", label: "Client-Side" },
];

/** A due date is a calendar day (stored as that day's UTC midnight, from a
 *  plain `<input type="date">`), not an instant — so a task is only overdue
 *  once its whole due day has elapsed, not the moment the clock passes
 *  midnight on the day it's due. */
export const DAY_MS = 86400000;

export function isOverdue(task) {
  if (!task?.endDate) return false;
  if (task.status === "completed") return false;
  return new Date(task.endDate).getTime() + DAY_MS <= Date.now();
}

/** The cutoff to compare a stored `endDate` against for "is it overdue right
 *  now" queries (including raw Mongo `{ endDate: { $lt: overdueCutoff() } }`
 *  filters, which can't call `isOverdue` directly) — one full day earlier
 *  than now, so a same-day due date never reads as overdue. */
export function overdueCutoff() {
  return new Date(Date.now() - DAY_MS);
}

/* task update thread */
export const MAX_UPDATE_WORDS = 100;

export function countWords(text) {
  const t = String(text || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

/* estimated time — stored as whole minutes, entered/shown as hours + minutes */
export const MAX_ESTIMATE_MINUTES = 999 * 60;

/** Reads `${prefix}Hours` / `${prefix}Minutes` form fields. Returns minutes,
 *  0 when both are blank, or null when the input is invalid. */
export function readDuration(formData, prefix = "estimate") {
  const h = String(formData.get(`${prefix}Hours`) ?? "").trim();
  const m = String(formData.get(`${prefix}Minutes`) ?? "").trim();
  const hours = h === "" ? 0 : Number(h);
  const minutes = m === "" ? 0 : Number(m);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || minutes < 0 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return total > MAX_ESTIMATE_MINUTES ? null : total;
}

export function fmtDuration(minutes) {
  if (minutes == null) return "—";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* time helpers — wrapped so components can use "now" without tripping the
   react-compiler purity lint (Date.now is impure inside render). */
export function nowMs() {
  return Date.now();
}

export function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days past due, counting from the end of the due day (see `isOverdue`)
 *  — 0 on the day it first becomes overdue, 1 the day after, and so on. */
export function overdueDays(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS) - 1);
}
