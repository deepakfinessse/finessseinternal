import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";
import { collections, ensureDbReady } from "@/lib/db";
import { applyOnboardingForUser } from "@/lib/onboarding-apply";

/**
 * Google Workspace domain allowed to sign in. Bare domain — matched against
 * Google's `hd` claim. Override with GOOGLE_WORKSPACE_DOMAIN.
 */
export const WORKSPACE_DOMAIN =
  process.env.GOOGLE_WORKSPACE_DOMAIN || "finessse.digital";

const BOOTSTRAP_EMAILS = (process.env.RBAC_BOOTSTRAP_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: MongoDBAdapter(getMongoClient, {
    databaseName: process.env.MONGODB_DB || "finesssepm",
  }),
  // Self-hosted (non-Vercel): trust the deployment host. Lock this down with
  // AUTH_URL in production.
  trustHost: true,
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        params: { hd: WORKSPACE_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ profile, user }) {
      if (profile?.email_verified !== true || profile?.hd !== WORKSPACE_DOMAIN) {
        return false;
      }
      await ensureDbReady();
      const { users, invitations } = await collections();
      const email = (profile.email || user?.email || "").toLowerCase();

      const existing = await users.findOne({ email });
      if (existing?.status === "deactivated" || existing?.status === "suspended") {
        return false;
      }
      if (existing) return true;

      // No account yet — only let them in if they're bootstrapping the workspace,
      // an allow-listed bootstrap admin, or holding a pending invitation.
      const isFirstEver = (await users.countDocuments()) === 0;
      if (isFirstEver || BOOTSTRAP_EMAILS.includes(email)) return true;

      const invite = await invitations.findOne({ email, status: "pending" });
      if (invite && (!invite.expiresAt || invite.expiresAt > new Date())) {
        return true;
      }
      return false;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      const { users } = await collections();
      const doc = await users
        .findOne({ _id: new ObjectId(String(user.id)) })
        .catch(() => null);
      session.user.status = doc?.status || "active";
      return session;
    },
  },
  events: {
    // Fires on every successful sign-in, after the adapter has upserted the user.
    async signIn({ user, profile }) {
      await ensureDbReady();
      const { users, invitations, roles } = await collections();
      const email = (user.email || profile?.email || "").toLowerCase();
      const doc = await users.findOne({ email });
      if (!doc) return;

      const patch = { updatedAt: new Date() };
      if (profile?.hd) patch.hd = profile.hd;

      const alreadyProvisioned = Array.isArray(doc.roleIds) && doc.roleIds.length;
      if (!alreadyProvisioned) {
        const totalUsers = await users.countDocuments();
        const isFirst = totalUsers === 1;
        const isBootstrap = BOOTSTRAP_EMAILS.includes(email);

        if (isFirst || isBootstrap) {
          const superRole = await roles.findOne({ key: "super-admin" });
          patch.roleIds = superRole ? [superRole._id] : [];
          patch.status = "active";
          patch.onboarding = {
            stepsCompleted: ["invited", "account", "role", "profile", "welcome"],
            completedAt: new Date(),
          };
        } else {
          const invite = await invitations.findOne({ email, status: "pending" });
          if (invite) {
            patch.roleIds = invite.roleIds || [];
            patch.status = "active";
            patch.invitedBy = invite.invitedBy || null;
            patch.title = invite.title || doc.title || "";
            patch.onboarding = {
              stepsCompleted: ["invited", "account"],
              completedAt: null,
            };
            await invitations.updateOne(
              { _id: invite._id },
              { $set: { status: "accepted", acceptedAt: new Date(), acceptedUserId: doc._id } },
            );
            await applyOnboardingForUser(doc._id, invite);
          } else {
            patch.status = doc.status || "active";
          }
        }
      } else if (doc.status === "invited") {
        patch.status = "active";
      }

      if (!doc.createdAt) patch.createdAt = doc._id.getTimestamp();
      await users.updateOne({ _id: doc._id }, { $set: patch });
    },
  },
});
