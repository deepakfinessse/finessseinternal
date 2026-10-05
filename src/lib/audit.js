import { ObjectId } from "mongodb";
import { collections } from "./db";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));

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

/** Audit entries with `actorName` resolved, so callers can show who did what. */
export async function listAudit({ limit = 100, targetType, targetId } = {}) {
  const { auditLogs, users } = await collections();
  const query = {};
  if (targetType) query.targetType = targetType;
  if (targetId) query.targetId = String(targetId);
  const docs = await auditLogs.find(query).sort({ createdAt: -1 }).limit(limit).toArray();

  const actorIds = [...new Set(docs.map((d) => d.actorId).filter(Boolean))];
  const uDocs = actorIds.length ? await users.find({ _id: { $in: actorIds.map(oid) } }).toArray() : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  return docs.map((d) => ({
    ...d,
    actorName: d.actorId ? uMap.get(String(d.actorId))?.name || uMap.get(String(d.actorId))?.email || "Unknown" : "System",
  }));
}
