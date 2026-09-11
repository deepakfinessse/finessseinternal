"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { assertPermission, getCurrentUser } from "@/lib/access";
import { writeAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { WORKSPACE_DOMAIN } from "@/auth";

const oid = (id) => new ObjectId(String(id));
const INVITE_TTL_DAYS = 14;

async function baseUrl() {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

const InviteInput = z.object({
  email: z.string().email(),
  title: z.string().max(120).optional().default(""),
  roleIds: z.array(z.string()).min(1, "Pick at least one role"),
});

export async function createInvitation(_prev, formData) {
  const actor = await assertPermission("assignee:invite");
  const parsed = InviteInput.safeParse({
    email: String(formData.get("email") || "").toLowerCase().trim(),
    title: formData.get("title") || "",
    roleIds: formData.getAll("roleIds").map(String).filter(Boolean),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }
  const { email, title, roleIds } = parsed.data;

  const domain = email.split("@")[1];
  if (domain !== WORKSPACE_DOMAIN) {
    return { ok: false, error: `Email must be on @${WORKSPACE_DOMAIN}.` };
  }

  const { users, invitations, roles } = await collections();
  if (await users.findOne({ email })) {
    return { ok: false, error: "That person already has an account." };
  }

  const roleDocs = await roles.find({ _id: { $in: roleIds.map(oid) } }).toArray();
  if (!roleDocs.length) return { ok: false, error: "Selected roles no longer exist." };
  if (roleDocs.some((r) => (r.permissions || []).includes("*")) && !actor.can("*")) {
    return { ok: false, error: "Only a Super Admin can invite someone as Super Admin." };
  }

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 864e5);

  await invitations.updateOne(
    { email, status: "pending" },
    { $set: { status: "superseded", supersededAt: now } },
  );

  const res = await invitations.insertOne({
    email,
    title,
    roleIds: roleDocs.map((r) => r._id),
    token,
    status: "pending",
    invitedBy: actor.id,
    createdAt: now,
    expiresAt,
  });

  const link = `${await baseUrl()}/join/${token}`;
  const mail = await sendMail({
    to: email,
    subject: "You're invited to Finessse",
    text: `You've been invited to join the Finessse workspace as ${roleDocs
      .map((r) => r.name)
      .join(", ")}.\n\nAccept your invite and sign in with your @${WORKSPACE_DOMAIN} Google account:\n${link}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>You've been invited to join the <strong>Finessse</strong> workspace as ${roleDocs
      .map((r) => r.name)
      .join(", ")}.</p><p><a href="${link}">Accept your invitation</a> and sign in with your @${WORKSPACE_DOMAIN} Google account.</p><p style="color:#707070">This link expires in ${INVITE_TTL_DAYS} days.</p>`,
  });

  await invitations.updateOne(
    { _id: res.insertedId },
    { $set: { emailDelivered: mail.delivered } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "invite.create",
    targetType: "invitation",
    targetId: res.insertedId,
    meta: { email, roles: roleDocs.map((r) => r.key), emailDelivered: mail.delivered },
  });

  revalidatePath("/onboarding");
  revalidatePath("/team");
  return {
    ok: true,
    id: String(res.insertedId),
    link,
    emailDelivered: mail.delivered,
  };
}

export async function resendInvitation(_prev, formData) {
  const actor = await assertPermission("assignee:invite");
  const id = String(formData.get("id") || "");
  const { invitations, roles } = await collections();
  const invite = await invitations.findOne({ _id: oid(id) });
  if (!invite || invite.status !== "pending") {
    return { ok: false, error: "Invitation is not pending." };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 864e5);
  await invitations.updateOne({ _id: invite._id }, { $set: { expiresAt } });

  const roleDocs = await roles.find({ _id: { $in: invite.roleIds || [] } }).toArray();
  const link = `${await baseUrl()}/join/${invite.token}`;
  const mail = await sendMail({
    to: invite.email,
    subject: "Your Finessse invitation (reminder)",
    text: `Reminder: accept your invite to the Finessse workspace as ${roleDocs
      .map((r) => r.name)
      .join(", ")}.\n${link}\nExpires in ${INVITE_TTL_DAYS} days.`,
  });
  await invitations.updateOne(
    { _id: invite._id },
    { $set: { emailDelivered: mail.delivered } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "invite.resend",
    targetType: "invitation",
    targetId: invite._id,
    meta: { email: invite.email },
  });
  revalidatePath("/onboarding");
  return { ok: true, link, emailDelivered: mail.delivered };
}

export async function revokeInvitation(_prev, formData) {
  const actor = await assertPermission("assignee:invite");
  const id = String(formData.get("id") || "");
  const { invitations } = await collections();
  const invite = await invitations.findOne({ _id: oid(id) });
  if (!invite) return { ok: false, error: "Invitation not found." };
  await invitations.updateOne(
    { _id: invite._id },
    { $set: { status: "revoked", revokedAt: new Date() } },
  );
  await writeAudit({
    actorId: actor.id,
    action: "invite.revoke",
    targetType: "invitation",
    targetId: invite._id,
    meta: { email: invite.email },
  });
  revalidatePath("/onboarding");
  return { ok: true };
}

const StepSchema = z.object({
  key: z.string().min(1).max(40),
  title: z.string().min(2).max(120),
  description: z.string().max(280).optional().default(""),
  url: z.string().max(300).optional().default(""),
  auto: z.boolean().optional().default(false),
});

export async function updateOnboardingConfig(_prev, formData) {
  const actor = await assertPermission("onboarding:manage");
  let steps;
  try {
    steps = z.array(StepSchema).min(1).parse(JSON.parse(String(formData.get("steps") || "[]")));
  } catch (err) {
    return { ok: false, error: "Steps payload is invalid." };
  }
  const { settings } = await collections();
  await settings.updateOne(
    { _id: "onboarding" },
    { $set: { steps, updatedAt: new Date() } },
    { upsert: true },
  );
  await writeAudit({
    actorId: actor.id,
    action: "onboarding.config",
    targetType: "settings",
    targetId: "onboarding",
    meta: { stepCount: steps.length },
  });
  revalidatePath("/onboarding");
  revalidatePath("/settings/onboarding");
  return { ok: true };
}

/** A new member ticking off their own checklist item. */
export async function completeOnboardingStep(_prev, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const step = String(formData.get("step") || "");
  if (!step) return { ok: false, error: "Missing step." };

  const { users, settings } = await collections();
  const cfg = await settings.findOne({ _id: "onboarding" });
  const known = new Set((cfg?.steps || []).map((s) => s.key).concat("invited", "account"));
  if (!known.has(step)) return { ok: false, error: "Unknown step." };

  const done = new Set(user.onboarding?.stepsCompleted || []);
  done.add(step);
  const allKeys = (cfg?.steps || []).map((s) => s.key);
  const complete = allKeys.every((k) => done.has(k));

  await users.updateOne(
    { _id: oid(user.id) },
    {
      $set: {
        "onboarding.stepsCompleted": [...done],
        "onboarding.completedAt": complete ? new Date() : null,
        updatedAt: new Date(),
      },
    },
  );
  revalidatePath("/welcome");
  revalidatePath("/");
  return { ok: true, complete };
}
