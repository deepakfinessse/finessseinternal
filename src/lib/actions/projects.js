"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { baseUrl } from "@/lib/base-url";
import { notifyUsers, notifyUser } from "@/lib/notifications";
import { PROJECT_STATUSES } from "@/lib/pm-constants";
import { teamIds as knownTeamIds } from "@/lib/teams";
import { nextProjectNumber } from "@/lib/pm-ids";

const oid = (id) => new ObjectId(String(id));
const OWNER_ROLE_KEYS = ["manager", "admin", "super-admin"];

const ProjectInput = z.object({
  name: z.string().min(2).max(120),
  client: z.string().max(120).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  teamIds: z.array(z.string()).min(1, "Assign at least one team"),
  ownerId: z.string().optional().default(""),
});

async function assertKnownTeams(ids) {
  const known = await knownTeamIds();
  const unknown = ids.filter((id) => !known.includes(id));
  return unknown.length ? "One or more selected teams no longer exist." : null;
}

/**
 * Owner must be a manager or admin. Falls back to the acting admin/manager
 * themselves when no owner is picked, or the pick turns out ineligible.
 */
async function resolveOwner(ownerId, actor) {
  if (!ownerId || !ObjectId.isValid(ownerId)) return oid(actor.id);
  const { users, roles } = await collections();
  const u = await users.findOne({ _id: oid(ownerId), status: "active" });
  if (!u) return oid(actor.id);
  const roleDocs = await roles.find({ _id: { $in: (u.roleIds || []).map(oid) } }).toArray();
  const eligible = roleDocs.some((r) => OWNER_ROLE_KEYS.includes(r.key));
  return eligible ? u._id : oid(actor.id);
}

/** Union of active member user docs across a set of team ids. */
async function resolveTeamMembers(teamIdList) {
  if (!teamIdList.length) return [];
  const { teams, users } = await collections();
  const teamDocs = await teams.find({ _id: { $in: teamIdList.map(oid) } }).toArray();
  const memberIds = [...new Set(teamDocs.flatMap((t) => (t.memberIds || []).map(String)))];
  if (!memberIds.length) return [];
  return users.find({ _id: { $in: memberIds.map(oid) }, status: "active" }).toArray();
}

/** Emails + notifies newly assigned project members. Never throws into the caller. */
async function announceMembers({ members, project, actorId }) {
  if (!members.length) return;
  const link = `${await baseUrl()}/projects/${project.id}`;
  await notifyUsers({
    userIds: members.map((u) => String(u._id)),
    actorId,
    type: "project.assigned",
    title: `You were added to project: ${project.name}`,
    body: project.client ? `Client: ${project.client}` : "",
    link,
  });
  await Promise.all(
    members.map((u) =>
      sendMail({
        to: u.email,
        subject: `You've been added to project: ${project.name}`,
        text: `You've been added to the "${project.name}" project${
          project.client ? ` for ${project.client}` : ""
        } (${project.projectNumber}).\n\nView it: ${link}`,
        html: `<p>You've been added to the <strong>${project.name}</strong> project${
          project.client ? ` for ${project.client}` : ""
        } (${project.projectNumber}).</p><p><a href="${link}">Open the project</a>.</p>`,
      }),
    ),
  );
}

/** Tells a manager/admin they've been made the owner of a project. */
async function announceOwner({ ownerId, project, actorId }) {
  if (!ownerId || String(ownerId) === String(actorId)) return;
  const link = `${await baseUrl()}/projects/${project.id}`;
  await notifyUser({
    userId: String(ownerId),
    actorId,
    type: "project.owner_assigned",
    title: `You're now the owner of: ${project.name}`,
    body: project.client ? `Client: ${project.client}` : "",
    link,
  });
  const { users } = await collections();
  const u = await users.findOne({ _id: oid(ownerId) });
  if (!u) return;
  await sendMail({
    to: u.email,
    subject: `You're now the owner of: ${project.name}`,
    text: `You've been made the owner of the "${project.name}" project (${project.projectNumber}).\n\nView it: ${link}`,
    html: `<p>You've been made the owner of <strong>${project.name}</strong> (${project.projectNumber}).</p><p><a href="${link}">Open the project</a>.</p>`,
  });
}

export async function createProject(_prev, formData) {
  const actor = await assertPermission("project:create");
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    client: formData.get("client") || "",
    description: formData.get("description") || "",
    teamIds: formData.getAll("teamIds").map(String),
    ownerId: formData.get("ownerId") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const teamErr = await assertKnownTeams(parsed.data.teamIds);
  if (teamErr) return { ok: false, error: teamErr };
  const { name, client, description, teamIds, ownerId } = parsed.data;

  const [members, resolvedOwnerId] = await Promise.all([
    resolveTeamMembers(teamIds),
    resolveOwner(ownerId, actor),
  ]);
  const { projects } = await collections();
  const now = new Date();
  const projectNumber = await nextProjectNumber(name);
  const res = await projects.insertOne({
    name,
    client,
    description,
    teamIds: teamIds.map(oid),
    projectNumber,
    taskSeq: 0,
    status: "onboarding",
    ownerId: resolvedOwnerId,
    createdBy: oid(actor.id),
    createdAt: now,
    updatedAt: now,
    onboardedAt: null,
  });
  await writeAudit({
    actorId: actor.id,
    action: "project.create",
    targetType: "project",
    targetId: res.insertedId,
    meta: { name, projectNumber, teamIds, ownerId: String(resolvedOwnerId) },
  });
  const project = { id: String(res.insertedId), name, client, projectNumber };
  await announceMembers({ members, project, actorId: actor.id });
  await announceOwner({ ownerId: resolvedOwnerId, project, actorId: actor.id });
  revalidatePath("/projects");
  return { ok: true, id: String(res.insertedId), redirect: `/projects/${res.insertedId}` };
}

export async function updateProject(_prev, formData) {
  const actor = await assertPermission("project:update");
  const id = String(formData.get("id") || "");
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    client: formData.get("client") || "",
    description: formData.get("description") || "",
    teamIds: formData.getAll("teamIds").map(String),
    ownerId: formData.get("ownerId") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const teamErr = await assertKnownTeams(parsed.data.teamIds);
  if (teamErr) return { ok: false, error: teamErr };
  const { name, client, description, teamIds, ownerId } = parsed.data;

  const { projects } = await collections();
  const p = await projects.findOne({ _id: oid(id) });
  if (!p) return { ok: false, error: "Project not found." };

  const [beforeMembers, afterMembers, resolvedOwnerId] = await Promise.all([
    resolveTeamMembers((p.teamIds || []).map(String)),
    resolveTeamMembers(teamIds),
    resolveOwner(ownerId, actor),
  ]);
  const before = new Set(beforeMembers.map((u) => String(u._id)));
  const added = afterMembers.filter((u) => !before.has(String(u._id)));
  const ownerChanged = String(p.ownerId || "") !== String(resolvedOwnerId);

  await projects.updateOne(
    { _id: p._id },
    {
      $set: {
        name,
        client,
        description,
        teamIds: teamIds.map(oid),
        ownerId: resolvedOwnerId,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: actor.id,
    action: "project.update",
    targetType: "project",
    targetId: p._id,
    meta: { teamIds, ownerId: String(resolvedOwnerId) },
  });
  const project = { id, name, client, projectNumber: p.projectNumber };
  await announceMembers({ members: added, project, actorId: actor.id });
  if (ownerChanged) await announceOwner({ ownerId: resolvedOwnerId, project, actorId: actor.id });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

export async function setProjectStatus(_prev, formData) {
  const actor = await assertPermission("project:update");
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!PROJECT_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };

  const { projects } = await collections();
  const p = await projects.findOne({ _id: oid(id) });
  if (!p) return { ok: false, error: "Project not found." };

  const patch = { status, updatedAt: new Date() };
  if (status === "active" && !p.onboardedAt) patch.onboardedAt = new Date();

  await projects.updateOne({ _id: p._id }, { $set: patch });
  await writeAudit({
    actorId: actor.id,
    action: status === "active" && !p.onboardedAt ? "project.onboarded" : "project.status",
    targetType: "project",
    targetId: p._id,
    meta: { status },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}

export async function deleteProject(_prev, formData) {
  const actor = await assertPermission("project:delete");
  const id = String(formData.get("id") || "");
  const { projects, tasks } = await collections();
  const p = await projects.findOne({ _id: oid(id) });
  if (!p) return { ok: false, error: "Project not found." };

  const openTasks = await tasks.countDocuments({ projectId: p._id, status: { $ne: "completed" } });
  if (openTasks > 0) {
    return { ok: false, error: `${openTasks} task(s) are still open. Complete or move them first, or archive the project instead.` };
  }
  await tasks.deleteMany({ projectId: p._id });
  await projects.deleteOne({ _id: p._id });
  await writeAudit({
    actorId: actor.id,
    action: "project.delete",
    targetType: "project",
    targetId: p._id,
    meta: { name: p.name },
  });
  revalidatePath("/projects");
  return { ok: true, redirect: "/projects" };
}
