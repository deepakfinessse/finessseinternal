import { ObjectId } from "mongodb";
import { collections } from "./db";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Total worked ms — closed segments plus the open one, if still running. */
function liveTotalMs(doc, now = Date.now()) {
  if (doc.status === "running") {
    const open = doc.segments[doc.segments.length - 1];
    return doc.totalMs + Math.max(0, now - new Date(open.start).getTime());
  }
  return doc.totalMs;
}

function serialize(doc, userMap) {
  const u = userMap?.get(String(doc.userId));
  return {
    id: String(doc._id),
    user: u
      ? { id: String(u._id), name: u.name || "", email: u.email, image: u.image || null }
      : { id: String(doc.userId) },
    status: doc.status,
    workMode: doc.workMode || null,
    startedAt: iso(doc.startedAt),
    stoppedAt: iso(doc.stoppedAt),
    // `totalMs` is live-as-of-now, for one-off renders (history/report).
    totalMs: liveTotalMs(doc),
    // `baseMs` excludes the still-open segment, so a client that ticks its
    // own clock can add elapsed time itself without double-counting it.
    baseMs: doc.totalMs,
    segments: doc.segments.map((s) => ({ start: iso(s.start), end: iso(s.end) })),
  };
}

/** The caller's open session (running or paused), or null if clocked out. */
export async function getActiveSession(userId) {
  const { attendance } = await collections();
  const doc = await attendance.findOne({ userId: oid(userId), status: { $in: ["running", "paused"] } });
  return doc ? serialize(doc) : null;
}

export async function listMySessions(userId, { limit = 60 } = {}) {
  const { attendance } = await collections();
  const docs = await attendance
    .find({ userId: oid(userId) })
    .sort({ startedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => serialize(d));
}

/** Everyone's sessions in a date range, hydrated with user info — the report. */
export async function listAllSessions({ from, to, userId } = {}) {
  const { attendance, users } = await collections();
  const query = {};
  if (from || to) {
    query.startedAt = {};
    if (from) query.startedAt.$gte = new Date(from);
    if (to) query.startedAt.$lte = new Date(to);
  }
  if (userId) query.userId = oid(userId);
  const docs = await attendance.find(query).sort({ startedAt: -1 }).toArray();
  const ids = [...new Set(docs.map((d) => String(d.userId)))];
  const uDocs = ids.length ? await users.find({ _id: { $in: ids.map(oid) } }).toArray() : [];
  const userMap = new Map(uDocs.map((u) => [String(u._id), u]));
  return docs.map((d) => serialize(d, userMap));
}

/**
 * Per-user, per-day rollup for the report's summary table: total time plus
 * the day's first clock-in and last clock-out (across every session that
 * day, not just one). `open` is true when the day's most recent session
 * hasn't been clocked out yet, so there's no final "last out" to show.
 */
export function summarizeByDay(sessions) {
  const byKey = new Map();
  for (const s of sessions) {
    const day = s.startedAt.slice(0, 10);
    const key = `${s.user.id}:${day}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        user: s.user,
        day,
        totalMs: 0,
        sessionCount: 0,
        firstIn: s.startedAt,
        lastOut: null,
        open: false,
        workModes: [],
      });
    }
    const row = byKey.get(key);
    // A day can mix modes (e.g. office in the morning, WFH later) — keep each once.
    if (s.workMode && !row.workModes.includes(s.workMode)) row.workModes.push(s.workMode);
    row.totalMs += s.totalMs;
    row.sessionCount += 1;
    if (s.startedAt < row.firstIn) row.firstIn = s.startedAt;
    if (s.status === "stopped") {
      if (!row.lastOut || s.stoppedAt > row.lastOut) row.lastOut = s.stoppedAt;
    } else {
      row.open = true;
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (b.day.localeCompare(a.day)) || (a.user.name || "").localeCompare(b.user.name || ""),
  );
}
