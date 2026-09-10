"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import {
  DIVISION_KEYS,
  PRIORITY_KEYS,
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

/* ------------------------------------------------------------------- create */

const TaskInput = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().default(""),
  division: z.enum(DIVISION_KEYS),
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

  const now = new Date();
  const res = await tasks.insertOne({
    projectId: project._id,
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
    attachments: [],
    blocker: null,
    completedAt: null,
    createdBy: oid(actor.id),
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit({
    actorId: actor.id,
    action: "task.create",
    targetType: "task",
    targetId: res.insertedId,
    meta: { title: d.title, project: project.name, division: d.division },
  });
  bump(["/tasks", `/projects/${d.projectId}`, "/analytics"]);
  return { ok: true, id: String(res.insertedId), redirect: `/tasks/${res.insertedId}` };
}

/* --------------------------------------------------------------- edit fields */

export async function updateTask(_prev, formData) {
  const actor = await assertPermission("task:update");
  const id = String(formData.get("id") || "");
  const { tasks } = await collections();
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
  if (formData.has("collaboratorIds")) {
    patch.collaboratorIds = formData.getAll("collaboratorIds").map(String).filter(Boolean).map(oid);
  }
  await tasks.updateOne({ _id: task._id }, { $set: patch });
  await writeAudit({ actorId: actor.id, action: "task.update", targetType: "task", targetId: task._id, meta: {} });
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
  const { tasks, users } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };
  if (assigneeId) {
    const u = await users.findOne({ _id: oid(assigneeId) });
    if (!u) return { ok: false, error: "User not found." };
    if (u.status !== "active") return { ok: false, error: "That user is not active." };
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

/* --------------------------------------------------------------- attachments */

export async function addAttachment(_prev, formData) {
  const actor = await assertPermission("task:update");
  const id = String(formData.get("id") || "");
  const parsed = z
    .object({
      type: z.enum(["file", "gdoc"]),
      label: z.string().min(1).max(200),
      url: z.string().url().max(1000),
    })
    .safeParse({
      type: formData.get("type") || "gdoc",
      label: formData.get("label"),
      url: formData.get("url"),
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message || "Invalid attachment" };

  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };

  const attachment = {
    id: randomUUID(),
    ...parsed.data,
    uploadedBy: oid(actor.id),
    uploadedAt: new Date(),
  };
  await tasks.updateOne(
    { _id: task._id },
    { $push: { attachments: attachment }, $set: { updatedAt: new Date() } },
  );
  await writeAudit({ actorId: actor.id, action: "task.attachment.add", targetType: "task", targetId: task._id, meta: { label: parsed.data.label } });
  bump([`/tasks/${id}`]);
  return { ok: true };
}

export async function removeAttachment(_prev, formData) {
  const actor = await assertPermission("task:update");
  const id = String(formData.get("id") || "");
  const attId = String(formData.get("attId") || "");
  const { tasks } = await collections();
  const task = await tasks.findOne({ _id: oid(id) });
  if (!task) return { ok: false, error: "Task not found." };
  await tasks.updateOne(
    { _id: task._id },
    { $pull: { attachments: { id: attId } }, $set: { updatedAt: new Date() } },
  );
  await writeAudit({ actorId: actor.id, action: "task.attachment.remove", targetType: "task", targetId: task._id, meta: { attId } });
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
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({ actorId: me.id, action: "task.reopen", targetType: "task", targetId: task._id, meta: {} });
  bump(["/tasks", `/tasks/${id}`, `/projects/${task.projectId}`, "/analytics"]);
  return { ok: true };
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
