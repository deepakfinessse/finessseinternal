import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, getCurrentUser } from "@/lib/access";
import { getProject, listTasks } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listDivisions } from "@/lib/divisions";
import { Card, Badge, Stat, EmptyState, LinkButton, AvatarStack, fmtDate, fmtDateTime } from "@/components/ui";
import { DivisionDot, TaskStatusBadge, PriorityChip, OverdueTag, taskCode } from "@/components/pm-ui";
import { ProjectForm, ProjectStatusForm, DeleteProjectButton } from "../project-forms";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const p = await getProject(user, id).catch(() => null);
  return { title: `${p?.name || "Project"} · Finessse` };
}

export default async function ProjectDetailPage({ params }) {
  const { id } = await params;
  const user = await requirePermission("project:read");

  const project = await getProject(user, id);
  if (!project) notFound();

  const canEdit = user.can("project:update");
  const canCreateTask = user.can("task:create");
  const canApprove = user.can("task:approve");

  const [tasks, divisions, people] = await Promise.all([
    listTasks(user, { projectId: id }),
    listDivisions(),
    canEdit && user.can("assignee:read") ? listUsers({ status: "active" }) : [],
  ]);

  // Time log, project-wide: every hour entry across the project's tasks —
  // `tasks` is already the full list here, since task:approve implies
  // task:read:all. Same audience as the per-task "Time logged" card.
  const timeLogEntries = canApprove
    ? tasks
        .flatMap((t) =>
          (t.timeLogs || []).map((l) => ({ ...l, taskId: t.id, taskTitle: t.title, taskCode: taskCode(t) })),
        )
        .sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt))
    : [];
  const totalProjectHours = timeLogEntries.reduce((sum, l) => sum + (l.hours || 0), 0);
  const hoursByPerson = new Map();
  for (const l of timeLogEntries) {
    const key = l.loggedBy?.id || "unknown";
    if (!hoursByPerson.has(key)) {
      hoursByPerson.set(key, { user: l.loggedBy || { id: "unknown", name: "Unknown" }, hours: 0 });
    }
    hoursByPerson.get(key).hours += l.hours || 0;
  }
  const hoursByPersonRows = [...hoursByPerson.values()].sort((a, b) => b.hours - a.hours);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/projects"
          className="mono text-[11px] uppercase tracking-[0.1em] text-faint hover:text-text"
        >
          ← Projects
        </Link>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">{project.name}</h1>
          {project.projectNumber && (
            <span className="mono text-[11px] text-faint">{project.projectNumber}</span>
          )}
          <Badge tone={project.status === "active" ? "active" : project.status === "onboarding" ? "pending" : "neutral"}>
            {project.status}
          </Badge>
          {project.clientVisible && <Badge tone="accepted">client-visible</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-faint">
          {project.client && <span>Client: {project.client}</span>}
          {project.client && project.divisions.length > 0 && <span>·</span>}
          {project.divisions.map((d, i) => (
            <span key={d} className="inline-flex items-center gap-1.5">
              <DivisionDot division={d} size={6} />
              {project.divisionLabels[i] || d}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Stat label="Tasks" value={project.taskCounts.total} />
        <Stat label="Open" value={project.taskCounts.open} />
        <Stat label="In progress" value={project.taskCounts.in_progress} />
        <Stat label="In review" value={project.taskCounts.in_review} />
        <Stat label="Blocked" value={project.taskCounts.blocked} />
        <Stat label="Overdue" value={project.taskCounts.overdue} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Tasks"
            description="Task entities and their lifecycle."
            action={
              canCreateTask ? (
                <LinkButton href={`/tasks/new?project=${project.id}`}>New task</LinkButton>
              ) : null
            }
          >
            {tasks.length === 0 ? (
              <EmptyState title="No tasks yet">
                {canCreateTask ? "Create the first task." : "Nothing assigned to you here."}
              </EmptyState>
            ) : (
              <ul className="flex flex-col">
                {tasks.map((t) => (
                  <li key={t.id} className="border-b border-line last:border-0">
                    <Link
                      href={`/tasks/${t.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 transition-colors hover:bg-surface-2/40"
                    >
                      <div className="min-w-0">
                        <span className="mono mr-1.5 text-[11px] text-faint">{taskCode(t)}</span>
                        <span className="text-[13px] font-medium">{t.title}</span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                          <span className="inline-flex items-center gap-1">
                            <DivisionDot division={t.division} size={6} />
                            {t.divisionLabel}
                          </span>
                          · {t.assignee?.name || t.assignee?.email || "unassigned"}
                          {t.endDate && ` · due ${fmtDate(t.endDate)}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <OverdueTag show={t.overdue && t.status !== "completed"} iso={t.endDate} />
                        <PriorityChip priority={t.priority} />
                        <TaskStatusBadge status={t.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {canEdit && (
            <Card title="Lifecycle">
              <ProjectStatusForm project={project} />
            </Card>
          )}

          {canApprove && (
            <Card title="Time log" description="Hours logged across this project's tasks.">
              {timeLogEntries.length === 0 ? (
                <p className="text-sm text-gray">No hours logged yet.</p>
              ) : (
                <>
                  <div className="mb-3 flex items-baseline gap-1.5">
                    <span className="text-[22px] font-semibold tabular-nums">{totalProjectHours}</span>
                    <span className="text-[13px] text-dim">hour{totalProjectHours === 1 ? "" : "s"} total</span>
                  </div>
                  <ul className="mb-3 flex flex-col gap-1.5 border-t border-gray/15 pt-3 text-sm">
                    {hoursByPersonRows.map((r) => (
                      <li key={r.user.id} className="flex items-center justify-between">
                        <span>{r.user.name || r.user.email || "Unknown"}</span>
                        <span className="mono font-semibold tabular-nums">{r.hours}h</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto border-t border-gray/15 pt-3 text-xs text-gray">
                    {timeLogEntries.map((l, i) => (
                      <li key={i}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {l.taskCode} · {l.taskTitle}
                          </span>
                          <span className="mono font-semibold">{l.hours}h</span>
                        </div>
                        <div>
                          {l.loggedBy?.name || l.loggedBy?.email || "Someone"} · {fmtDateTime(l.loggedAt)}
                          {l.note && ` · ${l.note}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          <Card title="Team" description="People assigned to this project.">
            {project.members.length === 0 ? (
              <p className="text-sm text-gray">No one assigned yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <AvatarStack people={project.members} size={22} />
                <ul className="text-[13px] text-dim">
                  {project.members.map((m) => (
                    <li key={m.id}>{m.name || m.email}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          {canEdit && (
            <Card title="Edit project">
              <ProjectForm project={project} divisions={divisions} people={people} />
            </Card>
          )}
          {user.can("project:delete") && (
            <Card title="Danger zone" description="Deletes the project and its completed tasks.">
              <DeleteProjectButton id={project.id} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
