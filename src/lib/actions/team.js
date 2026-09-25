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
  // "YYYY-MM-DD" from <input type="date">, kept as a plain string so no
  // timezone can shift it onto the neighbouring day.
  dateOfBirth: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date of birth.")
    .refine((v) => {
      if (v === "") return true;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d <= new Date();
    }, "Date of birth must be a real date in the past."),
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
    dateOfBirth: formData.get("dateOfBirth") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const { users } = await collections();
  await users.updateOne(
    { _id: oid(targetId) },
    {
      $set: {
        name: parsed.data.name,
        title: parsed.data.title,
        phone: parsed.data.phone,
        dateOfBirth: parsed.data.dateOfBirth || null,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: isSelf ? "profile.self_update" : "profile.update",
    targetType: "user",
    targetId,
    meta: {},
  });
  revalidatePath(`/team/${targetId}`);
  revalidatePath("/team");
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * First-login profile setup (/complete-profile). Name, phone and date of birth
 * are required here; saving ticks the "profile" onboarding step, which lifts
 * the gate in the (app) layout and moves the user on to the next step.
 */
export async function completeMyProfile(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (me.status !== "active") return { ok: false, error: "Account not active." };

  const parsed = ProfileInput.safeParse({
    name: String(formData.get("name") || "").trim(),
    title: String(formData.get("title") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    dateOfBirth: formData.get("dateOfBirth") || "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const d = parsed.data;
  if (!d.name) return { ok: false, error: "Enter your full name." };
  if (!d.phone) return { ok: false, error: "Enter your phone number." };
  if (!/^[+\d][\d\s()-]{6,}$/.test(d.phone)) return { ok: false, error: "Enter a valid phone number." };
  if (!d.dateOfBirth) return { ok: false, error: "Enter your date of birth." };

  const { users, settings } = await collections();
  const cfg = await settings.findOne({ _id: "onboarding" });
  const done = new Set(me.onboarding?.stepsCompleted || []);
  done.add("profile");
  const complete = (cfg?.steps || []).every((s) => done.has(s.key));
  const now = new Date();

  await users.updateOne(
    { _id: oid(me.id) },
    {
      $set: {
        name: d.name,
        title: d.title,
        phone: d.phone,
        dateOfBirth: d.dateOfBirth,
        "onboarding.stepsCompleted": [...done],
        "onboarding.completedAt": complete ? now : null,
        updatedAt: now,
      },
    },
  );
  await writeAudit({
    actorId: me.id,
    action: "profile.first_setup",
    targetType: "user",
    targetId: me.id,
    meta: {},
  });
  revalidatePath("/", "layout");
  return { ok: true, redirect: complete ? "/dashboard" : "/welcome" };
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
