"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { notifyUser, notifyUsers, notifyByPermission } from "@/lib/notifications";
import { nextTaskNumber } from "@/lib/pm-ids";
import {
  PRIORITY_KEYS,
  TASK_STATUSES,
  canForward,
  BLOCKER_KINDS,
} from "@/lib/pm-constants";

const oid = (id) => new ObjectId(String(id));
const bump = (paths) => paths.forEach((p) => revalidatePath(p));

/** A user may act on a task's lifecycle if they can approve, or they're the
 *  assignee / a collaborator with task:transition. */
async function loadActableTask(taskId, { need = "task:transition" } = {}) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return { error: "Not signed in." };
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(taskId) });
  if (!task) return { error: "Task not found." };

  const isOwner =
    String(task.assigneeId) === me.id ||
    (task.collaboratorIds || []).some((c) => String(c) === me.id);
  const privileged = me.can("task:approve");

  if (need === "task:approve" && !privileged) return { error: "Needs approval permission." };
  if (!privileged && !(isOwner && me.can("task:transition"))) {
    return { error: "You can only act on tasks assigned to you." };
  }
  return { me, task, tasks, isOwner, privileged };
}

/** Notes and attachments: open to an admin (task:update) or the task's
 *  assignee / a collaborator — no task:transition requirement. */
async function loadContributableTask(taskId) {
  const me = await getCurrentUser();
  if (!me || me.status !== "active") return { error: "Not signed in." };
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(taskId) });
  if (!task) return { error: "Task not found." };

  const isOwner =
    String(task.assigneeId) === me.id ||
    (task.collaboratorIds || []).some((c) => String(c) === me.id);
  if (!me.can("task:update") && !isOwner) {
    return { error: "You can only add to tasks assigned to you." };
  }
  return { me, task, tasks, isOwner };
}

/* ------------------------------------------------------------------- create */

const TaskInput = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().default(""),
  division: z.string().min(1),
  priority: z.enum(PRIORITY_KEYS).default("medium"),
  assigneeId: z.string().optional().default(""),
  collaboratorIds: z.array(z.string()).optional().default([]),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  clientVisible: z.boolean().optional().default(false),
});

export async function createTask(_prev, formData) {
  const actor = await assertPermission("task:create");
  const parsed = TaskInput.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description") || "",
    division: formData.get("division"),
    priority: formData.get("priority") || "medium",
    assigneeId: formData.get("assigneeId") || "",
    collaboratorIds: formData.getAll("collaboratorIds").map(String).filter(Boolean),
    startDate: formData.get("startDate") || "",
    endDate: formData.get("endDate") || "",
    clientVisible: formData.get("clientVisible") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const d = parsed.data;
  const { tasks, projects } = await collections();
  const project = await projects.findOne({ _id: oid(d.projectId) });
  if (!project) return { ok: false, error: "Project not found." };
  if (!(project.divisions || []).includes(d.division)) {
    return { ok: false, error: "That division isn't assigned to this project." };
  }
  if (d.startDate && d.endDate && new Date(d.startDate) > new Date(d.endDate)) {
    return { ok: false, error: "Start date must be on or before the end date." };
  }
  if (project.memberIds?.length) {
    const allowed = new Set(project.memberIds.map(String));
    if (d.assigneeId && !allowed.has(d.assigneeId)) {
      return { ok: false, error: "Assignee must be a member of this project." };
    }
    if (d.collaboratorIds.some((c) => !allowed.has(c))) {
      return { ok: false, error: "Collaborators must be members of this project." };
    }
  }

  const now = new Date();
  const taskNumber = await nextTaskNumber(project);
  const res = await tasks.insertOne({
    projectId: project._id,
    taskNumber,
    division: d.division,
    title: d.title,
    description: d.description,
    priority: d.priority,
    status: "open",
    statusBeforeBlock: null,
    approval: "none",
    approvalNote: "",
    revisionCount: 0,
    clientVisible: d.clientVisible,
    startDate: d.startDate ? new Date(d.startDate) : null,
    endDate: d.endDate ? new Date(d.endDate) : null,
    assigneeId: d.assigneeId ? oid(d.assigneeId) : null,
    collaboratorIds: d.collaboratorIds.map(oid),
    updates: [],
    timeLogs: [],
    blocker: null,
    completedAt: null,
    overdueNotifiedAt: null,
    createdBy: oid(actor.id),
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit({
    actorId: actor.id,
    action: "task.create",
    targetType: "task",
    targetId: res.insertedId,
    meta: { title: d.title, taskNumber, project: project.name, division: d.division },
  });
  if (d.assigneeId) {
    await notifyUser({
      userId: d.assigneeId,
      actorId: actor.id,
      type: "task.assigned",
      title: `You were assigned: ${d.title}`,
      body: project.name,
      link: `/tasks/${res.insertedId}`,
    });
  }
  bump(["/tasks", `/projects/${d.projectId}`, "/analytics"]);
  return { ok: true, id: String(res.insertedId), redirect: `/tasks/${res.insertedId}` };
}

/* --------------------------------------------------------------- edit fields */

export async function updateTask(_prev, formData) {
  const actor = await assertPermission("task:update");
  const id = String(formData.get("id") || "");
  const { tasks, projects } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };

  const schema = z.object({
    title: z.string().min(2).max(200),
    description: z.string().max(5000).optional().default(""),
    priority: z.enum(PRIORITY_KEYS),
  });
  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || "",
    priority: formData.get("priority") || "medium",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };

  const patch = { ...parsed.data, updatedAt: new Date() };
  let newCollaborators = null;
  if (formData.has("collaboratorIds")) {
    const ids = formData.getAll("collaboratorIds").map(String).filter(Boolean);
    const project = await projects.findOne({ _id: task.projectId });
    if (project?.memberIds?.length) {
      const allowed = new Set(project.memberIds.map(String));
      if (ids.some((c) => !allowed.has(c))) {
        return { ok: false, error: "Collaborators must be members of this project." };
      }
    }
    newCollaborators = ids;
    patch.collaboratorIds = ids.map(oid);
  }
  await tasks.updateOne({ _id: task._id }, { $set: patch });
  await writeAudit({ actorId: actor.id, action: "task.update", targetType: "task", targetId: task._id, meta: {} });

  if (newCollaborators) {
    const before = new Set((task.collaboratorIds || []).map(String));
    const added = newCollaborators.filter((c) => !before.has(c));
    if (added.length) {
      await notifyUsers({
        userIds: added,
        actorId: actor.id,
        type: "task.collaborator_added",
        title: `You're now collaborating on: ${patch.title}`,
        body: "",
        link: `/tasks/${id}`,
      });
    }
  }
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`]);
  return { ok: true };
}

export async function scheduleTask(_prev, formData) {
  const actor = await assertPermission("task:schedule");
  const id = String(formData.get("id") || "");
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return { ok: false, error: "Start date must be on or before the end date." };
  }
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };

  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        // A new deadline clears any prior overdue alert, so a task that
        // slips again under its new date gets a fresh one.
        overdueNotifiedAt: null,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: actor.id,
    action: "task.schedule",
    targetType: "task",
    targetId: task._id,
    meta: { startDate, endDate },
  });
  bump(["/tasks", `/tasks/${id}`, "/analytics"]);
  return { ok: true };
}

export async function assignTask(_prev, formData) {
  const actor = await assertPermission("task:assign");
  const id = String(formData.get("id") || "");
  const assigneeId = String(formData.get("assigneeId") || "");
  const { tasks, users, projects } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };
  if (assigneeId) {
    const u = await users.findOne({ _id: oid(assigneeId) });
    if (!u) return { ok: false, error: "User not found." };
    if (u.status !== "active") return { ok: false, error: "That user is not active." };
    const project = await projects.findOne({ _id: task.projectId });
    if (project?.memberIds?.length && !project.memberIds.some((m) => String(m) === assigneeId)) {
      return { ok: false, error: "Assignee must be a member of this project." };
    }
  }
  await tasks.updateOne(
    { _id: task._id },
    { $set: { assigneeId: assigneeId ? oid(assigneeId) : null, updatedAt: new Date() } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "task.assign",
    targetType: "task",
    targetId: task._id,
    meta: { assigneeId: assigneeId || null },
  });
  if (assigneeId && assigneeId !== String(task.assigneeId || "")) {
    await notifyUser({
      userId: assigneeId,
      actorId: actor.id,
      type: "task.assigned",
      title: `You were assigned: ${task.title}`,
      link: `/tasks/${id}`,
    });
  }
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

export async function setTaskClientVisible(_prev, formData) {
  const actor = await assertPermission("task:update");
  const id = String(formData.get("id") || "");
  const clientVisible = formData.get("clientVisible") === "true" || formData.get("clientVisible") === "on";
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };
  await tasks.updateOne({ _id: task._id }, { $set: { clientVisible, updatedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    action: "task.visibility",
    targetType: "task",
    targetId: task._id,
    meta: { clientVisible },
  });
  bump(["/tasks", `/tasks/${id}`]);
  return { ok: true };
}

/* --------------------------------------------------------------------- updates */

/**
 * A single entry in the task's chat-style thread: a message, a file/link, or
 * both together in one post. Open to the same audience — admin (task:update),
 * or the task's assignee / a collaborator.
 */
export async function addTaskUpdate(_prev, formData) {
  const id = String(formData.get("id") || "");
  const text = String(formData.get("text") || "").trim();
  const attachLabel = String(formData.get("attachLabel") || "").trim();
  const attachUrl = String(formData.get("attachUrl") || "").trim();
  const attachType = String(formData.get("attachType") || "gdoc");

  const hasAttachment = !!(attachLabel || attachUrl);
  if (!text && !hasAttachment) {
    return { ok: false, error: "Write a message or attach a file/link." };
  }
  if (hasAttachment) {
    if (!attachLabel || !attachUrl) {
      return { ok: false, error: "A file/link needs both a label and a URL." };
    }
    if (!z.string().url().safeParse(attachUrl).success) {
      return { ok: false, error: "That doesn't look like a valid URL." };
    }
    if (!["file", "gdoc"].includes(attachType)) {
      return { ok: false, error: "Invalid attachment type." };
    }
  }

  const ctx = await loadContributableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;

  const entry = {
    id: randomUUID(),
    text,
    attachment: hasAttachment ? { type: attachType, label: attachLabel, url: attachUrl } : null,
    by: oid(me.id),
    at: new Date(),
  };
  await tasks.updateOne(
    { _id: task._id },
    { $push: { updates: entry }, $set: { updatedAt: new Date() } },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.update.add",
    targetType: "task",
    targetId: task._id,
    meta: { hasText: !!text, hasAttachment },
  });
  bump([`/tasks/${id}`]);
  return { ok: true };
}

export async function removeTaskUpdate(_prev, formData) {
  const id = String(formData.get("id") || "");
  const updateId = String(formData.get("updateId") || "");
  const ctx = await loadContributableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;

  const entry = (task.updates || []).find((e) => e.id === updateId);
  if (!entry) return { ok: false, error: "Not found." };
  if (!me.can("task:update") && String(entry.by) !== me.id) {
    return { ok: false, error: "You can only remove your own posts." };
  }

  await tasks.updateOne(
    { _id: task._id },
    { $pull: { updates: { id: updateId } }, $set: { updatedAt: new Date() } },
  );
  await writeAudit({ actorId: me.id, action: "task.update.remove", targetType: "task", targetId: task._id, meta: { updateId } });
  bump([`/tasks/${id}`]);
  return { ok: true };
}

/* ------------------------------------------------------------ state machine */

export async function transitionTask(_prev, formData) {
  const id = String(formData.get("id") || "");
  const to = String(formData.get("to") || "");
  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;

  if (task.status === "blocked") return { ok: false, error: "Resolve the blocker first." };
  if (task.status === "completed") return { ok: false, error: "Task is completed. An admin can reopen it." };
  if (task.status === "in_progress" && to === "in_review") {
    return { ok: false, error: "Log your hours to submit for review." };
  }
  if (!canForward(task.status, to)) {
    return { ok: false, error: `Can't move from ${task.status} to ${to}.` };
  }

  const patch = { status: to, updatedAt: new Date() };
  if (to === "in_progress") patch.approval = "none";

  await tasks.updateOne({ _id: task._id }, { $set: patch });
  await writeAudit({
    actorId: me.id,
    action: "task.transition",
    targetType: "task",
    targetId: task._id,
    meta: { from: task.status, to },
  });
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

/**
 * The only door from in_progress to in_review — requires logging the hours
 * spent, so managers/admins can see real time-on-task, not just lifecycle
 * dates. Each submission appends a log entry (a task may be rejected and
 * resubmitted more than once).
 */
export async function submitForReview(_prev, formData) {
  const id = String(formData.get("id") || "");
  const hours = Number(String(formData.get("hours") || "").trim());
  const note = String(formData.get("note") || "").trim();
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { ok: false, error: "Enter the hours you spent (0–24)." };
  }

  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (task.status !== "in_progress") {
    return { ok: false, error: "Only an in-progress task can be submitted for review." };
  }

  const now = new Date();
  await tasks.updateOne(
    { _id: task._id },
    {
      $set: { status: "in_review", approval: "none", updatedAt: now },
      $push: { timeLogs: { hours, note, loggedBy: oid(me.id), loggedAt: now } },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.transition",
    targetType: "task",
    targetId: task._id,
    meta: { from: "in_progress", to: "in_review", hours },
  });
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

export async function raiseBlocker(_prev, formData) {
  const id = String(formData.get("id") || "");
  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;

  if (task.status === "blocked") return { ok: false, error: "Already blocked." };
  if (task.status === "completed") return { ok: false, error: "Task is completed." };

  const parsed = z
    .object({
      description: z.string().min(3).max(2000),
      kind: z.enum(BLOCKER_KINDS.map((b) => b.key)),
    })
    .safeParse({
      description: formData.get("description"),
      kind: formData.get("kind") || "internal",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Describe the blocker" };

  const now = new Date();
  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        status: "blocked",
        statusBeforeBlock: task.status,
        blocker: {
          active: true,
          description: parsed.data.description,
          kind: parsed.data.kind,
          raisedBy: oid(me.id),
          raisedAt: now,
          resolvedAt: null,
          log: [{ at: now, by: oid(me.id), note: `Blocker raised: ${parsed.data.description}` }],
        },
        updatedAt: now,
      },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.blocker.raise",
    targetType: "task",
    targetId: task._id,
    meta: { kind: parsed.data.kind, from: task.status },
  });
  await notifyUsers({
    userIds: [task.assigneeId, ...(task.collaboratorIds || [])].filter(Boolean).map(String),
    actorId: me.id,
    type: "task.blocked",
    title: `Blocked: ${task.title}`,
    body: parsed.data.description,
    link: `/tasks/${id}`,
  });
  // Blockers need someone who can unblock or approve around it — loop in
  // managers/admins (task:approve holders), not just the task's own people.
  await notifyByPermission({
    permission: "task:approve",
    actorId: me.id,
    type: "task.blocked",
    title: `Blocked: ${task.title}`,
    body: parsed.data.description,
    link: `/tasks/${id}`,
  });
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

export async function appendBlockerNote(_prev, formData) {
  const id = String(formData.get("id") || "");
  const note = String(formData.get("note") || "").trim();
  if (!note) return { ok: false, error: "Note is empty." };
  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (!task.blocker?.active) return { ok: false, error: "No active blocker." };

  await tasks.updateOne(
    { _id: task._id },
    { $push: { "blocker.log": { at: new Date(), by: oid(me.id), note } }, $set: { updatedAt: new Date() } },
  );
  bump([`/tasks/${id}`]);
  return { ok: true };
}

export async function resolveBlocker(_prev, formData) {
  const id = String(formData.get("id") || "");
  const note = String(formData.get("note") || "").trim() || "Blocker resolved";
  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (task.status !== "blocked") return { ok: false, error: "Task is not blocked." };

  const back = task.statusBeforeBlock || "in_progress";
  const now = new Date();
  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        status: back,
        statusBeforeBlock: null,
        "blocker.active": false,
        "blocker.resolvedAt": now,
        updatedAt: now,
      },
      $push: { "blocker.log": { at: now, by: oid(me.id), note } },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.blocker.resolve",
    targetType: "task",
    targetId: task._id,
    meta: { resumedAt: back },
  });
  await notifyUsers({
    userIds: [task.assigneeId, ...(task.collaboratorIds || [])].filter(Boolean).map(String),
    actorId: me.id,
    type: "task.unblocked",
    title: `Unblocked: ${task.title}`,
    link: `/tasks/${id}`,
  });
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

/* --------------------------------------------------------- approval gateway */

export async function submitForApproval(_prev, formData) {
  const id = String(formData.get("id") || "");
  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (task.status !== "in_review") {
    return { ok: false, error: "Move the task to In Review before requesting approval." };
  }
  await tasks.updateOne(
    { _id: task._id },
    { $set: { approval: "pending", updatedAt: new Date() } },
  );
  await writeAudit({ actorId: me.id, action: "task.approval.request", targetType: "task", targetId: task._id, meta: {} });
  await notifyByPermission({
    permission: "task:approve",
    actorId: me.id,
    type: "task.approval_requested",
    title: `Approval requested: ${task.title}`,
    link: `/tasks/${id}`,
  });
  bump(["/tasks", `/tasks/${id}`, "/analytics"]);
  return { ok: true };
}

export async function approveTask(_prev, formData) {
  const id = String(formData.get("id") || "");
  const ctx = await loadActableTask(id, { need: "task:approve" });
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (task.status === "completed") return { ok: false, error: "Already completed." };

  const now = new Date();
  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        status: "completed",
        approval: "approved",
        approvalNote: String(formData.get("note") || ""),
        approvedBy: oid(me.id),
        approvedAt: now,
        completedAt: now,
        updatedAt: now,
      },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.approve",
    targetType: "task",
    targetId: task._id,
    meta: { onTime: task.endDate ? now <= new Date(task.endDate) : true },
  });
  if (task.assigneeId) {
    await notifyUser({
      userId: task.assigneeId,
      actorId: me.id,
      type: "task.approved",
      title: `Approved: ${task.title}`,
      link: `/tasks/${id}`,
    });
  }
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

export async function rejectTask(_prev, formData) {
  const id = String(formData.get("id") || "");
  const note = String(formData.get("note") || "").trim();
  if (!note) return { ok: false, error: "Add a note describing the revisions needed." };
  const ctx = await loadActableTask(id, { need: "task:approve" });
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;

  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        status: "in_progress",
        approval: "rejected",
        approvalNote: note,
        updatedAt: new Date(),
      },
      $inc: { revisionCount: 1 },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "task.reject",
    targetType: "task",
    targetId: task._id,
    meta: { note },
  });
  if (task.assigneeId) {
    await notifyUser({
      userId: task.assigneeId,
      actorId: me.id,
      type: "task.rejected",
      title: `Revisions requested: ${task.title}`,
      body: note,
      link: `/tasks/${id}`,
    });
  }
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

export async function reopenTask(_prev, formData) {
  const id = String(formData.get("id") || "");
  const ctx = await loadActableTask(id, { need: "task:approve" });
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks } = ctx;
  if (task.status !== "completed") return { ok: false, error: "Task is not completed." };

  await tasks.updateOne(
    { _id: task._id },
    {
      $set: {
        status: "in_progress",
        approval: "none",
        completedAt: null,
        overdueNotifiedAt: null,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({ actorId: me.id, action: "task.reopen", targetType: "task", targetId: task._id, meta: {} });
  if (task.assigneeId) {
    await notifyUser({
      userId: task.assigneeId,
      actorId: me.id,
      type: "task.reopened",
      title: `Reopened: ${task.title}`,
      link: `/tasks/${id}`,
    });
  }
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
}

/**
 * Move a task to a target column (drag & drop). Routes to the right lifecycle
 * operation based on where it is and where it's going.
 */
export async function moveTask(_prev, formData) {
  const id = String(formData.get("id") || "");
  const to = String(formData.get("to") || "");
  if (!TASK_STATUSES.includes(to)) return { ok: false, error: "Unknown column." };

  const ctx = await loadActableTask(id);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me, task, tasks, privileged } = ctx;
  const from = task.status;
  const now = new Date();
  if (from === to) return { ok: true };

  const done = async (action, meta) => {
    await writeAudit({ actorId: me.id, action, targetType: "task", targetId: task._id, meta: { ...meta, via: "board" } });
    bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics", "/reports"]);
    return { ok: true };
  };

  if (to === "blocked") {
    return { ok: false, error: "Open the task to raise a blocker with a reason." };
  }
  if (from === "in_progress" && to === "in_review") {
    return { ok: false, error: "Open the task and log your hours to submit for review." };
  }

  const notifyOwners = (type, title, body) =>
    notifyUsers({
      userIds: [task.assigneeId, ...(task.collaboratorIds || [])].filter(Boolean).map(String),
      actorId: me.id,
      type,
      title,
      body,
      link: `/tasks/${id}`,
    });

  if (from === "blocked") {
    const back = task.statusBeforeBlock || "in_progress";
    await tasks.updateOne(
      { _id: task._id },
      {
        $set: { status: back, statusBeforeBlock: null, "blocker.active": false, "blocker.resolvedAt": now, updatedAt: now },
        $push: { "blocker.log": { at: now, by: oid(me.id), note: "Blocker resolved from the board" } },
      },
    );
    await notifyOwners("task.unblocked", `Unblocked: ${task.title}`);
    return done("task.blocker.resolve", { resumedAt: back });
  }

  if (to === "completed") {
    if (!privileged) return { ok: false, error: "Only an approver can complete a task. Request approval from the task." };
    await tasks.updateOne(
      { _id: task._id },
      {
        $set: {
          status: "completed", approval: "approved", approvedBy: oid(me.id),
          approvedAt: now, completedAt: now, updatedAt: now,
        },
      },
    );
    if (task.assigneeId) {
      await notifyUser({
        userId: task.assigneeId, actorId: me.id, type: "task.approved",
        title: `Approved: ${task.title}`, link: `/tasks/${id}`,
      });
    }
    return done("task.approve", { onTime: task.endDate ? now <= new Date(task.endDate) : true });
  }

  if (from === "completed") {
    if (!privileged) return { ok: false, error: "Only an approver can reopen a completed task." };
    const status = to === "in_review" ? "in_review" : to === "open" ? "open" : "in_progress";
    await tasks.updateOne(
      { _id: task._id },
      { $set: { status, approval: "none", completedAt: null, overdueNotifiedAt: null, updatedAt: now } },
    );
    if (task.assigneeId) {
      await notifyUser({
        userId: task.assigneeId, actorId: me.id, type: "task.reopened",
        title: `Reopened: ${task.title}`, link: `/tasks/${id}`,
      });
    }
    return done("task.reopen", { to: status });
  }

  const NORMAL = {
    open: ["in_progress"],
    in_progress: ["open", "in_review"],
    in_review: ["open", "in_progress"],
  };
  if (!(NORMAL[from] || []).includes(to)) {
    return { ok: false, error: `Can't move from ${from} to ${to}.` };
  }
  const patch = { status: to, updatedAt: now };
  if (to === "in_progress" || to === "open") patch.approval = "none";
  await tasks.updateOne({ _id: task._id }, { $set: patch });
  return done("task.transition", { from, to });
}

export async function deleteTask(_prev, formData) {
  const actor = await assertPermission("task:delete");
  const id = String(formData.get("id") || "");
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };
  await tasks.deleteOne({ _id: task._id });
  await writeAudit({ actorId: actor.id, action: "task.delete", targetType: "task", targetId: task._id, meta: { title: task.title } });
  bump(["/tasks", `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true, redirect: `/projects/${task.projectId}` };
}
