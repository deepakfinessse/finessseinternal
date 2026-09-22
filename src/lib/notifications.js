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

/** Active users holding a given permission (e.g. "task:approve") — full docs,
 *  for callers that need more than an in-app ping (e.g. an email address). */
export async function usersByPermission(permission) {
  const { users, roles } = await collections();
  const roleDocs = await roles.find({ permissions: { $exists: true } }).toArray();
  const roleIds = roleDocs
    .filter((r) => (r.permissions || []).some((g) => permissionMatches(g, permission)))
    .map((r) => r._id);
  if (!roleIds.length) return [];
  return users.find({ roleIds: { $in: roleIds }, status: "active" }).toArray();
}

/** Notify everyone holding a given permission (e.g. "task:approve"). */
export async function notifyByPermission({ permission, actorId = null, ...rest }) {
  try {
    const holders = await usersByPermission(permission);
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
