import { getDb } from "./mongodb";
import { SYSTEM_ROLES } from "./rbac-catalog";

/**
 * Collection accessors. The Auth.js MongoDB adapter owns `users`, `accounts`,
 * `sessions` and `verification_tokens`; the rest are app-owned.
 */
export async function collections() {
  const db = await getDb();
  return {
    db,
    users: db.collection("users"),
    accounts: db.collection("accounts"),
    sessions: db.collection("sessions"),
    roles: db.collection("roles"),
    invitations: db.collection("invitations"),
    versions: db.collection("releaseVersions"),
    auditLogs: db.collection("auditLogs"),
    settings: db.collection("settings"),
    projects: db.collection("projects"),
    tasks: db.collection("tasks"),
  };
}

export const DEFAULT_ONBOARDING = {
  _id: "onboarding",
  steps: [
    { key: "account", title: "Sign in with your Workspace account", description: "Confirms SSO works for the new member.", auto: true },
    { key: "profile", title: "Complete profile & skill tags", description: "Name, title, timezone and skills.", auto: false },
    { key: "security", title: "Review authorized devices", description: "Check the sessions list and revoke anything unexpected.", auto: false },
    { key: "welcome", title: "Read the welcome guide", description: "Team norms and where things live.", auto: false, url: "" },
  ],
};

let bootstrapped;

/**
 * Idempotent: creates indexes and seeds the system roles the first time it runs
 * in a process. Safe to call on every request path.
 */
export async function ensureDbReady() {
  if (bootstrapped) return bootstrapped;
  bootstrapped = (async () => {
    const c = await collections();

    await Promise.all([
      c.roles.createIndex({ key: 1 }, { unique: true }),
      c.invitations.createIndex({ token: 1 }, { unique: true, sparse: true }),
      c.invitations.createIndex({ email: 1 }),
      c.invitations.createIndex({ status: 1 }),
      c.users.createIndex({ email: 1 }, { unique: true, sparse: true }),
      c.users.createIndex({ status: 1 }),
      c.sessions.createIndex({ userId: 1 }),
      c.versions.createIndex({ version: 1 }, { unique: true }),
      c.auditLogs.createIndex({ createdAt: -1 }),
      c.auditLogs.createIndex({ targetType: 1, targetId: 1 }),
      c.projects.createIndex({ status: 1 }),
      c.projects.createIndex({ divisions: 1 }),
      c.projects.createIndex({ name: 1 }),
      c.tasks.createIndex({ projectId: 1 }),
      c.tasks.createIndex({ status: 1 }),
      c.tasks.createIndex({ division: 1 }),
      c.tasks.createIndex({ assigneeId: 1 }),
      c.tasks.createIndex({ collaboratorIds: 1 }),
      c.tasks.createIndex({ endDate: 1 }),
      c.tasks.createIndex({ "approval.state": 1 }),
    ]);

    const now = new Date();
    for (const role of SYSTEM_ROLES) {
      await c.roles.updateOne(
        { key: role.key },
        { $setOnInsert: { ...role, createdAt: now, updatedAt: now } },
        { upsert: true },
      );
    }

    await c.settings.updateOne(
      { _id: DEFAULT_ONBOARDING._id },
      { $setOnInsert: { ...DEFAULT_ONBOARDING, updatedAt: now } },
      { upsert: true },
    );
  })();
  return bootstrapped;
}
