// Agency divisions are dynamic (super-admin managed) — see src/lib/divisions.js.
// The default seed for a fresh database lives in src/lib/db.js.

export const PROJECT_STATUSES = ["onboarding", "active", "paused", "completed", "archived"];

export const PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];
export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);

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

export function isOverdue(task) {
  if (!task?.endDate) return false;
  if (task.status === "completed") return false;
  return new Date(task.endDate).getTime() < Date.now();
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

export function overdueDays(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}
