import { collections } from "./db";
import { writeAudit } from "./audit";

/**
 * Side effects when an invited user accepts and first signs in:
 * allocate the default active version (if any) and record an audit entry.
 * Kept separate from auth.js to avoid a circular import.
 */
export async function applyOnboardingForUser(userId, invite) {
  const { users, versions } = await collections();

  const patch = {};
  if (invite?.assignVersion) {
    patch.assignedVersion = invite.assignVersion;
  } else {
    const activeDefault = await versions.findOne({ isActive: true, isDefault: true });
    if (activeDefault) patch.assignedVersion = activeDefault.version;
  }
  if (Object.keys(patch).length) {
    await users.updateOne({ _id: userId }, { $set: patch });
  }

  await writeAudit({
    actorId: invite?.invitedBy || null,
    action: "onboarding.accepted",
    targetType: "user",
    targetId: userId,
    meta: { email: invite?.email, assignedVersion: patch.assignedVersion || null },
  });
}
