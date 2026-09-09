"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { getCurrentUser, assertPermission } from "@/lib/access";
import { getCurrentSessionToken } from "@/lib/session-tracking";
import { writeAudit } from "@/lib/audit";

const oid = (id) => new ObjectId(String(id));

export async function revokeSession(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const id = String(formData.get("id") || "");

  const { sessions } = await collections();
  const target = await sessions.findOne({ _id: oid(id) });
  if (!target) return { ok: false, error: "Session not found." };

  const isOwn = String(target.userId) === me.id;
  if (!isOwn) await assertPermission("session:revoke");

  const currentToken = await getCurrentSessionToken();
  if (target.sessionToken === currentToken) {
    return { ok: false, error: "That's your current session — use Sign out instead." };
  }

  await sessions.deleteOne({ _id: target._id });
  await writeAudit({
    actorId: me.id,
    action: "session.revoke",
    targetType: "user",
    targetId: target.userId,
    meta: { sessionId: id, own: isOwn },
  });
  revalidatePath("/sessions");
  revalidatePath("/profile");
  return { ok: true };
}

export async function revokeAllOtherSessions(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const targetUserId = String(formData.get("userId") || me.id);

  if (targetUserId !== me.id) await assertPermission("session:revoke");

  const { sessions } = await collections();
  const currentToken = await getCurrentSessionToken();
  const filter = { userId: oid(targetUserId) };
  if (targetUserId === me.id && currentToken) {
    filter.sessionToken = { $ne: currentToken };
  }
  const res = await sessions.deleteMany(filter);
  await writeAudit({
    actorId: me.id,
    action: "session.revoke_all",
    targetType: "user",
    targetId: targetUserId,
    meta: { removed: res.deletedCount },
  });
  revalidatePath("/sessions");
  revalidatePath("/profile");
  return { ok: true, removed: res.deletedCount };
}
