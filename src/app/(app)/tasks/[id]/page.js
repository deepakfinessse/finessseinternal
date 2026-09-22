import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/access";
import { getTask, getProject } from "@/lib/pm-data";
import { listUsers } from "@/lib/data";
import { listAudit } from "@/lib/audit";
import { STATUS_LABEL } from "@/lib/pm-constants";
import { Card, Badge, EmptyState, fmtDate, fmtDateTime, relTime } from "@/components/ui";
import {
  TaskStatusBadge,
  PriorityChip,
  OverdueTag,
  ApprovalChip,
  DivisionDot,
  taskCode,
} from "@/components/pm-ui";
import {
  LifecycleControls,
  TaskEditForm,
  ScheduleForm,
  AssignForm,
  RemoveUpdateButton,
  UpdateComposer,
  ClientVisibleToggle,
  DeleteTaskButton,
} from "../task-forms";

export const metadata = { title: "Task · Finessse" };

export default async function TaskDetailPage({ params }) {
  const { id } = await params;
  const user = await requireUser();

  const task = await getTask(user, id);
  if (!task) notFound();

  const canEdit = user.can("task:update");
  const canSchedule = user.can("task:schedule");
  const canAssign = user.can("task:assign");
  const canApprove = user.can("task:approve");
  const canDelete = user.can("task:delete");
  const canSeePeople = canEdit || canAssign;
  const isOwner =
    task.assignee?.id === user.id || task.collaborators.some((c) => c.id === user.id);
  // Notes & attachments: admins, plus the person the task is actually for.
  const canContribute = canEdit || isOwner;

  const [allPeople, project, activity] = await Promise.all([
    canSeePeople ? listUsers({ status: "active" }) : [],
    canSeePeople ? getProject(user, task.projectId) : null,
    user.can("audit:read")
      ? listAudit({ targetType: "task", targetId: id, limit: 40 })
      : [],
  ]);
  // Restrict to the project's assigned team — unless it has none yet, in
  // which case fall back to everyone so untriaged projects aren't a dead end.
  const people = project?.memberIds?.length
    ? allPeople.filter((u) => project.memberIds.includes(u.id))
    : allPeople;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/projects/${task.projectId}`}
          className="mono text-[11px] uppercase tracking-[0.1em] text-faint hover:text-text"
        >
          ← {task.project?.name || "Project"}
        </Link>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">{task.title}</h1>
          <span className="mono text-[11px] text-faint">{taskCode(task)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TaskStatusBadge status={task.status} />
          <PriorityChip priority={task.priority} />
          <ApprovalChip approval={task.approval} />
          <OverdueTag show={task.overdue && task.status !== "completed"} iso={task.endDate} />
          <Badge tone={task.clientVisible ? "accepted" : "neutral"}>
            {task.clientVisible ? "client-visible" : "internal"}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <DivisionDot division={task.division} />
            {task.divisionLabel}
          </span>
          <span>·</span>
          <span>
            {task.startDate ? `${fmtDate(task.startDate)} → ` : "due "}
            {fmtDate(task.endDate)}
          </span>
          {task.revisionCount > 0 && <span>· {task.revisionCount} revision(s)</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Description">
            {task.description ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{task.description}</p>
            ) : (
              <p className="text-[13px] text-dim">No description.</p>
            )}
          </Card>

          {task.approval === "rejected" && task.approvalNote && (
            <Card title="Revisions requested">
              <p className="whitespace-pre-wrap text-sm">{task.approvalNote}</p>
            </Card>
          )}

          <Card title="Updates" description="Messages and files, in one thread.">
            {task.updates.length === 0 ? (
              <p className="text-sm text-gray">No updates yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {task.updates.map((entry) => (
                  <li key={entry.id} className="text-[13px] leading-relaxed">
                    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                      <span className="font-semibold text-dim">{entry.by?.name || entry.by?.email || "Someone"}</span>
                      <span>·</span>
                      <span>{fmtDateTime(entry.at)}</span>
                      {(canEdit || entry.by?.id === user.id) && (
                        <RemoveUpdateButton taskId={task.id} updateId={entry.id} />
                      )}
                    </div>
                    {entry.text && <p className="whitespace-pre-wrap">{entry.text}</p>}
                    {entry.attachment && (
                      <a
                        href={entry.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex min-w-0 items-center gap-1 truncate text-primary hover:underline"
                      >
                        {entry.attachment.type === "gdoc" ? "📄" : "📎"} {entry.attachment.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canContribute && (
              <div className="mt-3 border-t border-gray/15 pt-3">
                <UpdateComposer taskId={task.id} />
              </div>
            )}
          </Card>

          {task.blocker && (
            <Card title="Blocker log" description={`${task.blocker.kind === "client_side" ? "Client-side" : "Internal"} · ${task.blocker.active ? "active" : "resolved"}`}>
              <p className="text-sm">{task.blocker.description}</p>
              <ul className="mt-3 flex flex-col gap-1.5 text-xs text-gray">
                {task.blocker.log.map((l, i) => (
                  <li key={i}>
                    <span className="text-foreground">{fmtDateTime(l.at)}</span>
                    {" · "}
                    {l.by?.name || l.by?.email || "Someone"} — {l.note}
                  </li>
                ))}
              </ul>
              {task.blocker.resolvedAt && (
                <p className="mt-2 text-xs text-primary">Resolved {fmtDateTime(task.blocker.resolvedAt)}</p>
              )}
            </Card>
          )}

          {user.can("audit:read") && (
            <Card title="Activity">
              {activity.length === 0 ? (
                <p className="text-sm text-gray">No recorded activity.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-gray/15 text-sm">
                  {activity.map((a) => (
                    <li key={String(a._id)} className="flex justify-between py-1.5">
                      <span><code className="text-xs">{a.action}</code></span>
                      <span className="text-xs text-gray">{relTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Lifecycle" description={STATUS_LABEL[task.status]}>
            <LifecycleControls task={task} canApprove={canApprove} />
          </Card>

          <Card title="People">
            <dl className="text-sm">
              <dt className="text-gray">Assignee (executor)</dt>
              <dd className="mb-2 font-semibold">
                {task.assignee?.name || task.assignee?.email || "Unassigned"}
              </dd>
              <dt className="text-gray">Collaborators (contributors)</dt>
              <dd>
                {task.collaborators.length
                  ? task.collaborators.map((c) => c.name || c.email).join(", ")
                  : "—"}
              </dd>
            </dl>
            {canAssign && (
              <div className="mt-3 border-t border-gray/15 pt-3">
                <AssignForm task={task} people={people} />
              </div>
            )}
          </Card>

          {canSchedule && (
            <Card title="Schedule" description="Admin-controlled dates.">
              <ScheduleForm task={task} />
            </Card>
          )}

          {canEdit && (
            <Card title="Edit task">
              <TaskEditForm task={task} people={people} />
              <div className="mt-3 border-t border-gray/15 pt-3">
                <ClientVisibleToggle task={task} />
              </div>
            </Card>
          )}

          {canDelete && (
            <Card title="Danger zone">
              <DeleteTaskButton id={task.id} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
