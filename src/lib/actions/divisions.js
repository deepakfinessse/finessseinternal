"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { slugifyDivisionKey, invalidateDivisionsCache } from "@/lib/divisions";

const oid = (id) => new ObjectId(String(id));

const DivisionInput = z.object({
  label: z.string().min(2).max(60),
});

export async function createDivision(_prev, formData) {
  const actor = await assertPermission("division:manage");
  const parsed = DivisionInput.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { divisions } = await collections();
  const key = slugifyDivisionKey(parsed.data.label);
  if (!key) return { ok: false, error: "That name doesn't produce a usable key." };
  if (await divisions.findOne({ key })) {
    return { ok: false, error: `A division named "${parsed.data.label}" already exists.` };
  }
  const now = new Date();
  const count = await divisions.countDocuments();
  const res = await divisions.insertOne({
    key,
    label: parsed.data.label,
    order: count,
    createdAt: now,
    updatedAt: now,
  });
  invalidateDivisionsCache();
  await writeAudit({
    actorId: actor.id,
    action: "division.create",
    targetType: "division",
    targetId: res.insertedId,
    meta: { key, label: parsed.data.label },
  });
  revalidatePath("/settings/divisions");
  return { ok: true, id: String(res.insertedId) };
}

export async function updateDivision(_prev, formData) {
  const actor = await assertPermission("division:manage");
  const id = String(formData.get("id") || "");
  const parsed = DivisionInput.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { divisions } = await collections();
  const div = await divisions.findOne({ _id: oid(id) });
  if (!div) return { ok: false, error: "Division not found." };

  // The key stays stable once created — it's what projects/tasks reference —
  // only the display label can change.
  await divisions.updateOne(
    { _id: div._id },
    { $set: { label: parsed.data.label, updatedAt: new Date() } },
  );
  invalidateDivisionsCache();
  await writeAudit({
    actorId: actor.id,
    action: "division.update",
    targetType: "division",
    targetId: div._id,
    meta: { key: div.key, label: parsed.data.label },
  });
  revalidatePath("/settings/divisions");
  return { ok: true };
}

export async function deleteDivision(_prev, formData) {
  const actor = await assertPermission("division:manage");
  const id = String(formData.get("id") || "");
  const { divisions, projects, tasks } = await collections();
  const div = await divisions.findOne({ _id: oid(id) });
  if (!div) return { ok: false, error: "Division not found." };

  const [projectCount, taskCount] = await Promise.all([
    projects.countDocuments({ divisions: div.key }),
    tasks.countDocuments({ division: div.key }),
  ]);
  if (projectCount > 0 || taskCount > 0) {
    return {
      ok: false,
      error: `Still in use by ${projectCount} project(s) and ${taskCount} task(s). Reassign them first.`,
    };
  }

  await divisions.deleteOne({ _id: div._id });
  invalidateDivisionsCache();
  await writeAudit({
    actorId: actor.id,
    action: "division.delete",
    targetType: "division",
    targetId: div._id,
    meta: { key: div.key, label: div.label },
  });
  revalidatePath("/settings/divisions");
  return { ok: true };
}
