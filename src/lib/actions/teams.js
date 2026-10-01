"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { invalidateTeamsCache } from "@/lib/teams";

const oid = (id) => new ObjectId(String(id));

const TeamInput = z.object({
  name: z.string().min(2).max(60),
});

export async function createTeam(_prev, formData) {
  const actor = await assertPermission("team:manage");
  const parsed = TeamInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { teams } = await collections();
  if (await teams.findOne({ name: parsed.data.name })) {
    return { ok: false, error: `A team named "${parsed.data.name}" already exists.` };
  }
  const now = new Date();
  const count = await teams.countDocuments();
  const res = await teams.insertOne({
    name: parsed.data.name,
    memberIds: [],
    order: count,
    createdAt: now,
    updatedAt: now,
  });
  invalidateTeamsCache();
  await writeAudit({
    actorId: actor.id,
    action: "team.create",
    targetType: "team",
    targetId: res.insertedId,
    meta: { name: parsed.data.name },
  });
  revalidatePath("/settings/teams");
  return { ok: true, id: String(res.insertedId) };
}

export async function updateTeam(_prev, formData) {
  const actor = await assertPermission("team:manage");
  const id = String(formData.get("id") || "");
  const parsed = TeamInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { teams } = await collections();
  const team = await teams.findOne({ _id: oid(id) });
  if (!team) return { ok: false, error: "Team not found." };

  await teams.updateOne(
    { _id: team._id },
    { $set: { name: parsed.data.name, updatedAt: new Date() } },
  );
  invalidateTeamsCache();
  await writeAudit({
    actorId: actor.id,
    action: "team.update",
    targetType: "team",
    targetId: team._id,
    meta: { name: parsed.data.name },
  });
  revalidatePath("/settings/teams");
  return { ok: true };
}

export async function updateTeamMembers(_prev, formData) {
  const actor = await assertPermission("team:manage");
  const id = String(formData.get("id") || "");
  const memberIds = formData.getAll("memberIds").map(String).filter((v) => ObjectId.isValid(v));
  const { teams, users } = await collections();
  const team = await teams.findOne({ _id: oid(id) });
  if (!team) return { ok: false, error: "Team not found." };

  const memberDocs = memberIds.length
    ? await users.find({ _id: { $in: memberIds.map(oid) }, status: "active" }).toArray()
    : [];

  await teams.updateOne(
    { _id: team._id },
    { $set: { memberIds: memberDocs.map((u) => u._id), updatedAt: new Date() } },
  );
  invalidateTeamsCache();
  await writeAudit({
    actorId: actor.id,
    action: "team.members",
    targetType: "team",
    targetId: team._id,
    meta: { memberIds: memberDocs.map((u) => String(u._id)) },
  });
  revalidatePath("/settings/teams");
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteTeam(_prev, formData) {
  const actor = await assertPermission("team:manage");
  const id = String(formData.get("id") || "");
  const { teams, projects, tasks } = await collections();
  const team = await teams.findOne({ _id: oid(id) });
  if (!team) return { ok: false, error: "Team not found." };

  const [projectCount, taskCount] = await Promise.all([
    projects.countDocuments({ teamIds: team._id }),
    tasks.countDocuments({ teamId: team._id }),
  ]);
  if (projectCount > 0 || taskCount > 0) {
    return {
      ok: false,
      error: `Still in use by ${projectCount} project(s) and ${taskCount} task(s). Reassign them first.`,
    };
  }

  await teams.deleteOne({ _id: team._id });
  invalidateTeamsCache();
  await writeAudit({
    actorId: actor.id,
    action: "team.delete",
    targetType: "team",
    targetId: team._id,
    meta: { name: team.name },
  });
  revalidatePath("/settings/teams");
  return { ok: true };
}
