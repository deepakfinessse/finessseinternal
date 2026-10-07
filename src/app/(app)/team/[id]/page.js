import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, getCurrentUser } from "@/lib/access";
import { getUser, listRoles, listSessions } from "@/lib/data";
import { teamIdsForUser } from "@/lib/teams";
import { listAudit } from "@/lib/audit";
import { Card, Badge, EmptyState, fmtDateTime, relTime } from "@/components/ui";
import {
  ProfileEditForm,
  RoleAssignForm,
  StatusForm,
} from "./profile-forms";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const p = await getUser(id).catch(() => null);
  return { title: `${p?.name || "Assignee"} · Finessse` };
}

export default async function AssigneeProfilePage({ params }) {
  const { id } = await params;
  const viewer = await requirePermission("assignee:read");
  const me = await getCurrentUser();

  let person;
  try {
    person = await getUser(id);
  } catch {
    notFound();
  }
  if (!person) notFound();

  // Same restriction as the directory list: a Manager/Assignee/Collaborator
  // can only open profiles on their own team (or their own profile).
  const canSeeAll = viewer.can("task:read:all") || viewer.can("*");
  if (!canSeeAll && me.id !== person.id) {
    const [myTeamIds, theirTeamIds] = await Promise.all([
      teamIdsForUser(me.id),
      teamIdsForUser(person.id),
    ]);
    if (!myTeamIds.some((t) => theirTeamIds.includes(t))) notFound();
  }

  const canEdit = viewer.can("assignee:update") || me.id === person.id;
  const canAssignRoles = viewer.can("role:assign");
  const canSuspend = viewer.can("assignee:suspend");
  const canDelete = viewer.can("assignee:delete");

  const [roles, sessions, audit] = await Promise.all([
    listRoles(),
    viewer.can("session:read") ? listSessions({ userId: id }) : [],
    viewer.can("audit:read") ? listAudit({ targetType: "user", targetId: id, limit: 20 }) : [],
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/team" className="text-sm text-gray hover:text-primary">
          ← Assignees
        </Link>
        <div className="mt-2 flex items-center gap-3">
          {person.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.image} alt="" className="h-12 w-12 rounded-full" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray/20 font-heading">
              {(person.name || person.email)[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-heading">{person.name || person.email}</h1>
            <p className="text-sm text-gray">
              {person.email} · joined {fmtDateTime(person.createdAt)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={person.status}>{person.status}</Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Profile" description="Individual information and contact.">
            <ProfileEditForm person={person} canEdit={canEdit} />
          </Card>

          {viewer.can("session:read") && (
            <Card
              title="Sessions & devices"
              description="Authorized devices and the software version each is running."
            >
              {sessions.length === 0 ? (
                <EmptyState title="No sessions">This assignee has not signed in.</EmptyState>
              ) : (
                <ul className="flex flex-col divide-y divide-gray/15 text-sm">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{s.device}</div>
                        <div className="text-xs text-gray">
                          {s.ip || "no ip"} · app v{s.appVersion || "?"} · seen {relTime(s.lastSeenAt)}
                        </div>
                      </div>
                      <Badge tone={s.expired ? "expired" : "active"}>
                        {s.expired ? "expired" : "active"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {viewer.can("audit:read") && audit.length > 0 && (
            <Card title="Recent activity">
              <ul className="flex flex-col divide-y divide-gray/15 text-sm">
                {audit.map((a) => (
                  <li key={String(a._id)} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {a.action}
                      <span className="ml-2 truncate text-xs text-gray">by {a.actorName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-gray">{relTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Roles" description="Grants effective permissions.">
            <RoleAssignForm person={person} roles={roles} canAssign={canAssignRoles} />
          </Card>

          <Card title="Operational status">
            <StatusForm person={person} canSuspend={canSuspend} canDelete={canDelete} />
          </Card>

          <Card title="Onboarding">
            <p className="text-sm">
              {person.onboarding?.completedAt
                ? `Completed ${fmtDateTime(person.onboarding.completedAt)}`
                : `${person.onboarding?.stepsCompleted?.length || 0} step(s) done`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(person.onboarding?.stepsCompleted || []).map((s) => (
                <span key={s} className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {s}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
