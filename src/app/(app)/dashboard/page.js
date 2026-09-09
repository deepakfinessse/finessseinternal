import { requireUser } from "@/lib/access";
import { countByStatus, listInvitations, listSessions, listVersions } from "@/lib/data";
import { Card, Stat, LinkButton, Badge, relTime } from "@/components/ui";

export const metadata = { title: "Dashboard · Finessse" };

export default async function DashboardPage() {
  const user = await requireUser();

  const [counts, pending, sessions, versions] = await Promise.all([
    user.can("assignee:read") ? countByStatus() : null,
    user.can("assignee:invite") ? listInvitations({ status: "pending" }) : [],
    user.can("session:read") ? listSessions() : [],
    user.can("version:read") ? listVersions() : [],
  ]);

  const activeSessions = sessions.filter((s) => !s.expired);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Welcome back, {user.name || user.email}</h1>
        <p className="text-sm text-gray">
          {user.roles.map((r) => r.name).join(", ") || "No role assigned"}
        </p>
      </div>

      {counts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active assignees" value={counts.active} />
          <Stat label="Invited / pending" value={counts.invited + pending.length} />
          <Stat label="Suspended" value={counts.suspended} />
          <Stat label="Deactivated" value={counts.deactivated} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {user.can("assignee:invite") && (
          <Card
            title="Pending invitations"
            description="People invited but not yet signed in."
            action={<LinkButton href="/onboarding" variant="secondary">Manage</LinkButton>}
          >
            {pending.length === 0 ? (
              <p className="text-sm text-gray">No pending invitations.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-gray/15">
                {pending.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{i.email}</span>
                    <Badge tone={i.emailDelivered === false ? "expired" : "pending"}>
                      {i.emailDelivered === false ? "email not sent" : "pending"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {user.can("session:read") && (
          <Card
            title="Active sessions"
            description={`${activeSessions.length} across the workspace`}
            action={<LinkButton href="/sessions" variant="secondary">View all</LinkButton>}
          >
            <ul className="flex flex-col divide-y divide-gray/15">
              {activeSessions.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {s.user?.email || "unknown"} · {s.device}
                  </span>
                  <span className="text-xs text-gray">{relTime(s.lastSeenAt)}</span>
                </li>
              ))}
              {activeSessions.length === 0 && (
                <li className="py-2 text-sm text-gray">No active sessions.</li>
              )}
            </ul>
          </Card>
        )}

        {user.can("version:read") && (
          <Card
            title="Release versions"
            description="Allocated software releases"
            action={
              user.can("version:manage") ? (
                <LinkButton href="/settings/versions" variant="secondary">Manage</LinkButton>
              ) : null
            }
          >
            {versions.length === 0 ? (
              <p className="text-sm text-gray">No versions defined yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-gray/15">
                {versions.slice(0, 6).map((v) => (
                  <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {v.version}{" "}
                      <span className="text-xs text-gray">({v.channel})</span>
                    </span>
                    <span className="text-xs text-gray">{v.assignedCount} assigned</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Your access" description="Effective permissions from your roles">
          {user.permissions.includes("*") ? (
            <p className="text-sm">Full access (Super Admin).</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {user.permissions.map((p) => (
                <code key={p} className="rounded bg-gray/15 px-1.5 py-0.5 text-xs">
                  {p}
                </code>
              ))}
              {user.permissions.length === 0 && (
                <p className="text-sm text-gray">No permissions granted.</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
