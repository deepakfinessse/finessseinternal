import Link from "next/link";
import { requireUser } from "@/lib/access";
import { countByStatus, listInvitations, listSessions, listVersions } from "@/lib/data";
import { listTasks, taskStats } from "@/lib/pm-data";
import { PageHeader, Card, Stat, LinkButton, Badge, relTime } from "@/components/ui";
import { TaskStatusBadge, OverdueTag, DivisionDot } from "@/components/pm-ui";

export const metadata = { title: "Pulse · Finessse" };

export default async function DashboardPage() {
  const user = await requireUser();
  const canTasks = user.can("task:read") || user.can("task:read:all");

  const [counts, pending, sessions, versions, tStats, myTasks] = await Promise.all([
    user.can("assignee:read") ? countByStatus() : null,
    user.can("assignee:invite") ? listInvitations({ status: "pending" }) : [],
    user.can("session:read") ? listSessions() : [],
    user.can("version:read") ? listVersions() : [],
    canTasks ? taskStats(user) : null,
    canTasks ? listTasks(user, {}) : [],
  ]);

  const activeSessions = sessions.filter((s) => !s.expired);
  const openMine = myTasks
    .filter((t) => t.status !== "completed")
    .sort((a, b) => (a.endDate || "9999").localeCompare(b.endDate || "9999"))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${(user.name || user.email).split(" ")[0]}`}
        description={user.roles.map((r) => r.name).join(", ") || "No role assigned"}
      />

      {tStats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Tasks" value={tStats.total} />
          <Stat label="In progress" value={tStats.in_progress} />
          <Stat label="In review" value={tStats.in_review} />
          <Stat label="Blocked" value={tStats.blocked} tone={tStats.blocked ? "warn" : undefined} />
          <Stat label="Overdue" value={tStats.overdue} tone={tStats.overdue ? "warn" : undefined} />
          <Stat label="Awaiting approval" value={tStats.awaitingApproval} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {canTasks && (
          <Card
            title="My open tasks"
            description="Soonest deadlines first."
            action={<LinkButton href="/tasks" variant="ghost">Board →</LinkButton>}
          >
            {openMine.length === 0 ? (
              <p className="text-[13px] text-dim">Nothing open right now.</p>
            ) : (
              <ul className="flex flex-col">
                {openMine.map((t) => (
                  <li key={t.id} className="border-b border-line py-2.5 last:border-0">
                    <Link href={`/tasks/${t.id}`} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <DivisionDot division={t.division} />
                        <span className="truncate text-[13px] font-medium">{t.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2.5 text-[12px] text-faint">
                        {t.overdue ? (
                          <OverdueTag show iso={t.endDate} />
                        ) : t.endDate ? (
                          new Date(t.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        ) : null}
                        <TaskStatusBadge status={t.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {counts && (
          <Card title="People" description="Workspace headcount by status.">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Active", counts.active],
                ["Invited", counts.invited + pending.length],
                ["Suspended", counts.suspended],
                ["Deactivated", counts.deactivated],
              ].map(([l, v]) => (
                <div key={l} className="rounded-[10px] border border-line bg-surface-2/50 px-3 py-2.5">
                  <div className="text-[20px] font-semibold leading-none">{v}</div>
                  <div className="mt-1 text-[11px] text-faint">{l}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {user.can("assignee:invite") && pending.length > 0 && (
          <Card
            title="Pending invitations"
            action={<LinkButton href="/onboarding" variant="ghost">Manage →</LinkButton>}
          >
            <ul className="flex flex-col">
              {pending.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                  <span className="truncate">{i.email}</span>
                  <Badge tone={i.emailDelivered === false ? "warn" : "pending"}>
                    {i.emailDelivered === false ? "email failed" : "pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {user.can("session:read") && (
          <Card
            title="Active sessions"
            description={`${activeSessions.length} across the workspace`}
            action={<LinkButton href="/sessions" variant="ghost">All →</LinkButton>}
          >
            <ul className="flex flex-col">
              {activeSessions.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                  <span className="min-w-0 truncate text-dim">
                    {s.user?.email || "unknown"} · {s.device}
                  </span>
                  <span className="text-[12px] text-faint">{relTime(s.lastSeenAt)}</span>
                </li>
              ))}
              {activeSessions.length === 0 && (
                <li className="py-2 text-[13px] text-dim">No active sessions.</li>
              )}
            </ul>
          </Card>
        )}

        {user.can("version:read") && versions.length > 0 && (
          <Card
            title="Release versions"
            action={
              user.can("version:manage") ? (
                <LinkButton href="/settings/versions" variant="ghost">Manage →</LinkButton>
              ) : null
            }
          >
            <ul className="flex flex-col">
              {versions.slice(0, 6).map((v) => (
                <li key={v.id} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0">
                  <span className="mono">
                    {v.version} <span className="text-faint">· {v.channel}</span>
                  </span>
                  <span className="text-[12px] text-faint">{v.assignedCount} assigned</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
