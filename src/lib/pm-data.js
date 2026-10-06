import { ObjectId } from "mongodb";
import { collections } from "./db";
import { rolesById } from "./data";
import { teamsMap } from "./teams";
import { isOverdue, overdueDays, overdueCutoff, DAY_MS, PRIORITIES } from "./pm-constants";

const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(String(id)));
const iso = (d) => (d ? new Date(d).toISOString() : null);
const teamLabel = (tmap, id) => (id && tmap.get(String(id))?.name) || (id ? String(id) : null) || "—";

/* ------------------------------------------------------------------ projects */

/**
 * Mongo filter limiting projects to ones a user may see: a project whose
 * team(s) they're on, or one they hold a task in. `{}` (everything) for
 * holders of `project:read:all`.
 */
async function projectScopeFilter(user) {
  if (!user || user.can("project:read:all") || user.can("*")) return {};
  const { tasks, teams } = await collections();
  const [myProjectIds, myTeamIds] = await Promise.all([
    tasks.distinct("projectId", {
      $or: [{ assigneeId: oid(user.id) }, { collaboratorIds: oid(user.id) }],
    }),
    teams.distinct("_id", { memberIds: oid(user.id) }),
  ]);
  return { $or: [{ teamIds: { $in: myTeamIds } }, { _id: { $in: myProjectIds } }] };
}

/** Union of member ids across a project's teams — who can be assigned work on it. */
function deriveMemberIds(teamIdStrs, tmap) {
  const set = new Set();
  for (const id of teamIdStrs) {
    for (const m of tmap.get(id)?.memberIds || []) set.add(m);
  }
  return [...set];
}

export function serializeProject(p, taskCounts = {}, tmap = new Map()) {
  const teamIdStrs = (p.teamIds || []).map(String);
  return {
    id: String(p._id),
    name: p.name,
    projectNumber: p.projectNumber || "",
    client: p.client || "",
    description: p.description || "",
    teamIds: teamIdStrs,
    teamNames: teamIdStrs.map((id) => teamLabel(tmap, id)),
    memberIds: deriveMemberIds(teamIdStrs, tmap),
    status: p.status || "onboarding",
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

export async function listProjects({ user, status, team, teams, q } = {}) {
  const { projects, tasks, users } = await collections();
  const teamList = [...(teams || []), ...(team ? [team] : [])].filter(Boolean);
  const query = {};
  if (status) query.status = status;
  if (teamList.length) query.teamIds = { $in: teamList.map(oid) };

  const and = [];
  if (q) {
    and.push({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { client: { $regex: q, $options: "i" } },
      ],
    });
  }
  const scope = await projectScopeFilter(user);
  if (scope.$or) and.push(scope);
  if (and.length) query.$and = and;

  const docs = await projects.find(query).sort({ createdAt: -1, _id: -1 }).toArray();
  const ids = docs.map((d) => d._id);
  const tmap = await teamsMap();

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
            endDate: { $lt: overdueCutoff() },
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
    const base = serializeProject(d, agg, tmap);
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
export async function listProjectOptions({ user } = {}) {
  const { projects } = await collections();
  const scope = await projectScopeFilter(user);
  const docs = await projects
    .find(scope, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((p) => ({ id: String(p._id), name: p.name }));
}

export async function getProject(user, id) {
  const { projects, tasks, users } = await collections();
  let p;
  try {
    const scope = await projectScopeFilter(user);
    p = await projects.findOne({ _id: oid(id), ...scope });
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
    endDate: { $lt: overdueCutoff() },
  });
  const base = serializeProject(p, counts, await teamsMap());
  const [memberDocs, ownerDoc] = await Promise.all([
    base.memberIds.length
      ? users.find({ _id: { $in: base.memberIds.map(oid) } }).toArray()
      : [],
    base.ownerId ? users.findOne({ _id: oid(base.ownerId) }) : null,
  ]);
  return {
    ...base,
    members: memberDocs.map((u) => ({
      id: String(u._id),
      name: u.name || "",
      email: u.email,
      image: u.image || null,
    })),
    owner: ownerDoc
      ? { id: String(ownerDoc._id), name: ownerDoc.name || "", email: ownerDoc.email, image: ownerDoc.image || null }
      : null,
  };
}

/* --------------------------------------------------------------------- tasks */

/**
 * Mongo filter that limits tasks to those a user may see: assigned to them,
 * they're collaborating on, or on a team they're a member of (so a manager
 * sees their whole team's board, not just their own tasks). `{}` for holders
 * of `task:read:all`.
 */
export async function taskScopeFilter(user) {
  if (user.can("task:read:all") || user.can("*")) return {};
  const { teams } = await collections();
  const myTeamIds = await teams.distinct("_id", { memberIds: oid(user.id) });
  const or = [{ assigneeId: oid(user.id) }, { collaboratorIds: oid(user.id) }];
  if (myTeamIds.length) or.push({ teamId: { $in: myTeamIds } });
  return { $or: or };
}

export function serializeTask(t, { project, users, tmap = new Map() } = {}) {
  const u = (id) => {
    if (!id) return null;
    const d = users?.get(String(id));
    return d ? { id: String(d._id), name: d.name || "", email: d.email, image: d.image || null } : { id: String(id) };
  };
  const serializedBlockers = (t.blockers || (t.blocker ? [t.blocker] : [])).map((b) => ({
    active: !!b.active,
    description: b.description || "",
    kind: b.kind || "internal",
    raisedBy: u(b.raisedBy),
    raisedAt: iso(b.raisedAt),
    resolvedAt: iso(b.resolvedAt),
    log: (b.log || []).map((l) => ({ at: iso(l.at), note: l.note, by: u(l.by) })),
  }));
  return {
    id: String(t._id),
    taskNumber: t.taskNumber || "",
    projectId: String(t.projectId),
    project: project ? { id: String(project._id), name: project.name, client: project.client || "" } : null,
    teamId: t.teamId ? String(t.teamId) : null,
    teamName: teamLabel(tmap, t.teamId),
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
    startDate: iso(t.startDate),
    endDate: iso(t.endDate),
    completedAt: iso(t.completedAt),
    overdue: isOverdue(t),
    assignee: u(t.assigneeId),
    collaborators: (t.collaboratorIds || []).map(u).filter(Boolean),
    // Chat-style thread: each entry is a message, a file/link, or both together.
    updates: (t.updates || []).map((e) => ({
      id: e.id,
      text: e.text || "",
      attachment: e.attachment
        ? { type: e.attachment.type, label: e.attachment.label, url: e.attachment.url }
        : null,
      by: u(e.by),
      at: iso(e.at),
    })),
    // Derived count for the board card — every update that carries a file/link.
    attachments: (t.updates || []).filter((e) => e.attachment).map((e) => ({ id: e.id })),
    // Hours logged at each in_progress → in_review submission — task-level
    // time management, visible to managers/admins (task:approve) and to the
    // task's own assignee / collaborators.
    timeLogs: (t.timeLogs || []).map((l) => ({
      hours: l.hours,
      note: l.note || "",
      loggedBy: u(l.loggedBy),
      loggedAt: iso(l.loggedAt),
    })),
    totalLoggedHours: (t.timeLogs || []).reduce((sum, l) => sum + (l.hours || 0), 0),
    // Approximate time set by whoever created/scheduled the task (task:schedule
    // to change it) — the assignee can see it but never edit it.
    estimateMinutes: t.estimateMinutes ?? null,
    // blockers holds the full raise/resolve history; blocker (singular) is
    // kept as the currently-active one, or null, for callers that only care
    // about "is this task blocked right now".
    blockers: serializedBlockers,
    blocker: serializedBlockers.find((b) => b.active) || null,
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
    for (const e of t.updates || []) if (e.by) ids.add(String(e.by));
    for (const b of t.blockers || (t.blocker ? [t.blocker] : [])) {
      if (b.raisedBy) ids.add(String(b.raisedBy));
      for (const l of b.log || []) if (l.by) ids.add(String(l.by));
    }
    for (const l of t.timeLogs || []) if (l.loggedBy) ids.add(String(l.loggedBy));
  }
  if (!ids.size) return new Map();
  const docs = await users.find({ _id: { $in: [...ids].map(oid) } }).toArray();
  return new Map(docs.map((d) => [String(d._id), d]));
}

export async function listTasks(user, filters = {}) {
  const { tasks, projects } = await collections();
  const {
    projectId, projectIds,
    team, teams,
    status, statuses,
    assigneeId, assigneeIds,
    priorities,
    approval, overdue, blocked, dueFrom, dueTo, q,
  } = filters;

  const arr = (single, plural) =>
    [...(plural || []), ...(single ? [single] : [])].filter(Boolean);
  const oidList = (single, plural) =>
    arr(single, plural)
      .filter((v) => ObjectId.isValid(v))
      .map((v) => new ObjectId(String(v)));
  const projList = oidList(projectId, projectIds);
  const teamList = oidList(team, teams);
  const asgList = oidList(assigneeId, assigneeIds);
  // "Blocked" is its own quick filter but is still just a status value, so it
  // folds into the same status set as the status pills (open/in progress/…).
  const statusSet = new Set(arr(status, statuses));
  if (blocked) statusSet.add("blocked");

  const query = { ...(await taskScopeFilter(user)) };
  if (projList.length) query.projectId = { $in: projList };
  if (teamList.length) query.teamId = { $in: teamList };
  if (asgList.length) query.assigneeId = { $in: asgList };
  if (priorities?.length) query.priority = { $in: priorities };
  if (statusSet.size === 1) query.status = [...statusSet][0];
  else if (statusSet.size > 1) query.status = { $in: [...statusSet] };
  if (approval) query.approval = approval;

  // Due-date range and "overdue" both constrain `endDate` — merge them into
  // one range instead of letting the later one clobber the earlier.
  const endDateRange = {};
  if (overdue) {
    query.status = { $ne: "completed" };
    endDateRange.$lt = overdueCutoff();
  }
  if (dueFrom) endDateRange.$gte = new Date(`${dueFrom}T00:00:00`);
  if (dueTo) endDateRange.$lte = new Date(`${dueTo}T23:59:59.999`);
  if (Object.keys(endDateRange).length) query.endDate = endDateRange;

  if (q) query.title = { $regex: q, $options: "i" };

  const docs = await tasks.find(query).sort({ endDate: 1, priority: -1, _id: -1 }).toArray();
  const [userMap, projDocs, tmap] = await Promise.all([
    hydrateUsers(docs),
    projects.find({ _id: { $in: [...new Set(docs.map((d) => String(d.projectId)))].map(oid) } }).toArray(),
    teamsMap(),
  ]);
  const projMap = new Map(projDocs.map((p) => [String(p._id), p]));
  return docs.map((t) =>
    serializeTask(t, { project: projMap.get(String(t.projectId)), users: userMap, tmap }),
  );
}

export async function getTask(user, id) {
  const { tasks, projects } = await collections();
  let t;
  try {
    t = await tasks.findOne({ _id: oid(id), ...(await taskScopeFilter(user)) });
  } catch {
    return null;
  }
  if (!t) return null;
  const [userMap, project, tmap] = await Promise.all([
    hydrateUsers([t]),
    projects.findOne({ _id: t.projectId }),
    teamsMap(),
  ]);
  return serializeTask(t, { project, users: userMap, tmap });
}

export async function taskStats(user) {
  const { tasks } = await collections();
  const scope = await taskScopeFilter(user);
  const rows = await tasks
    .aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  const out = { total: 0, open: 0, in_progress: 0, in_review: 0, blocked: 0, completed: 0, overdue: 0, awaitingApproval: 0 };
  for (const r of rows) {
    out[r._id] = r.n;
    out.total += r.n;
  }
  out.overdue = await tasks.countDocuments({ ...scope, status: { $ne: "completed" }, endDate: { $lt: overdueCutoff() } });
  out.awaitingApproval = await tasks.countDocuments({ ...scope, approval: "pending" });
  return out;
}

/* ----------------------------------------------------------------- analytics */

export async function analyticsOverview(user) {
  const { tasks, projects } = await collections();
  const scope = await taskScopeFilter(user);
  const pScope = await projectScopeFilter(user);

  const [byStatus, byTeam, byPriority, totals] = await Promise.all([
    tasks.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([{ $match: scope }, { $group: { _id: "$teamId", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([{ $match: scope }, { $group: { _id: "$priority", n: { $sum: 1 } } }]).toArray(),
    tasks.aggregate([
      { $match: scope },
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

  const overdue = await tasks.countDocuments({ ...scope, status: { $ne: "completed" }, endDate: { $lt: overdueCutoff() } });
  const awaitingApproval = await tasks.countDocuments({ ...scope, approval: "pending" });
  const activeProjects = await projects.countDocuments({ ...pScope, status: { $in: ["onboarding", "active"] } });

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
    byTeam: Object.fromEntries(byTeam.map((r) => [r._id ? String(r._id) : "unknown", r.n])),
    byPriority: Object.fromEntries(byPriority.map((r) => [r._id || "unknown", r.n])),
  };
}

/** Per-assignee rollup — the "Global Assignee Task View" (team-scoped for Managers). */
export async function globalAssigneeView(user) {
  const { tasks, users } = await collections();
  const scope = await taskScopeFilter(user);
  const rows = await tasks
    .aggregate([
      { $match: { ...scope, assigneeId: { $ne: null } } },
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
                { $and: [{ $ne: ["$status", "completed"] }, { $lt: ["$endDate", overdueCutoff()] }] },
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
export async function calendarTasks({ from, to, user }) {
  const { tasks, projects } = await collections();
  const scope = await taskScopeFilter(user);
  const docs = await tasks
    .find({ ...scope, endDate: { $gte: new Date(from), $lte: new Date(to) } })
    .sort({ endDate: 1 })
    .toArray();
  const [userMap, projDocs, tmap] = await Promise.all([
    hydrateUsers(docs),
    projects.find({ _id: { $in: [...new Set(docs.map((d) => String(d.projectId)))].map(oid) } }).toArray(),
    teamsMap(),
  ]);
  const projMap = new Map(projDocs.map((p) => [String(p._id), p]));
  return docs.map((t) => serializeTask(t, { project: projMap.get(String(t.projectId)), users: userMap, tmap }));
}

/** team × status matrix for the overdue / status heatmap (team-scoped for Managers). */
export async function statusHeatmap(user) {
  const { tasks } = await collections();
  const scope = await taskScopeFilter(user);
  const rows = await tasks
    .aggregate([{ $match: scope }, { $group: { _id: { d: "$teamId", s: "$status" }, n: { $sum: 1 } } }])
    .toArray();
  const overdueRows = await tasks
    .aggregate([
      { $match: { ...scope, status: { $ne: "completed" }, endDate: { $lt: overdueCutoff() } } },
      { $group: { _id: "$teamId", n: { $sum: 1 } } },
    ])
    .toArray();
  const matrix = {};
  for (const r of rows) {
    const d = r._id.d ? String(r._id.d) : "unknown";
    matrix[d] = matrix[d] || {};
    matrix[d][r._id.s] = r.n;
  }
  for (const r of overdueRows) {
    const d = r._id ? String(r._id) : "unknown";
    matrix[d] = matrix[d] || {};
    matrix[d].overdue = r.n;
  }
  return matrix;
}

/** Monthly on-time vs overdue completion history (SLA report; team-scoped for Managers). */
export async function slaReport({ months = 6, user } = {}) {
  const { tasks } = await collections();
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);
  const scope = await taskScopeFilter(user);

  const rows = await tasks
    .aggregate([
      { $match: { ...scope, status: "completed", completedAt: { $gte: since } } },
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

/** Headline delivery metrics across completed work (team-scoped for Managers). */
export async function deliverySla(user) {
  const { tasks } = await collections();
  const fourWeeksAgo = new Date(Date.now() - 28 * DAY_MS);
  const scope = await taskScopeFilter(user);

  const [agg] = await tasks
    .aggregate([
      { $match: { ...scope, status: "completed", completedAt: { $ne: null } } },
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

/**
 * Cumulative time-in-system by team over the last 90 days — the "where the
 * time actually goes" view. Active tasks count from creation to now; completed
 * tasks count their full cycle time if they closed inside the window.
 * Team-scoped for Managers.
 */
export async function teamLoad(user) {
  const { tasks } = await collections();
  const now = Date.now();
  const since = now - 90 * DAY_MS;
  const scope = await taskScopeFilter(user);

  const [docs, tmap] = await Promise.all([
    tasks
      .find(scope, { projection: { teamId: 1, status: 1, createdAt: 1, completedAt: 1, endDate: 1 } })
      .toArray(),
    teamsMap(),
  ]);

  const byD = new Map();
  for (const t of docs) {
    const key = t.teamId ? String(t.teamId) : "unknown";
    if (!byD.has(key)) byD.set(key, { team: key, total: 0, overdue: 0, late: 0, hours: 0 });
    const row = byD.get(key);
    row.total += 1;
    const created = +new Date(t.createdAt || 0) || now;
    if (t.status === "completed") {
      const done = +new Date(t.completedAt || t.createdAt || now);
      if (done >= since) row.hours += Math.max(0, (done - created) / 3600000);
      if (t.endDate && done > +new Date(t.endDate)) row.late += 1;
    } else {
      row.hours += Math.max(0, (now - created) / 3600000);
      if (t.endDate && +new Date(t.endDate) < now - DAY_MS) {
        row.overdue += 1;
        row.late += 1;
      }
    }
  }

  return [...byD.values()]
    .filter((r) => r.total > 0)
    .map((r) => ({ ...r, label: teamLabel(tmap, r.team === "unknown" ? null : r.team), hours: Math.round(r.hours) }))
    .sort((a, b) => b.hours - a.hours);
}

/** Per-assignee six-month completion scorecard with a monthly on-time trend (team-scoped for Managers). */
export async function assigneeScorecard({ months = 6, user } = {}) {
  const { tasks, users } = await collections();
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1), 1);
  since.setHours(0, 0, 0, 0);
  const scope = await taskScopeFilter(user);

  const lateExpr = { $and: [{ $ne: ["$endDate", null] }, { $gt: ["$completedAt", "$endDate"] }] };

  const completedRows = await tasks
    .aggregate([
      { $match: { ...scope, status: "completed", completedAt: { $gte: since }, assigneeId: { $ne: null } } },
      {
        $project: {
          assigneeId: 1,
          teamId: 1,
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
          teams: { $addToSet: "$teamId" },
        },
      },
    ])
    .toArray();

  const activeRows = await tasks
    .aggregate([
      { $match: { ...scope, status: { $ne: "completed" }, assigneeId: { $ne: null } } },
      { $group: { _id: "$assigneeId", n: { $sum: 1 }, teams: { $addToSet: "$teamId" } } },
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
        id, completed: 0, onTime: 0, late: 0, overrunMs: 0, months: {}, teams: new Set(), active: 0,
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
    (r.teams || []).forEach((d) => d && a.teams.add(String(d)));
  }
  for (const r of activeRows) {
    const a = ensure(String(r._id));
    a.active = r.n;
    (r.teams || []).forEach((d) => d && a.teams.add(String(d)));
  }

  const ids = [...byA.keys()];
  const [uDocs, tmap] = await Promise.all([
    ids.length ? users.find({ _id: { $in: ids.map(oid) } }).toArray() : [],
    teamsMap(),
  ]);
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  return [...byA.values()]
    .map((a) => ({
      user: uMap.get(a.id)
        ? { id: a.id, name: uMap.get(a.id).name || "", email: uMap.get(a.id).email }
        : { id: a.id, name: "Unknown", email: "" },
      teams: [...a.teams].map((k) => teamLabel(tmap, k)),
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

/* ---------------------------------------------------------- generated briefs */

const prioLabel = (k) => PRIORITIES.find((p) => p.key === k)?.label || null;
const bullets = (arr) => arr.map((x) => ` · ${x}`).join("\n");
const shortDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Priority + overdue annotation, e.g. " (High, 29 days overdue)". */
function annotate(t) {
  const bits = [];
  const p = prioLabel(t.priority);
  if (p === "High" || p === "Critical") bits.push(p);
  if (t.status !== "completed" && t.endDate && new Date(t.endDate) < overdueCutoff()) {
    const d = overdueDays(t.endDate);
    bits.push(d > 0 ? `${d} day${d === 1 ? "" : "s"} overdue` : "overdue");
  }
  return bits.length ? ` (${bits.join(", ")})` : "";
}

/**
 * One stand-up per active assignee, composed from their live task state:
 * MOVED (just completed) / TODAY (in flight) / BLOCKED / NEEDS A DECISION (overdue).
 * Team-scoped for Managers.
 */
export async function assigneeStandups(user) {
  const { tasks, users } = await collections();
  const now = new Date();
  const movedSince = new Date(Date.now() - 3 * 86400000);
  const today = shortDate(now);
  const scope = await taskScopeFilter(user);

  const docs = await tasks.find({ ...scope, assigneeId: { $ne: null } }).toArray();
  const byA = new Map();
  for (const t of docs) {
    const k = String(t.assigneeId);
    if (!byA.has(k)) byA.set(k, []);
    byA.get(k).push(t);
  }
  const uDocs = byA.size
    ? await users.find({ _id: { $in: [...byA.keys()].map(oid) } }).toArray()
    : [];
  const uMap = new Map(uDocs.map((u) => [String(u._id), u]));

  const out = [];
  for (const [id, list] of byA) {
    const u = uMap.get(id);
    if (!u || u.status !== "active") continue;
    const name = u.name || u.email;

    const moved = list
      .filter((t) => t.status === "completed" && t.completedAt && new Date(t.completedAt) >= movedSince)
      .map((t) => `${t.title} → Completed`);
    const inFlight = list
      .filter((t) => t.status === "in_progress" || t.status === "in_review")
      .sort((a, b) => new Date(a.endDate || 8.64e15) - new Date(b.endDate || 8.64e15))
      .map((t) => `${t.title}${annotate(t)}`);
    const blocked = list
      .filter((t) => t.status === "blocked")
      .map(
        (t) =>
          `${t.title} — ${t.blocker?.kind === "client_side" ? "CLIENT" : "INTERNAL"}: ${t.blocker?.description || "no detail recorded"}`,
      );
    const decisions = list
      .filter((t) => t.status !== "completed" && t.endDate && new Date(t.endDate) < overdueCutoff())
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
      .map((t) => `${t.title} — ${overdueDays(t.endDate)} days past the due date`);

    const sec = [`${name} — stand-up, ${today}`];
    if (moved.length) sec.push(`\nMOVED\n${bullets(moved)}`);
    if (inFlight.length) sec.push(`\nTODAY\n${bullets(inFlight)}`);
    if (blocked.length) sec.push(`\nBLOCKED\n${bullets(blocked)}`);
    if (decisions.length) sec.push(`\nNEEDS A DECISION\n${bullets(decisions)}`);
    if (sec.length === 1) sec.push("\nNo active work assigned.");

    out.push({
      id,
      person: { id, name: u.name || "", email: u.email },
      attention: blocked.length + decisions.length,
      active: inFlight.length,
      body: sec.join("\n"),
    });
  }

  return out.sort((a, b) => b.attention - a.attention || b.active - a.active);
}

/**
 * One client-facing status update per project — a copy-ready summary of what
 * shipped, what's in flight, and what needs the client. Scoped to the
 * projects the viewer can see (own team for a Manager).
 */
export async function clientStatusUpdates(user) {
  const projs = await listProjects({ user });
  if (!projs.length) return [];
  const { tasks } = await collections();
  const now = new Date();
  const twoWeeks = new Date(Date.now() - 14 * 86400000);
  const today = shortDate(now);

  const taskDocs = await tasks
    .find({ projectId: { $in: projs.map((p) => new ObjectId(p.id)) } })
    .toArray();
  const byP = new Map();
  for (const t of taskDocs) {
    const k = String(t.projectId);
    if (!byP.has(k)) byP.set(k, []);
    byP.get(k).push(t);
  }

  return projs.map((p) => {
    const list = byP.get(p.id) || [];
    const shipped = list
      .filter((t) => t.status === "completed" && t.completedAt && new Date(t.completedAt) >= twoWeeks)
      .map((t) => t.title);
    const inFlight = list
      .filter((t) => t.status === "in_progress")
      .map((t) => {
        if (!t.endDate || new Date(t.endDate) >= overdueCutoff()) return t.title;
        const d = overdueDays(t.endDate);
        return `${t.title} — ${d > 0 ? `${d} days overdue` : "overdue"}`;
      });
    const review = [
      ...new Set(
        list.filter((t) => t.status === "in_review" || t.approval === "pending").map((t) => t.title),
      ),
    ];

    const target = p.targetDate
      ? `, with ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} to the target date of ${shortDate(p.targetDate)}`
      : "";
    const summary = p.taskCounts.total
      ? `The programme is ${p.completionPct}% complete across ${p.taskCounts.total} tracked workstream${p.taskCounts.total === 1 ? "" : "s"}${target}.`
      : "No tracked workstreams have been scoped yet.";

    const sec = [
      `${p.name} — status update`,
      `Prepared for ${p.client || "the client"} · ${today}`,
      `\n${summary}`,
    ];
    if (shipped.length) sec.push(`\nSHIPPED IN THE LAST TWO WEEKS\n${bullets(shipped)}`);
    if (inFlight.length) sec.push(`\nIN FLIGHT\n${bullets(inFlight)}`);
    if (review.length) sec.push(`\nWITH YOU FOR REVIEW\n${bullets(review)}`);

    return {
      id: p.id,
      project: { id: p.id, name: p.name, client: p.client || "" },
      completionPct: p.completionPct,
      body: sec.join("\n"),
    };
  });
}

// re-export for pages that already import from data.js elsewhere
export { rolesById };
