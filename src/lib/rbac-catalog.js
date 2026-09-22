// Canonical permission catalog. Dynamic roles pick any subset of these keys
// (plus the wildcards "*" and "<group>:*"). The app only enforces keys it knows,
// so adding a new capability means adding its key here and checking it.

export const PERMISSION_CATALOG = [
  { key: "assignee:read", group: "Assignees", description: "View assignee profiles and lists" },
  { key: "assignee:invite", group: "Assignees", description: "Invite new assignees" },
  { key: "assignee:update", group: "Assignees", description: "Edit assignee profile, skills, settings" },
  { key: "assignee:suspend", group: "Assignees", description: "Suspend or reactivate assignees" },
  { key: "assignee:delete", group: "Assignees", description: "Permanently remove assignees" },

  { key: "onboarding:view", group: "Onboarding", description: "View onboarding progress" },
  { key: "onboarding:manage", group: "Onboarding", description: "Configure onboarding steps and resend invites" },

  { key: "project:read", group: "Projects", description: "View projects you're assigned to (a team member on, or with a task in)" },
  { key: "project:read:all", group: "Projects", description: "View every project across the workspace" },
  { key: "project:create", group: "Projects", description: "Onboard a new project" },
  { key: "project:update", group: "Projects", description: "Edit project details, divisions, status" },
  { key: "project:delete", group: "Projects", description: "Archive or delete projects" },

  { key: "task:read", group: "Tasks", description: "View tasks you are assigned to or collaborating on" },
  { key: "task:read:all", group: "Tasks", description: "View every task across all projects" },
  { key: "task:create", group: "Tasks", description: "Create tasks" },
  { key: "task:update", group: "Tasks", description: "Edit task description, priority, attachments, collaborators" },
  { key: "task:schedule", group: "Tasks", description: "Set admin-controlled start / end dates" },
  { key: "task:assign", group: "Tasks", description: "Set the assignee of a task" },
  { key: "task:transition", group: "Tasks", description: "Move a task through open → in progress → review, raise/resolve blockers" },
  { key: "task:approve", group: "Tasks", description: "Approve or reject review, override state, reopen" },
  { key: "task:delete", group: "Tasks", description: "Delete tasks" },

  { key: "session:read", group: "Sessions", description: "View active sessions and devices" },
  { key: "session:revoke", group: "Sessions", description: "Revoke sessions / sign out devices" },

  { key: "version:read", group: "Versions", description: "View release versions" },
  { key: "version:manage", group: "Versions", description: "Create and edit release versions" },
  { key: "version:assign", group: "Versions", description: "Allocate a version to an assignee" },

  { key: "analytics:read", group: "Analytics", description: "Admin intelligence: global task view, timelines, heatmaps, SLA reports" },

  { key: "role:read", group: "Access control", description: "View roles and permissions" },
  { key: "role:create", group: "Access control", description: "Create roles" },
  { key: "role:update", group: "Access control", description: "Edit role permissions" },
  { key: "role:delete", group: "Access control", description: "Delete non-system roles" },
  { key: "role:assign", group: "Access control", description: "Assign roles to users" },

  { key: "audit:read", group: "Audit", description: "View the audit log" },
  { key: "settings:manage", group: "Settings", description: "Manage workspace settings" },

  { key: "division:manage", group: "Divisions", description: "Create, rename and delete agency divisions" },

  { key: "attendance:track", group: "Attendance", description: "Clock in/out and view your own attendance history" },
  { key: "attendance:read:all", group: "Attendance", description: "View attendance for everyone in the workspace" },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export const PERMISSION_GROUPS = [
  ...new Set(PERMISSION_CATALOG.map((p) => p.group)),
];

// System roles created on first run. `key` is stable; `permissions` is the
// starting point — admins can edit everything except a system role's key and
// the super-admin wildcard.
export const SYSTEM_ROLES = [
  {
    key: "super-admin",
    name: "Super Admin",
    description: "Full, unrestricted governance of the workspace.",
    permissions: ["*"],
    priority: 100,
    isSystem: true,
  },
  {
    key: "admin",
    name: "Admin",
    description: "Full control and overrides across people, projects and tasks.",
    permissions: [
      "assignee:*",
      "onboarding:*",
      "project:*",
      "task:*",
      "analytics:read",
      "session:*",
      "version:*",
      "role:read",
      "role:assign",
      "audit:read",
      "settings:manage",
      "attendance:*",
    ],
    priority: 80,
    isSystem: true,
  },
  {
    key: "manager",
    name: "Manager",
    description: "Onboard projects, run the task pipeline, approve work.",
    permissions: [
      "assignee:read",
      "assignee:invite",
      "assignee:update",
      "onboarding:view",
      "onboarding:manage",
      "project:read",
      "project:read:all",
      "project:create",
      "project:update",
      "task:read:all",
      "task:create",
      "task:update",
      "task:schedule",
      "task:assign",
      "task:transition",
      "task:approve",
      "analytics:read",
      "session:read",
      "version:read",
      "version:assign",
      "attendance:track",
      "attendance:read:all",
    ],
    priority: 50,
    isSystem: true,
  },
  {
    key: "assignee",
    name: "Assignee",
    description: "Executor. Works the tasks assigned to them through the lifecycle.",
    permissions: [
      "assignee:read",
      "project:read",
      "task:read",
      "task:transition",
      "session:read",
      "version:read",
      "attendance:track",
    ],
    priority: 10,
    isSystem: true,
  },
  {
    key: "collaborator",
    name: "Collaborator",
    description: "Contributor. Supports tasks they are linked to as a collaborator.",
    permissions: [
      "assignee:read",
      "project:read",
      "task:read",
      "task:transition",
      "session:read",
      "attendance:track",
    ],
    priority: 5,
    isSystem: true,
  },
];

// Match a required permission against a role's granted list, honouring
// "*" (everything) and "<group>:*" (whole group) wildcards.
export function permissionMatches(granted, required) {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1); // "assignee:"
    return required.startsWith(prefix);
  }
  return false;
}
