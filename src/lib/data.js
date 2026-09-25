import { ObjectId } from "mongodb";
import { collections } from "./db";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

function serializeUser(u, rolesById) {
  return {
    id: String(u._id),
    name: u.name || "",
    email: u.email,
    image: u.image || null,
    status: u.status || "active",
    title: u.title || "",
    phone: u.phone || "",
    dateOfBirth: u.dateOfBirth || "",
    settings: u.settings || {},
    assignedVersion: u.assignedVersion || null,
    onboarding: u.onboarding || { stepsCompleted: [], completedAt: null },
    createdAt: (u.createdAt || u._id.getTimestamp()).toISOString(),
    roleIds: (u.roleIds || []).map(String),
    roles: (u.roleIds || [])
      .map((rid) => rolesById.get(String(rid)))
      .filter(Boolean)
      .map((r) => ({ id: String(r._id), key: r.key, name: r.name, isSystem: !!r.isSystem })),
  };
}

export async function listRoles() {
  const { roles } = await collections();
  const docs = await roles.find({}).sort({ priority: -1, name: 1 }).toArray();
  return docs.map((r) => ({
    id: String(r._id),
    key: r.key,
    name: r.name,
    description: r.description || "",
    permissions: r.permissions || [],
    priority: r.priority ?? 0,
    isSystem: !!r.isSystem,
    createdAt: (r.createdAt || r._id.getTimestamp()).toISOString(),
  }));
}

export async function getRole(id) {
  const { roles } = await collections();
  const r = await roles.findOne({ _id: oid(id) });
  if (!r) return null;
  return {
    id: String(r._id),
    key: r.key,
    name: r.name,
    description: r.description || "",
    permissions: r.permissions || [],
    priority: r.priority ?? 0,
    isSystem: !!r.isSystem,
  };
}

export async function rolesById() {
  const { roles } = await collections();
  const docs = await roles.find({}).toArray();
  return new Map(docs.map((r) => [String(r._id), r]));
}

export async function listUsers({ status, roleId, q } = {}) {
  const { users } = await collections();
  const map = await rolesById();
  const query = {};
  if (status) query.status = status;
  if (roleId) query.roleIds = oid(roleId);
  if (q) {
    query.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }
  const docs = await users.find(query).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map((u) => serializeUser(u, map));
}

export async function getUser(id) {
  const { users } = await collections();
  const map = await rolesById();
  const u = await users.findOne({ _id: oid(id) });
  return u ? serializeUser(u, map) : null;
}

export async function countByStatus() {
  const { users } = await collections();
  const rows = await users
    .aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  const out = { active: 0, invited: 0, suspended: 0, deactivated: 0 };
  for (const r of rows) out[r._id || "active"] = r.n;
  return out;
}

export async function listInvitations({ status } = {}) {
  const { invitations } = await collections();
  const map = await rolesById();
  const query = status ? { status } : {};
  const docs = await invitations.find(query).sort({ createdAt: -1 }).toArray();
  return docs.map((i) => ({
    id: String(i._id),
    email: i.email,
    title: i.title || "",
    status: i.status,
    roleIds: (i.roleIds || []).map(String),
    roles: (i.roleIds || [])
      .map((rid) => map.get(String(rid)))
      .filter(Boolean)
      .map((r) => ({ id: String(r._id), name: r.name })),
    invitedBy: i.invitedBy ? String(i.invitedBy) : null,
    expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
    createdAt: (i.createdAt || i._id.getTimestamp()).toISOString(),
    acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
    emailDelivered: i.emailDelivered ?? null,
  }));
}

export async function getInvitationByToken(token) {
  const { invitations } = await collections();
  const i = await invitations.findOne({ token });
  if (!i) return null;
  return {
    id: String(i._id),
    email: i.email,
    status: i.status,
    expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
    expired: i.expiresAt ? i.expiresAt < new Date() : false,
  };
}

export async function getOnboardingConfig() {
  const { settings } = await collections();
  const doc = await settings.findOne({ _id: "onboarding" });
  return { steps: doc?.steps || [] };
}

export async function listSessions({ userId } = {}) {
  const { sessions, users } = await collections();
  const query = userId ? { userId: oid(userId) } : {};
  const docs = await sessions.find(query).sort({ lastSeenAt: -1, expires: -1 }).toArray();
  const userIds = [...new Set(docs.map((s) => String(s.userId)))];
  const uDocs = userIds.length
    ? await users.find({ _id: { $in: userIds.map(oid) } }).toArray()
    : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));
  const now = Date.now();
  return docs.map((s) => {
    const u = uMap.get(String(s.userId));
    return {
      id: String(s._id),
      sessionToken: s.sessionToken,
      userId: String(s.userId),
      user: u ? { id: String(u._id), name: u.name || "", email: u.email, image: u.image || null } : null,
      userAgent: s.userAgent || "",
      device: s.device || describeUA(s.userAgent),
      ip: s.ip || "",
      appVersion: s.appVersion || null,
      current: s.current || false,
      lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      expires: s.expires ? new Date(s.expires).toISOString() : null,
      expired: s.expires ? new Date(s.expires).getTime() < now : false,
      createdAt: (s.createdAt || s._id.getTimestamp()).toISOString(),
    };
  });
}

export function describeUA(ua = "") {
  if (!ua) return "Unknown device";
  const os =
    /Windows NT 10/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Android/.test(ua) ? "Android" :
    /(iPhone|iPad|iOS)/.test(ua) ? "iOS" :
    /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "browser";
  return `${browser} on ${os}`;
}

export async function listVersions() {
  const { versions, users } = await collections();
  const docs = await versions.find({}).sort({ releasedAt: -1, _id: -1 }).toArray();
  const counts = await users
    .aggregate([
      { $match: { assignedVersion: { $ne: null } } },
      { $group: { _id: "$assignedVersion", n: { $sum: 1 } } },
    ])
    .toArray();
  const countMap = new Map(counts.map((c) => [c._id, c.n]));
  return docs.map((v) => ({
    id: String(v._id),
    version: v.version,
    channel: v.channel || "stable",
    notes: v.notes || "",
    isActive: !!v.isActive,
    isDefault: !!v.isDefault,
    assignedCount: countMap.get(v.version) || 0,
    releasedAt: (v.releasedAt || v._id.getTimestamp()).toISOString(),
  }));
}

export async function listAuditLog({ limit = 100 } = {}) {
  const { auditLogs, users } = await collections();
  const docs = await auditLogs.find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  const actorIds = [...new Set(docs.map((d) => d.actorId).filter(Boolean))];
  const uDocs = actorIds.length
    ? await users.find({ _id: { $in: actorIds.map(oid) } }).toArray()
    : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));
  return docs.map((d) => ({
    id: String(d._id),
    action: d.action,
    actor: d.actorId ? uMap.get(String(d.actorId))?.email || "unknown" : "system",
    targetType: d.targetType,
    targetId: d.targetId,
    meta: d.meta || {},
    createdAt: (d.createdAt || d._id.getTimestamp()).toISOString(),
  }));
}
