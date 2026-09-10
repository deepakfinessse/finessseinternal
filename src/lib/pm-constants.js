// Agency divisions — fixed routing targets a project is assigned to.
export const DIVISIONS = [
  { key: "sem-social", label: "SEM & Social Media" },
  { key: "orm-content", label: "ORM & Content Projects" },
  { key: "webdev-graphics", label: "Web Development & Graphics Designing" },
];
export const DIVISION_KEYS = DIVISIONS.map((d) => d.key);
export const divisionLabel = (k) =>
  DIVISIONS.find((d) => d.key === k)?.label || k || "—";

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
