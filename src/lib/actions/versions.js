"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

const oid = (id) => new ObjectId(String(id));

const VersionInput = z.object({
  version: z.string().min(1).max(40).regex(/^[\w.\-+]+$/, "Use letters, digits, dot, dash"),
  channel: z.enum(["stable", "beta", "canary", "lts"]).default("stable"),
  notes: z.string().max(2000).optional().default(""),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
});

export async function createVersion(_prev, formData) {
  const actor = await assertPermission("version:manage");
  const parsed = VersionInput.safeParse({
    version: String(formData.get("version") || "").trim(),
    channel: formData.get("channel") || "stable",
    notes: formData.get("notes") || "",
    isActive: formData.get("isActive") === "on",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { versions } = await collections();
  if (await versions.findOne({ version: parsed.data.version })) {
    return { ok: false, error: "That version already exists." };
  }
  if (parsed.data.isDefault) {
    await versions.updateMany({}, { $set: { isDefault: false } });
  }
  const res = await versions.insertOne({
    ...parsed.data,
    releasedAt: new Date(),
    createdBy: actor.id,
  });
  await writeAudit({
    actorId: actor.id,
    action: "version.create",
    targetType: "version",
    targetId: res.insertedId,
    meta: { version: parsed.data.version, channel: parsed.data.channel },
  });
  revalidatePath("/sessions");
  revalidatePath("/settings/versions");
  return { ok: true, id: String(res.insertedId) };
}

export async function updateVersion(_prev, formData) {
  const actor = await assertPermission("version:manage");
  const id = String(formData.get("id") || "");
  const parsed = VersionInput.partial().safeParse({
    channel: formData.get("channel") || undefined,
    notes: formData.get("notes") ?? undefined,
    isActive: formData.has("isActive") ? formData.get("isActive") === "on" : undefined,
    isDefault: formData.has("isDefault") ? formData.get("isDefault") === "on" : undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { versions } = await collections();
  const v = await versions.findOne({ _id: oid(id) });
  if (!v) return { ok: false, error: "Version not found." };

  if (parsed.data.isDefault === true) {
    await versions.updateMany({ _id: { $ne: v._id } }, { $set: { isDefault: false } });
  }
  await versions.updateOne({ _id: v._id }, { $set: { ...parsed.data, updatedAt: new Date() } });
  await writeAudit({
    actorId: actor.id,
    action: "version.update",
    targetType: "version",
    targetId: v._id,
    meta: { version: v.version, changes: parsed.data },
  });
  revalidatePath("/settings/versions");
  revalidatePath("/sessions");
  return { ok: true };
}

export async function deleteVersion(_prev, formData) {
  const actor = await assertPermission("version:manage");
  const id = String(formData.get("id") || "");
  const { versions, users } = await collections();
  const v = await versions.findOne({ _id: oid(id) });
  if (!v) return { ok: false, error: "Version not found." };
  const assigned = await users.countDocuments({ assignedVersion: v.version });
  if (assigned > 0) {
    return { ok: false, error: `${assigned} user(s) are on this version. Reassign them first.` };
  }
  await versions.deleteOne({ _id: v._id });
  await writeAudit({
    actorId: actor.id,
    action: "version.delete",
    targetType: "version",
    targetId: v._id,
    meta: { version: v.version },
  });
  revalidatePath("/settings/versions");
  return { ok: true };
}

export async function assignVersion(_prev, formData) {
  const actor = await assertPermission("version:assign");
  const userId = String(formData.get("userId") || "");
  const version = String(formData.get("version") || "");

  const { users, versions } = await collections();
  const target = await users.findOne({ _id: oid(userId) });
  if (!target) return { ok: false, error: "User not found." };

  let value = null;
  if (version) {
    const v = await versions.findOne({ version });
    if (!v) return { ok: false, error: "Unknown version." };
    if (!v.isActive) return { ok: false, error: "That version is not active." };
    value = v.version;
  }
  await users.updateOne(
    { _id: target._id },
    { $set: { assignedVersion: value, updatedAt: new Date() } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "version.assign",
    targetType: "user",
    targetId: userId,
    meta: { version: value },
  });
  revalidatePath("/sessions");
  revalidatePath(`/team/${userId}`);
  return { ok: true };
}
