import { ObjectId } from "mongodb";
import { collections } from "./db";
import { rolesById } from "./data";
import { divisionLabel, isOverdue } from "./pm-constants";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));
const iso = (d) => (d ? new Date(d).toISOString() : null);

/* ------------------------------------------------------------------ projects */

export function serializeProject(p, taskCounts = {}) {
  return {
    id: String(p._id),
    name: p.name,
    client: p.client || "",
    description: p.description || "",
    divisions: p.divisions || [],
    divisionLabels: (p.divisions || []).map(divisionLabel),
    status: p.status || "onboarding",
    clientVisible: !!p.clientVisible,
    ownerId: p.ownerId ? String(p.ownerId) : null,
    createdAt: iso(p.createdAt || p._id.getTimestamp()),
    onboardedAt: iso(p.onboardedAt),
    taskCounts: {
      total: taskCounts.total || 0,
      open: taskCounts.open || 0,
      in_progress: taskCounts.in_progress || 0,
      in_review: taskCounts.in_review || 0,
      blocked: taskCounts.blocked || 0,
      completed: taskCounts.completed || 0,
      overdue: taskCounts.overdue || 0,
    },
  };
}

export async function listProjects({ status, division, divisions, q } = {}) {
  const { projects, tasks, users } = await collections();
  const divList = [...(divisions || []), ...(division ? [division] : [])].filter(Boolean);
  const query = {};
  if (status) query.status = status;
  if (divList.length) query.divisions = { $in: divList };
  if (q) query.$or = [
    { name: { $regex: q, $options: "i" } },
    { client: { $regex: q, $options: "i" } },
  ];
  const docs = await projects.find(query).sort({ createdAt: -1, _id: -1 }).toArray();
  const ids = docs.map((d) => d._id);

  const [counts, overdue, meta] = await Promise.all([
    tasks
      .aggregate([
        { $match: { projectId: { $in: ids } } },
        { $group: { _id: { p: "$projectId", s: "$status" }, n: { $sum: 1 } } },
      ])
      .toArray(),
    tasks
      .aggregate([
        {
          $match: {
            projectId: { $in: ids },
            status: { $ne: "completed" },
            endDate: { $lt: new Date() },
          },
        },
        { $group: { _id: "$projectId", n: { $sum: 1 } } },
      ])
      .toArray(),
    tasks
      .aggregate([
        { $match: { projectId: { $in: ids } } },
        {
          $group: {
            _id: "$projectId",
            maxEndDate: { $max: "$endDate" },
            assignees: { $addToSet: "$assigneeId" },
          },
        },
      ])
      .toArray(),
  ]);

  const byProject = new Map();
  const ensure = (key) => {
    if (!byProject.has(key)) byProject.set(key, { total: 0, assignees: [], maxEndDate: null });
    return byProject.get(key);
  };
  for (const row of counts) {
    const agg = ensure(String(row._id.p));
    agg[row._id.s] = row.n;
    agg.total += row.n;
  }
  for (const row of overdue) ensure(String(row._id)).overdue = row.n;
  for (const row of meta) {
    const agg = ensure(String(row._id));
    agg.maxEndDate = row.maxEndDate || null;
    agg.assignees = (row.assignees || []).filter(Boolean).map(String);
  }

  const allAssignees = [...new Set([...byProject.values()].flatMap((a) => a.assignees))];
  const uDocs = allAssignees.length
    ? await users.find({ _id: { $in: allAssignees.map(oid) } }).toArray()
    : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  return docs.map((d) => {
    const agg = byProject.get(String(d._id)) || { total: 0, assignees: [], maxEndDate: null };
    const base = serializeProject(d, agg);
    const total = base.taskCounts.total;
    const targetDate = agg.maxEndDate ? new Date(agg.maxEndDate).toISOString() : null;
    return {
      ...base,
      completionPct: total ? Math.round((base.taskCounts.completed / total) * 100) : 0,
      onTrack: Math.max(0, total - base.taskCounts.overdue - base.taskCounts.blocked),
      targetDate,
      daysLeft: targetDate
        ? Math.round((new Date(targetDate).getTime() - Date.now()) / 86400000)
        : null,
      people: agg.assignees
        .map((id) => uMap.get(id))
        .filter(Boolean)
        .map((u) => ({ id: String(u._id), name: u.name || "", email: u.email, image: u.image || null })),
    };
  });
}

/** Lightweight id + name list for filter menus. */
export async function listProjectOptions() {
  const { projects } = await collections();
  const docs = await projects
    .find({}, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((p) => ({ id: String(p._id), name: p.name }));
}

export async function getProject(id) {
  const { projects, tasks } = await collections();
  let p;
  try {
    p = await projects.findOne({ _id: oid(id) });
  } catch {
    return null;
  }
  if (!p) return null;
  const rows = await tasks
    .aggregate([
      { $match: { projectId: p._id } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ])
    .toArray();
  const counts = { total: 0 };
  for (const r of rows) {
    counts[r._id] = r.n;
    counts.total += r.n;
  }
  counts.overdue = await tasks.countDocuments({
    projectId: p._id,
    status: { $ne: "completed" },
    endDate: { $lt: new Date() },
  });
  return serializeProject(p, counts);
}

/* --------------------------------------------------------------------- tasks */

/** Mongo filter that limits tasks to those a user may see. */
export function taskScopeFilter(user) {
  if (user.can("task:read:all") || user.can("*")) return {};
  return { $or: [{ assigneeId: oid(user.id) }, { collaboratorIds: oid(user.id) }] };
}

export function serializeTask(t, { project, users } = {}) {
  const u = (id) => {
    if (!id) return null;
    const d = users?.get(String(id));
    return d ? { id: String(d._id), name: d.name || "", email: d.email, image: d.image || null } : { id: String(id) };
  };
  return {
    id: String(t._id),
    projectId: String(t.projectId),
    project: project ? { id: String(project._id), name: project.name, client: project.client || "" } : null,
    division: t.division || null,
    divisionLabel: divisionLabel(t.division),
    title: t.title,
    description: t.description || "",
    priority: t.priority || "medium",
    status: t.status || "open",
    statusBeforeBlock: t.statusBeforeBlock || null,
    approval: t.approval || "none",
    approvalNote: t.approvalNote || "",
    approvedBy: t.approvedBy ? String(t.approvedBy) : null,
    approvedAt: iso(t.approvedAt),
    revisionCount: t.revisionCount || 0,
    clientVisible: !!t.clientVisible,
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    completedAt: iso(t.completedAt),
    overdue: isOverdue(t),
    assignee: u(t.assigneeId),
    collaborators: (t.collaboratorIds || []).map(u).filter(Boolean),
    attachments: (t.attachments || []).map((a) => ({
      id: a.id,
      type: a.type,
      label: a.label,
      url: a.url,
      uploadedAt: iso(a.uploadedAt),
    })),
    blocker: t.blocker
      ? {
          active: !!t.blocker.active,
          description: t.blocker.description || "",
          kind: t.blocker.kind || "internal",
          raisedAt: iso(t.blocker.raisedAt),
          resolvedAt: iso(t.blocker.resolvedAt),
          log: (t.blocker.log || []).map((l) => ({ at: iso(l.at), note: l.note, by: l.by ? String(l.by) : null })),
        }
      : null,
    createdAt: iso(t.createdAt || t._id.getTimestamp()),
    updatedAt: iso(t.updatedAt),
  };
}

async function hydrateUsers(taskDocs) {
  const { users } = await collections();
  const ids = new Set();
  for (const t of taskDocs) {
    if (t.assigneeId) ids.add(String(t.assigneeId));
    for (const c of t.collaboratorIds || []) ids.add(String(c));
  }
  if (!ids.size) return new Map();
  const docs = await users.find({ _id: { $in: [...ids].map(oid) } }).toArray();
  return new Map(docs.map((d) => [String(d._id), d]));
}

export async function listTasks(user, filters = {}) {
  const { tasks, projects } = await collections();
  const {
    projectId, projectIds,
    division, divisions,
    status,
    assigneeId, assigneeIds,
    priorities,
    approval, overdue, blocked, q,
  } = filters;

  const arr = (single, plural) =>
    [...(plural || []), ...(single ? [single] : [])].filter(Boolean);
  const oidList = (single, plural) =>
    arr(single, plural)
      .filter((v) => ObjectId.isValid(v))
      .map((v) => new ObjectId(String(v)));
  const projList = oidList(projectId, projectIds);
  const divList = arr(division, divisions);
  const asgList = oidList(assigneeId, assigneeIds);

  const query = { ...taskScopeFilter(user) };
  if (projList.length) query.projectId = { $in: projList };
  if (divList.length) query.division = { $in: divList };
  if (asgList.length) query.assigneeId = { $in: asgList };
  if (priorities?.length) query.priority = { $in: priorities };
  if (status) query.status = status;
  if (approval) query.approval = approval;
  if (blocked) query.status = "blocked";
  if (overdue) {
    query.status = { $ne: "completed" };
    query.endDate = { $lt: new Date() };
  }
  if (q) query.title = { $regex: q, $options: "i" };

  const docs = await tasks.find(query).sort({ endDate: 1, priority: -1, _id: -1 }).toArray();
  const [userMap, projDocs] = await Promise.all([
    hydrateUsers(docs),
    projects.find({ _id: { $in: [...new Set(docs.map((d) => String(d.projectId)))].map(oid) } }).toArray(),
  ]);
  const projMap = new Map(projDocs.map((p) => [String(p._id), p]));
  return docs.map((t) =>
    serializeTask(t, { project: projMap.get(String(t.projectId)), users: userMap }),
  );
}

export async function getTask(user, id) {
  const { tasks, projects } = await collections();
  let t;
  try {
    t = await tasks.findOne({ _id: oid(id), ...taskScopeFilter(user) });
  } catch {
    return null;
  }
  if (!t) return null;
  const [userMap, project] = await Promise.all([
    hydrateUsers([t]),
    projects.findOne({ _id: t.projectId }),
  ]);
  return serializeTask(t, { project, users: userMap });
}

export async function taskStats(user) {
  const { tasks } = await collections();
  const scope = taskScopeFilter(user);
  const rows = await tasks
    .aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  const out = { total: 0, open: 0, in_progress: 0, in_review: 0, blocked: 0, completed: 0, overdue: 0, awaitingApproval: 0 };
  for (const r of rows) {
    out[r._id] = r.n;
    out.total += r.n;
  }
  out.overdue = await tasks.countDocuments({ ...scope, status: { $ne: "completed" }, endDate: { $lt: new Date() } });
  out.awaitingApproval = await tasks.countDocuments({ ...scope, approval: "pending" });
  return out;
}

/* ----------------------------------------------------------------- analytics */

export async function analyticsOverview() {
  const { tasks, projects } = await collections();
  const now = new Date();

  const [byStatus, byDivision, byPriority, totals] = await Promise.all([
    tasks.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([{ $group: { _id: "$division", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([{ $group: { _id: "$priority", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
        },
      },
    ]).toArray(),
  ]);

  const overdue = await tasks.countDocuments({ status: { $ne: "completed" }, endDate: { $lt: now } });
  const awaitingApproval = await tasks.countDocuments({ approval: "pending" });
  const activeProjects = await projects.countDocuments({ status: { $in: ["onboarding", "active"] } });

  const t = totals[0] || { total: 0, completed: 0, blocked: 0 };
  return {
    totalTasks: t.total,
    completed: t.completed,
    blocked: t.blocked,
    overdue,
    awaitingApproval,
    activeProjects,
    completionRate: t.total ? Math.round((t.completed / t.total) * 100) : 0,
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id || "unknown", r.n])),
    byDivision: Object.fromEntries(byDivision.map((r) => [r._id || "unknown", r.n])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r._id || "unknown", r.n])),
  };
}

/** Per-assignee rollup — the "Global Assignee Task View". */
export async function globalAssigneeView() {
  const { tasks, users } = await collections();
  const rows = await tasks
    .aggregate([
      { $match: { assigneeId: { $ne: null } } },
      {
        $group: {
          _id: "$assigneeId",
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
          in_progress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
          in_review: { $sum: { $cond: [{ $eq: ["$status", "in_review"] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$endDate", new Date()] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { total: -1 } },
    ])
    .toArray();
  const uDocs = await users.find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));
  return rows.map((r) => ({
    user: uMap.get(String(r._id))
      ? { id: String(r._id), name: uMap.get(String(r._id)).name || "", email: uMap.get(String(r._id)).email }
      : { id: String(r._id), name: "Unknown", email: "" },
    total: r.total,
    open: r.open,
    in_progress: r.in_progress,
    in_review: r.in_review,
    blocked: r.blocked,
    completed: r.completed,
    overdue: r.overdue,
  }));
}

/** Tasks with an end date inside [from, to] for the calendar / timeline. */
export async function calendarTasks({ from, to }) {
  const { tasks, projects } = await collections();
  const docs = await tasks
    .find({ endDate: { $gte: new Date(from), $lte: new Date(to) } })
    .sort({ endDate: 1 })
    .toArray();
  const [userMap, projDocs] = await Promise.all([
    hydrateUsers(docs),
    projects.find({ _id: { $in: [...new Set(docs.map((d) => String(d.projectId)))].map(oid) } }).toArray(),
  ]);
  const projMap = new Map(projDocs.map((p) => [String(p._id), p]));
  return docs.map((t) => serializeTask(t, { project: projMap.get(String(t.projectId)), users: userMap }));
}

/** division × status matrix for the overdue / status heatmap. */
export async function statusHeatmap() {
  const { tasks } = await collections();
  const rows = await tasks
    .aggregate([{ $group: { _id: { d: "$division", s: "$status" }, n: { $sum: 1 } } }])
    .toArray();
  const overdueRows = await tasks
    .aggregate([
      { $match: { status: { $ne: "completed" }, endDate: { $lt: new Date() } } },
      { $group: { _id: "$division", n: { $sum: 1 } } },
    ])
    .toArray();
  const matrix = {};
  for (const r of rows) {
    const d = r._id.d || "unknown";
    matrix[d] = matrix[d] || {};
    matrix[d][r._id.s] = r.n;
  }
  for (const r of overdueRows) {
    const d = r._id || "unknown";
    matrix[d] = matrix[d] || {};
    matrix[d].overdue = r.n;
  }
  return matrix;
}

/** Monthly on-time vs overdue completion history (SLA report). */
export async function slaReport({ months = 6 } = {}) {
  const { tasks } = await collections();
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);

  const rows = await tasks
    .aggregate([
      { $match: { status: "completed", completedAt: { $gte: since } } },
      {
        $project: {
          ym: { $dateToString: { format: "%Y-%m", date: "$completedAt" } },
          onTime: {
            $cond: [
              { $or: [{ $eq: ["$endDate", null] }, { $lte: ["$completedAt", "$endDate"] }] },
              1,
              0,
            ],
          },
        },
      },
      { $group: { _id: "$ym", total: { $sum: 1 }, onTime: { $sum: "$onTime" } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const map = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i++) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const r = map.get(ym) || { total: 0, onTime: 0 };
    out.push({
      month: ym,
      total: r.total,
      onTime: r.onTime,
      overdue: r.total - r.onTime,
      slaPct: r.total ? Math.round((r.onTime / r.total) * 100) : null,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/* ------------------------------------------------------- delivery SLA report */

const DAY_MS = 86400000;

/** Headline delivery metrics across all completed work. */
export async function deliverySla() {
  const { tasks } = await collections();
  const fourWeeksAgo = new Date(Date.now() - 28 * DAY_MS);

  const [agg] = await tasks
    .aggregate([
      { $match: { status: "completed", completedAt: { $ne: null } } },
      {
        $project: {
          onTime: {
            $cond: [
              { $or: [{ $eq: ["$endDate", null] }, { $lte: ["$completedAt", "$endDate"] }] },
              1,
              0,
            ],
          },
          overrunMs: {
            $cond: [
              { $and: [{ $ne: ["$endDate", null] }, { $gt: ["$completedAt", "$endDate"] }] },
              { $subtract: ["$completedAt", "$endDate"] },
              null,
            ],
          },
          cycleMs: {
            $cond: [
              { $and: [{ $ne: ["$createdAt", null] }, { $ne: ["$completedAt", null] }] },
              { $subtract: ["$completedAt", "$createdAt"] },
              null,
            ],
          },
          recent: { $cond: [{ $gte: ["$completedAt", fourWeeksAgo] }, 1, 0] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          onTime: { $sum: "$onTime" },
          lateOverrunMs: { $sum: { $ifNull: ["$overrunMs", 0] } },
          lateCount: { $sum: { $cond: [{ $ne: ["$overrunMs", null] }, 1, 0] } },
          cycleMsSum: { $sum: { $ifNull: ["$cycleMs", 0] } },
          cycleCount: { $sum: { $cond: [{ $ne: ["$cycleMs", null] }, 1, 0] } },
          recent: { $sum: "$recent" },
        },
      },
    ])
    .toArray();

  const t = agg || {
    total: 0, onTime: 0, lateOverrunMs: 0, lateCount: 0, cycleMsSum: 0, cycleCount: 0, recent: 0,
  };
  return {
    total: t.total,
    onTime: t.onTime,
    onTimeRate: t.total ? Math.round((t.onTime / t.total) * 100) : 0,
    late: t.lateCount,
    avgOverrunDays: t.lateCount ? +(t.lateOverrunMs / t.lateCount / DAY_MS).toFixed(1) : 0,
    cycleTimeDays: t.cycleCount ? Math.round(t.cycleMsSum / t.cycleCount / DAY_MS) : 0,
    weeklyThroughput: +(t.recent / 4).toFixed(1),
  };
}

/** Per-assignee six-month completion scorecard with a monthly on-time trend. */
export async function assigneeScorecard({ months = 6 } = {}) {
  const { tasks, users } = await collections();
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);

  const lateExpr = { $and: [{ $ne: ["$endDate", null] }, { $gt: ["$completedAt", "$endDate"] }] };

  const completedRows = await tasks
    .aggregate([
      { $match: { status: "completed", completedAt: { $gte: since }, assigneeId: { $ne: null } } },
      {
        $project: {
          assigneeId: 1,
          division: 1,
          ym: { $dateToString: { format: "%Y-%m", date: "$completedAt" } },
          onTime: {
            $cond: [
              { $or: [{ $eq: ["$endDate", null] }, { $lte: ["$completedAt", "$endDate"] }] },
              1,
              0,
            ],
          },
          overrunMs: { $cond: [lateExpr, { $subtract: ["$completedAt", "$endDate"] }, 0] },
          late: { $cond: [lateExpr, 1, 0] },
        },
      },
      {
        $group: {
          _id: { a: "$assigneeId", ym: "$ym" },
          completed: { $sum: 1 },
          onTime: { $sum: "$onTime" },
          late: { $sum: "$late" },
          overrunMs: { $sum: "$overrunMs" },
          divisions: { $addToSet: "$division" },
        },
      },
    ])
    .toArray();

  const activeRows = await tasks
    .aggregate([
      { $match: { status: { $ne: "completed" }, assigneeId: { $ne: null } } },
      { $group: { _id: "$assigneeId", n: { $sum: 1 }, divisions: { $addToSet: "$division" } } },
    ])
    .toArray();

  const monthKeys = [];
  const cur = new Date(since);
  for (let i = 0; i < months; i++) {
    monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  const byA = new Map();
  const ensure = (id) => {
    if (!byA.has(id))
      byA.set(id, {
        id, completed: 0, onTime: 0, late: 0, overrunMs: 0, months: {}, divisions: new Set(), active: 0,
      });
    return byA.get(id);
  };
  for (const r of completedRows) {
    const a = ensure(String(r._id.a));
    a.completed += r.completed;
    a.onTime += r.onTime;
    a.late += r.late;
    a.overrunMs += r.overrunMs;
    a.months[r._id.ym] = { completed: r.completed, onTime: r.onTime };
    (r.divisions || []).forEach((d) => d && a.divisions.add(d));
  }
  for (const r of activeRows) {
    const a = ensure(String(r._id));
    a.active = r.n;
    (r.divisions || []).forEach((d) => d && a.divisions.add(d));
  }

  const ids = [...byA.keys()];
  const uDocs = ids.length ? await users.find({ _id: { $in: ids.map(oid) } }).toArray() : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  return [...byA.values()]
    .map((a) => ({
      user: uMap.get(a.id)
        ? { id: a.id, name: uMap.get(a.id).name || "", email: uMap.get(a.id).email }
        : { id: a.id, name: "Unknown", email: "" },
      divisions: [...a.divisions].map(divisionLabel),
      completed: a.completed,
      onTime: a.onTime,
      late: a.late,
      onTimeRate: a.completed ? Math.round((a.onTime / a.completed) * 100) : null,
      avgOverrunDays: a.late ? +(a.overrunMs / a.late / DAY_MS).toFixed(1) : 0,
      trend: monthKeys.map((k) => {
        const m = a.months[k];
        return m && m.completed ? Math.round((m.onTime / m.completed) * 100) : null;
      }),
      active: a.active,
    }))
    .sort((x, y) => y.completed - x.completed || y.active - x.active);
}

/** Deterministic narrative summaries built from the SLA aggregates. */
export async function generateBriefs() {
  const [sla, monthly, matrix, scorecard] = await Promise.all([
    deliverySla(),
    slaReport({ months: 3 }),
    statusHeatmap(),
    assigneeScorecard({ months: 6 }),
  ]);

  const briefs = [];
  const generatedAt = new Date().toISOString();

  briefs.push({
    id: "delivery-health",
    title: "Delivery health",
    generatedAt,
    body:
      sla.total === 0
        ? "No work has been completed yet, so there is no delivery record to report on."
        : `The team has closed ${sla.total} task${sla.total === 1 ? "" : "s"} to date at a ${sla.onTimeRate}% on-time rate. ` +
          `${sla.late} slipped past their due date, overrunning by ${sla.avgOverrunDays} day${sla.avgOverrunDays === 1 ? "" : "s"} on average. ` +
          `Median cycle time from creation to completion is about ${sla.cycleTimeDays} day${sla.cycleTimeDays === 1 ? "" : "s"}, ` +
          `and throughput is running near ${sla.weeklyThroughput} task${sla.weeklyThroughput === 1 ? "" : "s"} closed per week (4-week rolling average).`,
  });

  const divRows = Object.entries(matrix)
    .map(([d, m]) => ({ d, overdue: m.overdue || 0, open: (m.open || 0) + (m.in_progress || 0) + (m.in_review || 0) + (m.blocked || 0) }))
    .filter((r) => r.d !== "unknown")
    .sort((a, b) => b.overdue - a.overdue);
  const worst = divRows[0];
  briefs.push({
    id: "time-lost",
    title: "Where time is being lost",
    generatedAt,
    body:
      !worst || worst.overdue === 0
        ? "No division currently has overdue work — every active task is inside its due date."
        : `${divisionLabel(worst.d)} is carrying the most schedule risk with ${worst.overdue} overdue task${worst.overdue === 1 ? "" : "s"} against ${worst.open} in flight. ` +
          divRows
            .slice(1)
            .filter((r) => r.overdue > 0)
            .map((r) => `${divisionLabel(r.d)} has ${r.overdue}`)
            .join(", ") +
          (divRows.slice(1).some((r) => r.overdue > 0) ? " overdue as well." : ""),
  });

  const atRisk = scorecard.filter((s) => s.onTimeRate != null && s.onTimeRate < 70);
  briefs.push({
    id: "people",
    title: "People to check in with",
    generatedAt,
    body:
      atRisk.length === 0
        ? "Every assignee with a completion history is holding a 70%+ on-time rate over the last six months."
        : atRisk
            .map(
              (s) =>
                `${s.user.name || s.user.email} is at ${s.onTimeRate}% on-time (${s.late} of ${s.completed} late, ${s.avgOverrunDays}d average overrun) with ${s.active} active`,
            )
            .join("; ") + ".",
  });

  const trend = monthly.map((m) => (m.slaPct == null ? "–" : `${m.month.slice(5)}: ${m.slaPct}%`)).join("  ·  ");
  briefs.push({
    id: "quarter",
    title: "Last three months",
    generatedAt,
    body: monthly.every((m) => m.total === 0)
      ? "Nothing was completed in the last three months."
      : `On-time rate by month — ${trend}. Total completed: ${monthly.reduce((n, m) => n + m.total, 0)}.`,
  });

  return briefs;
}

// re-export for pages that already import from data.js elsewhere
export { rolesById };
