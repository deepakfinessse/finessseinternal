import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { collections } from "./db";
import { permissionMatches } from "./rbac-catalog";

export class AccessError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "AccessError";
    this.code = "FORBIDDEN";
  }
}

function toObjectId(id) {
  return id instanceof ObjectId ? id : new ObjectId(String(id));
}

/** Resolve the granted permission strings (may contain wildcards) for role ids. */
export async function permissionsForRoleIds(roleIds = []) {
  if (!roleIds.length) return [];
  const { roles } = await collections();
  const docs = await roles
    .find({ _id: { $in: roleIds.map(toObjectId) } })
    .toArray();
  return [...new Set(docs.flatMap((r) => r.permissions || []))];
}

export function grants(grantedList, requiredKey) {
  return grantedList.some((g) => permissionMatches(g, requiredKey));
}

/**
 * The signed-in user as an app record with resolved roles + permissions.
 * `null` when there is no valid session.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { users, roles } = await collections();
  const user = await users.findOne({ _id: toObjectId(session.user.id) });
  if (!user) return null;

  const roleIds = (user.roleIds || []).map(toObjectId);
  const roleDocs = roleIds.length
    ? await roles.find({ _id: { $in: roleIds } }).sort({ priority: -1 }).toArray()
    : [];
  const permissions = [...new Set(roleDocs.flatMap((r) => r.permissions || []))];

  const onboarding = user.onboarding || { stepsCompleted: [], completedAt: null };

  // Fields are plain, JSON-safe values (no ObjectId / Date). `can()` is a
  // convenience method for SERVER code only — never pass this object straight to
  // a Client Component; use `plainUser()` for that.
  return {
    id: String(user._id),
    name: user.name || session.user.name || "",
    email: user.email,
    image: user.image || session.user.image || null,
    status: user.status || "active",
    title: user.title || "",
    phone: user.phone || "",
    timezone: user.timezone || "",
    skills: user.skills || [],
    settings: user.settings || {},
    assignedVersion: user.assignedVersion || null,
    onboarding: {
      stepsCompleted: onboarding.stepsCompleted || [],
      completedAt: onboarding.completedAt
        ? new Date(onboarding.completedAt).toISOString()
        : null,
    },
    invitedBy: user.invitedBy ? String(user.invitedBy) : null,
    createdAt: new Date(user.createdAt || user._id.getTimestamp()).toISOString(),
    roles: roleDocs.map((r) => ({
      id: String(r._id),
      key: r.key,
      name: r.name,
      priority: r.priority,
      isSystem: !!r.isSystem,
    })),
    roleKeys: roleDocs.map((r) => r.key),
    permissions,
    can(key) {
      return grants(permissions, key);
    },
  };
}

/** Strip the `can()` method → a fully serializable object for Client Components. */
export function plainUser(user) {
  if (!user) return null;
  const { can, ...rest } = user;
  return rest;
}

/** Redirect to sign-in if unauthenticated; bounce non-active accounts. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (user.status === "suspended" || user.status === "deactivated") {
    redirect("/suspended");
  }
  return user;
}

/** requireUser + a permission gate. Redirects to /403 when denied. */
export async function requirePermission(key) {
  const user = await requireUser();
  if (!user.can(key)) redirect("/403");
  return user;
}

/** For server actions / route handlers: throw AccessError instead of redirecting. */
export async function assertPermission(key) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new AccessError("You must be signed in.");
  }
  if (!user.can(key)) {
    throw new AccessError(`Missing permission: ${key}`);
  }
  return user;
}
