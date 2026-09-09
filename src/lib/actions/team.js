"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/access";
import { writeAudit } from "@/lib/audit";

const oid = (id) => new ObjectId(String(id));

const ProfileInput = z.object({
  name: z.string().min(1).max(120),
  title: z.string().max(120).optional().default(""),
  phone: z.string().max(40).optional().default(""),
  timezone: z.string().max(60).optional().default(""),
  skills: z.string().max(600).optional().default(""),
});

export async function updateProfile(_prev, formData) {
  const targetId = String(formData.get("userId") || "");
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const isSelf = me.id === targetId;
  if (!isSelf) await assertPermission("assignee:update");
  else if (me.status !== "active") return { ok: false, error: "Account not active." };

  const parsed = ProfileInput.safeParse({
    name: formData.get("name"),
    title: formData.get("title") || "",
    phone: formData.get("phone") || "",
    timezone: formData.get("timezone") || "",
    skills: formData.get("skills") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const skills = [
    ...new Set(
      parsed.data.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 40);

  const { users } = await collections();
  await users.updateOne(
    { _id: oid(targetId) },
    {
      $set: {
        name: parsed.data.name,
        title: parsed.data.title,
        phone: parsed.data.phone,
        timezone: parsed.data.timezone,
        skills,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: isSelf ? "profile.self_update" : "profile.update",
    targetType: "user",
    targetId,
    meta: { skills },
  });
  revalidatePath(`/team/${targetId}`);
  revalidatePath("/team");
  revalidatePath("/profile");
  return { ok: true };
}

export async function updateOwnSettings(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const settings = {
    emailNotifications: formData.get("emailNotifications") === "on",
    weeklyDigest: formData.get("weeklyDigest") === "on",
    density: ["comfortable", "compact"].includes(String(formData.get("density")))
      ? String(formData.get("density"))
      : "comfortable",
  };
  const { users } = await collections();
  await users.updateOne(
    { _id: oid(me.id) },
    { $set: { settings, updatedAt: new Date() } },
  );
  revalidatePath("/profile");
  return { ok: true };
}

const STATUSES = ["active", "suspended", "deactivated"];

export async function setUserStatus(_prev, formData) {
  const actor = await assertPermission("assignee:suspend");
  const targetId = String(formData.get("userId") || "");
  const status = String(formData.get("status") || "");
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status." };
  if (actor.id === targetId) return { ok: false, error: "You can't change your own status." };

  const { users, roles, sessions } = await collections();
  const target = await users.findOne({ _id: oid(targetId) });
  if (!target) return { ok: false, error: "User not found." };

  const superRole = await roles.findOne({ key: "super-admin" });
  if (superRole && status !== "active") {
    const isSuper = (target.roleIds || []).some((r) => String(r) === String(superRole._id));
    if (isSuper) {
      const otherActiveSupers = await users.countDocuments({
        _id: { $ne: target._id },
        roleIds: superRole._id,
        status: "active",
      });
      if (otherActiveSupers === 0) {
        return { ok: false, error: "Can't suspend the last active Super Admin." };
      }
    }
  }

  await users.updateOne(
    { _id: target._id },
    { $set: { status, updatedAt: new Date() } },
  );
  if (status !== "active") {
    await sessions.deleteMany({ userId: target._id }); // force sign-out
  }
  await writeAudit({
    actorId: actor.id,
    action: "user.status",
    targetType: "user",
    targetId,
    meta: { status },
  });
  revalidatePath("/team");
  revalidatePath(`/team/${targetId}`);
  return { ok: true };
}

export async function deleteUser(_prev, formData) {
  const actor = await assertPermission("assignee:delete");
  const targetId = String(formData.get("userId") || "");
  if (actor.id === targetId) return { ok: false, error: "You can't delete yourself." };

  const { users, roles, sessions, accounts } = await collections();
  const target = await users.findOne({ _id: oid(targetId) });
  if (!target) return { ok: false, error: "User not found." };

  const superRole = await roles.findOne({ key: "super-admin" });
  if (superRole) {
    const isSuper = (target.roleIds || []).some((r) => String(r) === String(superRole._id));
    if (isSuper) {
      const others = await users.countDocuments({
        _id: { $ne: target._id },
        roleIds: superRole._id,
      });
      if (others === 0) return { ok: false, error: "Can't delete the last Super Admin." };
    }
  }

  await Promise.all([
    users.deleteOne({ _id: target._id }),
    sessions.deleteMany({ userId: target._id }),
    accounts.deleteMany({ userId: target._id }),
  ]);
  await writeAudit({
    actorId: actor.id,
    action: "user.delete",
    targetType: "user",
    targetId,
    meta: { email: target.email },
  });
  revalidatePath("/team");
  return { ok: true, redirect: "/team" };
}
