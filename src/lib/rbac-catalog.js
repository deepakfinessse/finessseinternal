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

  { key: "session:read", group: "Sessions", description: "View active sessions and devices" },
  { key: "session:revoke", group: "Sessions", description: "Revoke sessions / sign out devices" },

  { key: "version:read", group: "Versions", description: "View release versions" },
  { key: "version:manage", group: "Versions", description: "Create and edit release versions" },
  { key: "version:assign", group: "Versions", description: "Allocate a version to an assignee" },

  { key: "role:read", group: "Access control", description: "View roles and permissions" },
  { key: "role:create", group: "Access control", description: "Create roles" },
  { key: "role:update", group: "Access control", description: "Edit role permissions" },
  { key: "role:delete", group: "Access control", description: "Delete non-system roles" },
  { key: "role:assign", group: "Access control", description: "Assign roles to users" },

  { key: "audit:read", group: "Audit", description: "View the audit log" },
  { key: "settings:manage", group: "Settings", description: "Manage workspace settings" },
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
    description: "Manage people, access, versions and settings.",
    permissions: [
      "assignee:*",
      "onboarding:*",
      "session:*",
      "version:*",
      "role:read",
      "role:assign",
      "audit:read",
      "settings:manage",
    ],
    priority: 80,
    isSystem: true,
  },
  {
    key: "manager",
    name: "Manager",
    description: "Onboard and support a team of assignees.",
    permissions: [
      "assignee:read",
      "assignee:invite",
      "assignee:update",
      "onboarding:view",
      "onboarding:manage",
      "session:read",
      "version:read",
      "version:assign",
    ],
    priority: 50,
    isSystem: true,
  },
  {
    key: "assignee",
    name: "Assignee",
    description: "Standard team member. Sees their own profile and sessions.",
    permissions: ["assignee:read", "session:read", "version:read"],
    priority: 10,
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
