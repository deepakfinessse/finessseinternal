import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { listInvitations, listRoles } from "@/lib/data";
import { WORKSPACE_DOMAIN } from "@/auth";
import { Card, Badge, LinkButton, EmptyState, fmtDate, relTime } from "@/components/ui";
import { InviteForm, ResendButton, RevokeButton } from "./onboarding-forms";

export const metadata = { title: "Onboarding · Finessse" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const canInvite = user.can("assignee:invite");
  const canManage = user.can("onboarding:manage");
  if (!canInvite && !canManage) redirect("/403");

  const [invites, roles] = await Promise.all([listInvitations(), listRoles()]);
  const pending = invites.filter((i) => i.status === "pending");
  const history = invites.filter((i) => i.status !== "pending");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading">Assignee onboarding</h1>
          <p className="text-sm text-gray">
            Invite people, assign their starting roles, and track acceptance.
          </p>
        </div>
        {canManage && (
          <LinkButton href="/settings/onboarding" variant="secondary">
            Edit checklist
          </LinkButton>
        )}
      </div>

      {canInvite && (
        <Card title="Invite a new assignee" description="They receive an email with a secure link and sign in with Google Workspace SSO.">
          <InviteForm roles={roles} workspaceDomain={WORKSPACE_DOMAIN} />
        </Card>
      )}

      <Card title="Pending invitations" description={`${pending.length} awaiting first sign-in`}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending">All invitations have been accepted or expired.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-gray/15">
            {pending.map((i) => {
              const expired = i.expiresAt && new Date(i.expiresAt) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold">{i.email}</div>
                    <div className="text-xs text-gray">
                      {i.roles.map((r) => r.name).join(", ") || "no roles"} · invited {relTime(i.createdAt)}
                      {i.expiresAt && ` · ${expired ? "expired" : `expires ${fmtDate(i.expiresAt)}`}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={i.emailDelivered === false ? "expired" : expired ? "expired" : "pending"}>
                      {i.emailDelivered === false ? "email not sent" : expired ? "expired" : "pending"}
                    </Badge>
                    {canInvite && <ResendButton id={i.id} />}
                    {canInvite && <RevokeButton id={i.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="History">
          <ul className="flex flex-col divide-y divide-gray/15 text-sm">
            {history.slice(0, 30).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span>{i.email}</span>
                <span className="flex items-center gap-2 text-xs text-gray">
                  {i.acceptedAt ? `accepted ${fmtDate(i.acceptedAt)}` : fmtDate(i.createdAt)}
                  <Badge tone={i.status === "accepted" ? "accepted" : "revoked"}>{i.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
