"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/access";
import { markRead, markAllRead } from "@/lib/notifications";

export async function markNotificationRead(_prev, formData) {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  await markRead(me.id, id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  await markAllRead(me.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
