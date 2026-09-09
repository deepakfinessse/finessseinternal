import { collections } from "./db";

/** Append an entry to the audit log. Never throws into the caller. */
export async function writeAudit({ actorId = null, action, targetType, targetId, meta = {} }) {
  try {
    const { auditLogs } = await collections();
    await auditLogs.insertOne({
      actorId: actorId ? String(actorId) : null,
      action,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      meta,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[audit] failed to write", action, err);
  }
}

export async function listAudit({ limit = 100, targetType, targetId } = {}) {
  const { auditLogs } = await collections();
  const query = {};
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = String(targetId);
  return auditLogs.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
}
