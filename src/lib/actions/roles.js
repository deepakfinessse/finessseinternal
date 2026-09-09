"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { PERMISSION_KEYS } from "@/lib/rbac-catalog";

const oid = (id) => new ObjectId(String(id));
const slug = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const validPerm = (p) =>
  p === "*" || PERMISSION_KEYS.includes(p) || (p.endsWith(":*") && PERMISSION_KEYS.some((k) => k.startsWith(p.slice(0, -1))));

const RoleInput = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(280).optional().default(""),
  priority: z.coerce.number().int().min(0).max(999).default(0),
  permissions: z.array(z.string()).default([]),
});

function parsePermissions(formData) {
  return formData.getAll("permissions").map(String).filter(Boolean);
}

export async function createRole(_prev, formData) {
  const actor = await assertPermission("role:create");
  const parsed = RoleInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    priority: formData.get("priority") || 0,
    permissions: parsePermissions(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const perms = [...new Set(parsed.data.permissions)].filter(validPerm);
  if (parsed.data.permissions.includes("*") && !actor.can("*")) {
    return { ok: false, error: "Only a Super Admin can grant the '*' permission." };
  }

  const { roles } = await collections();
  const key = slug(parsed.data.name) || `role-${Date.now()}`;
  if (await roles.findOne({ key })) {
    return { ok: false, error: `A role with key "${key}" already exists.` };
  }
  const now = new Date();
  const res = await roles.insertOne({
    key,
    name: parsed.data.name,
    description: parsed.data.description,
    priority: parsed.data.priority,
    permissions: perms,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit({
    actorId: actor.id,
    action: "role.create",
    targetType: "role",
    targetId: res.insertedId,
    meta: { key, permissions: perms },
  });
  revalidatePath("/settings/roles");
  return { ok: true, id: String(res.insertedId) };
}

export async function updateRole(_prev, formData) {
  const actor = await assertPermission("role:update");
  const id = String(formData.get("id") || "");
  const parsed = RoleInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    priority: formData.get("priority") || 0,
    permissions: parsePermissions(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { roles } = await collections();
  const role = await roles.findOne({ _id: oid(id) });
  if (!role) return { ok: false, error: "Role not found." };

  let perms = [...new Set(parsed.data.permissions)].filter(validPerm);
  if (role.key === "super-admin") {
    perms = ["*"]; // locked
  }
  if (perms.includes("*") && !actor.can("*")) {
    return { ok: false, error: "Only a Super Admin can grant the '*' permission." };
  }

  await roles.updateOne(
    { _id: role._id },
    {
      $set: {
        name: role.isSystem ? role.name : parsed.data.name,
        description: parsed.data.description,
        priority: role.key === "super-admin" ? 100 : parsed.data.priority,
        permissions: perms,
        updatedAt: new Date(),
      },
    },
  );
  await writeAudit({
    actorId: actor.id,
    action: "role.update",
    targetType: "role",
    targetId: role._id,
    meta: { key: role.key, permissions: perms },
  });
  revalidatePath("/settings/roles");
  revalidatePath(`/settings/roles/${id}`);
  return { ok: true };
}

export async function deleteRole(_prev, formData) {
  const actor = await assertPermission("role:delete");
  const id = String(formData.get("id") || "");
  const { roles, users } = await collections();
  const role = await roles.findOne({ _id: oid(id) });
  if (!role) return { ok: false, error: "Role not found." };
  if (role.isSystem) return { ok: false, error: "System roles can't be deleted." };

  const inUse = await users.countDocuments({ roleIds: role._id });
  if (inUse > 0) {
    return { ok: false, error: `${inUse} user(s) still have this role. Reassign them first.` };
  }
  await roles.deleteOne({ _id: role._id });
  await writeAudit({
    actorId: actor.id,
    action: "role.delete",
    targetType: "role",
    targetId: role._id,
    meta: { key: role.key },
  });
  revalidatePath("/settings/roles");
  return { ok: true };
}

export async function assignRoles(_prev, formData) {
  const actor = await assertPermission("role:assign");
  const userId = String(formData.get("userId") || "");
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  const { users, roles } = await collections();

  const target = await users.findOne({ _id: oid(userId) });
  if (!target) return { ok: false, error: "User not found." };

  const roleDocs = roleIds.length
    ? await roles.find({ _id: { $in: roleIds.map(oid) } }).toArray()
    : [];
  const grantsSuper = roleDocs.some((r) => (r.permissions || []).includes("*"));
  if (grantsSuper && !actor.can("*")) {
    return { ok: false, error: "Only a Super Admin can grant the Super Admin role." };
  }

  // Don't let the last Super Admin lose the role.
  const superRole = await roles.findOne({ key: "super-admin" });
  if (superRole) {
    const hadSuper = (target.roleIds || []).some((r) => String(r) === String(superRole._id));
    const keepsSuper = roleIds.some((r) => r === String(superRole._id));
    if (hadSuper && !keepsSuper) {
      const others = await users.countDocuments({
        _id: { $ne: target._id },
        roleIds: superRole._id,
        status: "active",
      });
      if (others === 0) {
        return { ok: false, error: "This is the last Super Admin — assign the role to someone else first." };
      }
    }
  }

  await users.updateOne(
    { _id: target._id },
    { $set: { roleIds: roleDocs.map((r) => r._id), updatedAt: new Date() } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "role.assign",
    targetType: "user",
    targetId: target._id,
    meta: { roles: roleDocs.map((r) => r.key) },
  });
  revalidatePath("/team");
  revalidatePath(`/team/${userId}`);
  return { ok: true };
}
