"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { PROJECT_STATUSES } from "@/lib/pm-constants";
import { divisionKeys } from "@/lib/divisions";

const oid = (id) => new ObjectId(String(id));

const ProjectInput = z.object({
  name: z.string().min(2).max(120),
  client: z.string().max(120).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  divisions: z.array(z.string()).min(1, "Assign at least one division"),
  clientVisible: z.boolean().optional().default(false),
});

async function assertKnownDivisions(keys) {
  const known = await divisionKeys();
  const unknown = keys.filter((k) => !known.includes(k));
  return unknown.length ? `Unknown division: ${unknown.join(", ")}` : null;
}

export async function createProject(_prev, formData) {
  const actor = await assertPermission("project:create");
  const parsed = ProjectInput.safeParse({
    name: formData.get("name"),
    client: formData.get("client") || "",
    description: formData.get("description") || "",
    divisions: formData.getAll("divisions").map(String),
    clientVisible: formData.get("clientVisible") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const divErr = await assertKnownDivisions(parsed.data.divisions);
  if (divErr) return { ok: false, error: divErr };
  const { projects } = await collections();
  const now = new Date();
  const res = await projects.insertOne({
    ...parsed.data,
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
    meta: { name: parsed.data.name, divisions: parsed.data.divisions },
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
    clientVisible: formData.get("clientVisible") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const divErr = await assertKnownDivisions(parsed.data.divisions);
  if (divErr) return { ok: false, error: divErr };
  const { projects } = await collections();
  const p = await projects.findOne({ _id: oid(id) });
  if (!p) return { ok: false, error: "Project not found." };

  await projects.updateOne(
    { _id: p._id },
    { $set: { ...parsed.data, updatedAt: new Date() } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "project.update",
    targetType: "project",
    targetId: p._id,
    meta: { divisions: parsed.data.divisions },
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
