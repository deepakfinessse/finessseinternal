import { writeAudit } from "./audit";
import { notifyUser } from "./notifications";

/**
 * Side effects when an invited user accepts and first signs in: record an
 * audit entry. Kept separate from auth.js to avoid a circular import.
 */
export async function applyOnboardingForUser(userId, invite) {
  await writeAudit({
    actorId: invite?.invitedBy || null,
    action: "onboarding.accepted",
    targetType: "user",
    targetId: userId,
    meta: { email: invite?.email },
  });

  if (invite?.invitedBy) {
    await notifyUser({
      userId: invite.invitedBy,
      type: "invite.accepted",
      title: `${invite.email} accepted your invitation`,
      link: "/onboarding",
    });
  }
}
