import { requirePermission } from "@/lib/access";
import { listSessions, listVersions } from "@/lib/data";
import { getCurrentSessionToken, APP_VERSION } from "@/lib/session-tracking";
import { Card, Badge, Stat, EmptyState, LinkButton, relTime, fmtDateTime } from "@/components/ui";
import { RevokeSessionButton } from "./revoke-button";

export const metadata = { title: "Sessions & Versions · Finessse" };

export default async function SessionsPage() {
  const user = await requirePermission("session:read");
  const canRevoke = user.can("session:revoke");

  const [sessions, versions, currentToken] = await Promise.all([
    listSessions(),
    user.can("version:read") ? listVersions() : [],
    getCurrentSessionToken(),
  ]);

  const active = sessions.filter((s) => !s.expired);
  const uniqueUsers = new Set(active.map((s) => s.userId)).size;
  const versionSpread = active.reduce((acc, s) => {
    const v = s.appVersion || "unknown";
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-heading">Sessions &amp; versions</h1>
        <p className="text-sm text-gray">
          Active user sessions, authorized devices, and allocated software release versions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active sessions" value={active.length} />
        <Stat label="Signed-in users" value={uniqueUsers} />
        <Stat label="Server version" value={APP_VERSION} />
      </div>

      <Card
        title="Active sessions"
        description="Every authorized device across the workspace."
      >
        {active.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray/20 text-left text-xs uppercase text-gray">
                  <th className="py-2 pr-3 font-semibold">User</th>
                  <th className="py-2 pr-3 font-semibold">Device</th>
                  <th className="py-2 pr-3 font-semibold">IP</th>
                  <th className="py-2 pr-3 font-semibold">App version</th>
                  <th className="py-2 pr-3 font-semibold">Last seen</th>
                  <th className="py-2 pr-3 font-semibold">Expires</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray/15">
                {active.map((s) => (
                  <tr key={s.id} className="hover:bg-gray/5">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold">{s.user?.name || s.user?.email || "unknown"}</div>
                      <div className="text-xs text-gray">{s.user?.email}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {s.device}
                      {s.sessionToken === currentToken && (
                        <span className="ml-1 text-xs text-primary">(you)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{s.ip || "—"}</td>
                    <td className="py-2.5 pr-3 text-xs">{s.appVersion || "—"}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray">{relTime(s.lastSeenAt)}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray">{fmtDateTime(s.expires)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      {canRevoke && s.sessionToken !== currentToken && (
                        <RevokeSessionButton id={s.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {user.can("version:read") && (
        <Card
          title="Release versions"
          description="Allocated software releases and how many assignees are on each."
          action={
            user.can("version:manage") ? (
              <LinkButton href="/settings/versions" variant="secondary">Manage versions</LinkButton>
            ) : null
          }
        >
          {versions.length === 0 ? (
            <EmptyState title="No versions defined">
              {user.can("version:manage") ? "Add one from Manage versions." : "Ask an admin to define release versions."}
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-gray/15 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-semibold">{v.version}</span>{" "}
                    <span className="text-xs text-gray">{v.channel}</span>
                    {v.isDefault && <Badge tone="active">default</Badge>}
                    {!v.isActive && <Badge tone="neutral">inactive</Badge>}
                  </span>
                  <span className="text-xs text-gray">
                    {v.assignedCount} assigned · live sessions: {versionSpread[v.version] || 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
