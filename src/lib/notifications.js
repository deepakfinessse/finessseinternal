import { ObjectId } from "mongodb";
import { collections } from "./db";
import { permissionMatches } from "./rbac-catalog";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

function serialize(n) {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body || "",
    link: n.link || null,
    actorId: n.actorId ? String(n.actorId) : null,
    read: !!n.read,
    createdAt: (n.createdAt || n._id.getTimestamp()).toISOString(),
  };
}

/**
 * Create one notification. Never throws into the caller — a notification
 * failure should never roll back or break the action that triggered it.
 */
export async function notifyUser({ userId, type, title, body = "", link = null, actorId = null }) {
  if (!userId) return;
  if (actorId && String(actorId) === String(userId)) return; // don't notify yourself
  try {
    const { notifications } = await collections();
    await notifications.insertOne({
      userId: oid(userId),
      type,
      title,
      body,
      link,
      actorId: actorId ? oid(actorId) : null,
      read: false,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[notifications] failed to write", type, err);
  }
}

/** Notify several people at once, de-duplicated, skipping the actor. */
export async function notifyUsers({ userIds = [], actorId = null, ...rest }) {
  const unique = [...new Set(userIds.map(String))].filter((id) => id !== String(actorId));
  await Promise.all(unique.map((userId) => notifyUser({ userId, actorId, ...rest })));
}

/**
 * Splits active holders of `permission` into those who should see anything
 * regardless of team (holders of `task:read:all` / `*` — admins, super-admins)
 * and the rest (e.g. Managers, whose grant is role-wide but who should only
 * be looped in for their own team's work).
 */
export async function permissionHoldersByScope(permission) {
  const { users, roles } = await collections();
  const roleDocs = await roles.find({ permissions: { $exists: true } }).toArray();
  const matching = roleDocs.filter((r) => (r.permissions || []).some((g) => permissionMatches(g, permission)));
  if (!matching.length) return { unrestricted: [], scoped: [] };
  const unrestrictedRoleIds = new Set(
    matching
      .filter((r) => (r.permissions || []).some((g) => permissionMatches(g, "task:read:all")))
      .map((r) => String(r._id)),
  );
  const holders = await users
    .find({ roleIds: { $in: matching.map((r) => r._id) }, status: "active" })
    .toArray();
  const unrestricted = [];
  const scoped = [];
  for (const u of holders) {
    const isUnrestricted = (u.roleIds || []).some((rid) => unrestrictedRoleIds.has(String(rid)));
    (isUnrestricted ? unrestricted : scoped).push(u);
  }
  return { unrestricted, scoped };
}

/**
 * Active users holding a given permission (e.g. "task:approve") — full docs,
 * for callers that need more than an in-app ping (e.g. an email address).
 * With `teamId`, holders whose grant isn't team-read-all (i.e. Managers) are
 * further limited to members of that team, so e.g. a blocker on an SEO task
 * doesn't loop in a Web Development manager who has nothing to do with it.
 */
export async function usersByPermission(permission, { teamId } = {}) {
  const { unrestricted, scoped } = await permissionHoldersByScope(permission);
  if (!teamId || !scoped.length) return [...unrestricted, ...scoped];
  const { teams } = await collections();
  const teamDoc = await teams.findOne({ _id: oid(teamId) }, { projection: { memberIds: 1 } });
  const memberSet = new Set((teamDoc?.memberIds || []).map(String));
  return [...unrestricted, ...scoped.filter((u) => memberSet.has(String(u._id)))];
}

/** Notify everyone holding a given permission (e.g. "task:approve"), team-scoped — see `usersByPermission`. */
export async function notifyByPermission({ permission, teamId, actorId = null, ...rest }) {
  try {
    const holders = await usersByPermission(permission, { teamId });
    if (!holders.length) return;
    await notifyUsers({ userIds: holders.map((u) => u._id), actorId, ...rest });
  } catch (err) {
    console.error("[notifications] notifyByPermission failed", permission, err);
  }
}

export async function listNotifications(userId, { limit = 30 } = {}) {
  const { notifications } = await collections();
  const docs = await notifications
    .find({ userId: oid(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(serialize);
}

export async function unreadCount(userId) {
  const { notifications } = await collections();
  return notifications.countDocuments({ userId: oid(userId), read: false });
}

export async function markRead(userId, id) {
  const { notifications } = await collections();
  await notifications.updateOne(
    { _id: oid(id), userId: oid(userId) },
    { $set: { read: true, readAt: new Date() } },
  );
}

export async function markAllRead(userId) {
  const { notifications } = await collections();
  await notifications.updateMany(
    { userId: oid(userId), read: false },
    { $set: { read: true, readAt: new Date() } },
  );
}
