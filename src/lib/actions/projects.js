"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { baseUrl } from "@/lib/base-url";
import { notifyUsers } from "@/lib/notifications";
import { PROJECT_STATUSES } from "@/lib/pm-constants";
import { divisionKeys } from "@/lib/divisions";
import { nextProjectNumber } from "@/lib/pm-ids";

const oid = (id) => new ObjectId(String(id));

const ProjectInput = z.object({
  name: z.string().min(2).max(120),
  client: z.string().max(120).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  divisions: z.array(z.string()).min(1, "Assign at least one division"),
  memberIds: z.array(z.string()).optional().default([]),
  clientVisible: z.boolean().optional().default(false),
});

async function assertKnownDivisions(keys) {
  const known = await divisionKeys();
  const unknown = keys.filter((k) => !known.includes(k));
  return unknown.length ? `Unknown division: ${unknown.join(", ")}` : null;
}

/** Resolves submitted member ids to real, active users — silently drops the rest. */
async function resolveMembers(ids) {
  if (!ids.length) return [];
  const { users } = await collections();
  return users
    .find({ _id: { $in: ids.filter((id) => ObjectId.isValid(id)).map(oid) }, status: "active" })
    .toArray();
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

export async function createProject(_prev, formData) {
  const actor = await assertPermission("project:create");
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    client: formData.get("client") || "",
    description: formData.get("description") || "",
    divisions: formData.getAll("divisions").map(String),
    memberIds: formData.getAll("memberIds").map(String).filter(Boolean),
    clientVisible: formData.get("clientVisible") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const divErr = await assertKnownDivisions(parsed.data.divisions);
  if (divErr) return { ok: false, error: divErr };
  const { name, client, description, divisions, memberIds, clientVisible } = parsed.data;

  const members = await resolveMembers(memberIds);
  const { projects } = await collections();
  const now = new Date();
  const projectNumber = await nextProjectNumber(name);
  const res = await projects.insertOne({
    name,
    client,
    description,
    divisions,
    memberIds: members.map((u) => u._id),
    clientVisible,
    projectNumber,
    taskSeq: 0,
    status: "onboarding",
    ownerId: oid(actor.id),
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
    meta: { name, projectNumber, divisions, memberIds: members.map((u) => String(u._id)) },
  });
  await announceMembers({
    members,
    project: { id: String(res.insertedId), name, client, projectNumber },
    actorId: actor.id,
  });
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
    divisions: formData.getAll("divisions").map(String),
    memberIds: formData.getAll("memberIds").map(String).filter(Boolean),
    clientVisible: formData.get("clientVisible") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const divErr = await assertKnownDivisions(parsed.data.divisions);
  if (divErr) return { ok: false, error: divErr };
  const { name, client, description, divisions, memberIds, clientVisible } = parsed.data;

  const { projects } = await collections();
  const p = await projects.findOne({ _id: oid(id) });
  if (!p) return { ok: false, error: "Project not found." };

  const members = await resolveMembers(memberIds);
  const before = new Set((p.memberIds || []).map(String));
  const added = members.filter((u) => !before.has(String(u._id)));

  await projects.updateOne(
    { _id: p._id },
    {
      $set: {
        name,
        client,
        description,
        divisions,
        memberIds: members.map((u) => u._id),
        clientVisible,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: actor.id,
    action: "project.update",
    targetType: "project",
    targetId: p._id,
    meta: { divisions, memberIds: members.map((u) => String(u._id)) },
  });
  await announceMembers({
    members: added,
    project: { id, name, client, projectNumber: p.projectNumber },
    actorId: actor.id,
  });
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
