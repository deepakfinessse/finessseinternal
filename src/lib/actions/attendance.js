"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { WORK_MODE_KEYS } from "@/lib/attendance-constants";

const oid = (id) => new ObjectId(String(id));

async function requireActiveUser() {
  const me = await getCurrentUser();
  if (!me || me.status !== "active" || !me.can("attendance:track")) {
    return { error: "Not signed in." };
  }
  return { me };
}

async function openSession(userId, attendance) {
  return attendance.findOne({ userId: oid(userId), status: { $in: ["running", "paused"] } });
}

/** `workMode` is "active" (in office) or "wfh" — asked for at every clock-in. */
export async function clockIn(workMode) {
  if (!WORK_MODE_KEYS.includes(workMode)) {
    return { ok: false, error: "Choose Active or Work from home." };
  }
  const ctx = await requireActiveUser();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me } = ctx;
  const { attendance } = await collections();

  const existing = await openSession(me.id, attendance);
  if (existing) return { ok: false, error: "Already clocked in." };

  const now = new Date();
  await attendance.insertOne({
    userId: oid(me.id),
    workMode,
    status: "running",
    segments: [{ start: now, end: null }],
    startedAt: now,
    stoppedAt: null,
    totalMs: 0,
    createdAt: now,
    updatedAt: now,
  });
  await writeAudit({ actorId: me.id, action: "attendance.clock_in", targetType: "attendance", targetId: me.id, meta: { workMode } });
  revalidatePath("/attendance");
  return { ok: true };
}

export async function pauseClock() {
  const ctx = await requireActiveUser();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me } = ctx;
  const { attendance } = await collections();

  const doc = await openSession(me.id, attendance);
  if (!doc || doc.status !== "running") return { ok: false, error: "Not currently clocked in." };

  const now = new Date();
  const segments = [...doc.segments];
  const last = segments[segments.length - 1];
  const addedMs = now.getTime() - new Date(last.start).getTime();
  segments[segments.length - 1] = { ...last, end: now };

  await attendance.updateOne(
    { _id: doc._id },
    { $set: { segments, status: "paused", totalMs: doc.totalMs + addedMs, updatedAt: now } },
  );
  revalidatePath("/attendance");
  return { ok: true };
}

export async function resumeClock() {
  const ctx = await requireActiveUser();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me } = ctx;
  const { attendance } = await collections();

  const doc = await openSession(me.id, attendance);
  if (!doc || doc.status !== "paused") return { ok: false, error: "Not currently paused." };

  const now = new Date();
  await attendance.updateOne(
    { _id: doc._id },
    { $push: { segments: { start: now, end: null } }, $set: { status: "running", updatedAt: now } },
  );
  revalidatePath("/attendance");
  return { ok: true };
}

export async function clockOut() {
  const ctx = await requireActiveUser();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { me } = ctx;
  const { attendance } = await collections();

  const doc = await openSession(me.id, attendance);
  if (!doc) return { ok: false, error: "Not currently clocked in." };

  const now = new Date();
  const segments = [...doc.segments];
  let totalMs = doc.totalMs;
  if (doc.status === "running") {
    const last = segments[segments.length - 1];
    totalMs += now.getTime() - new Date(last.start).getTime();
    segments[segments.length - 1] = { ...last, end: now };
  }

  await attendance.updateOne(
    { _id: doc._id },
    { $set: { segments, status: "stopped", stoppedAt: now, totalMs, updatedAt: now } },
  );
  await writeAudit({
    actorId: me.id,
    action: "attendance.clock_out",
    targetType: "attendance",
    targetId: me.id,
    meta: { totalMs },
  });
  revalidatePath("/attendance");
  return { ok: true };
}
